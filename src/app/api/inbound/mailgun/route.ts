import { NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFromHeader, verifyMailgunSignature } from "@/lib/mailgun";
import { requireEnv } from "@/lib/env";
import { enrichCompany } from "@/lib/enrichment";
import { resolveContact } from "@/lib/contacts";
import { classifyEnquiry } from "@/lib/classification";

// node:crypto and the service_role key both require the Node runtime.
export const runtime = "nodejs";
// Never cache an inbound webhook.
export const dynamic = "force-dynamic";
// Enrichment runs in after() and keeps this invocation alive. A Claude call
// with web search takes 30-90s, well past the platform default. Hobby with
// Fluid compute allows up to 300s.
export const maxDuration = 300;

/**
 * Mailgun inbound route target.
 *
 * Contract with Mailgun:
 *  - The POST is multipart/form-data or x-www-form-urlencoded, NOT JSON.
 *  - Any non-2xx response is retried, with backoff, for hours.
 *
 * So this handler stays deliberately thin: verify, insert, return 200.
 * Company enrichment and priority classification are separate Claude calls
 * and are far too slow to run inline — they happen on their own path once
 * the row exists. Doing them here would push us past Mailgun's timeout and
 * trigger duplicate retries.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    // Malformed body. Retrying will not help, so 400 rather than 500.
    return NextResponse.json({ error: "expected form-encoded body" }, { status: 400 });
  }

  const field = (key: string): string | null => {
    const value = form.get(key);
    return typeof value === "string" ? value : null;
  };

  const verified = verifyMailgunSignature({
    timestamp: field("timestamp") ?? "",
    token: field("token") ?? "",
    signature: field("signature") ?? "",
    signingKey: requireEnv("MAILGUN_SIGNING_KEY"),
  });

  if (!verified.ok) {
    console.warn("[inbound] rejected unsigned request:", verified.reason);
    // 406 tells Mailgun not to retry. A 4xx retry storm on a request we will
    // never accept is pure noise.
    return NextResponse.json({ error: "invalid signature" }, { status: 406 });
  }

  // Prefer the From header (what a human typed) over the envelope sender.
  const parsed = parseFromHeader(field("from"));
  const senderEmail = parsed.email ?? field("sender")?.toLowerCase() ?? null;

  if (!senderEmail) {
    console.warn("[inbound] accepted but discarded: no sender address");
    return NextResponse.json({ ok: true, skipped: "no sender" }, { status: 200 });
  }

  // Keep every field verbatim, minus the auth triplet — those are spent and
  // storing them serves no purpose.
  const rawPayload: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (key === "signature" || key === "token" || key === "timestamp") continue;
    if (typeof value === "string") rawPayload[key] = value;
  }

  const supabase = createAdminClient();

  // If we BCC'd ourselves on a reply, this is our own outbound message, not a
  // new enquiry. Attach it to the contact it was addressed TO so the thread
  // shows both sides. Requires OWNER_EMAILS to be set; without it the feature
  // is simply off and replies are logged manually instead.
  const owners = (process.env.OWNER_EMAILS ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isOwnReply = owners.includes(senderEmail);

  if (isOwnReply) {
    const toHeader = field("To") ?? field("recipient") ?? "";
    const toEmail = parseFromHeader(toHeader).email;
    if (toEmail) {
      const { data: existing } = await createAdminClient()
        .from("contacts").select("id").eq("email", toEmail).maybeSingle();
      if (existing) {
        const admin = createAdminClient();
        const { data: reply, error: replyError } = await admin
          .from("enquiries")
          .insert({
            contact_id: existing.id,
            direction: "outbound",
            message_id: field("Message-Id") ?? field("message-id"),
            sender_email: senderEmail,
            sender_name: parsed.name,
            recipient: toEmail,
            subject: field("subject"),
            body_plain: field("stripped-text") ?? field("body-plain"),
            body_full: field("body-plain"),
            body_html: field("body-html"),
            raw_payload: rawPayload,
          })
          .select("id")
          .single();

        if (replyError?.code === "23505") {
          return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
        }
        console.log("[inbound] stored our own reply to", toEmail);
        if (reply) after(async () => { await classifyEnquiry(reply.id); });
        return NextResponse.json({ ok: true, id: reply?.id, direction: "outbound" }, { status: 200 });
      }
    }
  }

  // Resolve the company and contact this email belongs to before storing the
  // message. The relationship is the durable thing; the email is an event
  // against it.
  const { contactId, companyId, companyNeedsResearch } = await resolveContact({
    email: senderEmail,
    name: parsed.name,
    domain: senderEmail.split("@")[1]?.toLowerCase() ?? null,
  });

  const { data, error } = await supabase
    .from("enquiries")
    .insert({
      contact_id: contactId,
      message_id: field("Message-Id") ?? field("message-id"),
      sender_email: senderEmail,
      sender_name: parsed.name,
      recipient: field("recipient"),
      subject: field("subject"),
      body_plain: field("stripped-text") ?? field("body-plain"),
      // Stripped for the model, full for the reader.
      body_full: field("body-plain"),
      body_html: field("body-html"),
      raw_payload: rawPayload,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation on message_id. This is Mailgun redelivering
    // something we already stored, so it is a success from its point of view.
    // Returning an error would keep the retries coming forever.
    if (error.code === "23505") {
      console.log("[inbound] duplicate message_id, already stored");
      return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
    }
    console.error("[inbound] insert failed:", error.code, error.message);
    // A real failure. 500 makes Mailgun retry, which is what we want.
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  console.log("[inbound] stored enquiry", data.id, "from", senderEmail);

  // Enrichment runs after the response is sent. Mailgun gets its 200 straight
  // away and does not retry; the Claude calls happen on borrowed time.
  after(async () => {
    // Order matters: classification reads the company profile, so research
    // runs first. A failed research degrades the rating rather than breaking it.
    // Research only runs for a company we have not already profiled, so repeat
    // senders from a known employer cost nothing extra.
    if (companyId && companyNeedsResearch) {
      await enrichCompany(companyId);
    }
    await classifyEnquiry(data.id);
  });

  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}

/** Convenience: lets us confirm the route is deployed by hitting it in a browser. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "mailgun inbound", method: "POST" });
}
