import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFromHeader, verifyMailgunSignature } from "@/lib/mailgun";
import { requireEnv } from "@/lib/env";

// node:crypto and the service_role key both require the Node runtime.
export const runtime = "nodejs";
// Never cache an inbound webhook.
export const dynamic = "force-dynamic";

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
  const { data, error } = await supabase
    .from("enquiries")
    .insert({
      message_id: field("Message-Id") ?? field("message-id"),
      sender_email: senderEmail,
      sender_name: parsed.name,
      recipient: field("recipient"),
      subject: field("subject"),
      body_plain: field("stripped-text") ?? field("body-plain"),
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
  return NextResponse.json({ ok: true, id: data.id }, { status: 200 });
}

/** Convenience: lets us confirm the route is deployed by hitting it in a browser. */
export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "mailgun inbound", method: "POST" });
}
