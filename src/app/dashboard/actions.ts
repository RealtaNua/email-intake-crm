"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichCompany } from "@/lib/enrichment";
import { classifyEnquiry } from "@/lib/classification";
import { sendReplyEmail, replyFromAddress } from "@/lib/mailgun";
import { replySubjectFor, DEMO_THREAD_MESSAGE } from "@/lib/types";
import { isRealThread } from "@/lib/threads";

/**
 * Re-run enrichment and classification for one enquiry.
 *
 * Exists because rows created before a processing step shipped stay stuck in
 * whatever state they were in, and because a transient failure (a capped day,
 * a timeout) otherwise leaves a record permanently blank with no way back.
 */
export async function reprocessContact(contactId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();

  const { data: contact } = await admin
    .from("contacts").select("id, company_id").eq("id", contactId).single();
  if (!contact) throw new Error("Contact not found");

  if (contact.company_id) {
    await admin
      .from("companies")
      .update({ enrichment_status: "pending", enrichment_error: null })
      .eq("id", contact.company_id);
    await enrichCompany(contact.company_id);
  }

  const { data: enquiries } = await admin
    .from("enquiries").select("id").eq("contact_id", contactId);

  for (const e of enquiries ?? []) {
    await admin.from("enquiries").update({ classification_status: "pending" }).eq("id", e.id);
    await classifyEnquiry(e.id);
  }

  revalidatePath(`/dashboard/${contactId}`);
  revalidatePath("/dashboard");
}

export async function reprocessEnquiry(enquiryId: string) {
  // Server actions are publicly callable endpoints. The auth check is not
  // optional — without it, anyone who can guess an id can spend Claude credit.
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  await admin
    .from("enquiries")
    .update({ classification_status: "pending" })
    .eq("id", enquiryId);

  await classifyEnquiry(enquiryId);

  revalidatePath(`/dashboard/${enquiryId}`);
  revalidatePath("/dashboard");
}

export type ReplyResult = { status: "idle" | "sent" | "error"; message?: string };

/**
 * Send a reply through Mailgun and record it.
 *
 * Order matters and is not interchangeable with logReply's. The mail goes out
 * first; only a send that actually succeeded gets a row. A record claiming we
 * replied when nothing left the building is worse than no record, because the
 * dashboard would then show the thread as handled.
 */
export async function sendReply(
  contactId: string,
  _prev: ReplyResult,
  formData: FormData,
): Promise<ReplyResult> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in." };

  const body = String(formData.get("body") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!body) return { status: "error", message: "Nothing to send." };

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts").select("email, name").eq("id", contactId).single();
  if (!contact) return { status: "error", message: "Contact not found." };

  // The seed contacts sit at real domains — grabtaxi.com, hubspot.com — and
  // read convincingly enough to click Send on by mistake. A thread earns the
  // right to be replied to by containing at least one message that genuinely
  // came through Mailgun. Checked here, on the server, because the composer's
  // own check is a courtesy and a server action is a public endpoint.
  if (!(await isRealThread(contactId))) {
    return { status: "error", message: DEMO_THREAD_MESSAGE };
  }

  // Thread against the most recent inbound message so the reply lands in the
  // same conversation in their mail client rather than as a fresh email.
  const { data: lastInbound } = await admin
    .from("enquiries")
    .select("message_id, subject")
    .eq("contact_id", contactId)
    .eq("direction", "inbound")
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const finalSubject = subject || replySubjectFor(lastInbound?.subject) || "(no subject)";

  let messageId: string | null = null;
  try {
    ({ messageId } = await sendReplyEmail({
      to: contact.name ? `${contact.name} <${contact.email}>` : contact.email,
      subject: finalSubject,
      text: body,
      inReplyTo: lastInbound?.message_id ?? null,
    }));
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Send failed.",
    };
  }

  const { data: reply, error: insertError } = await admin
    .from("enquiries")
    .insert({
      contact_id: contactId,
      direction: "outbound",
      origin: "crm",
      // Our own send, through Mailgun. Real by construction, and it keeps the
      // thread replyable once the contact answers.
      verified_real: true,
      // Mailgun's own id. If this reply is also BCC'd back to the intake
      // address, the unique index rejects the copy instead of double-posting.
      message_id: messageId,
      sender_email: replyFromAddress(),
      sender_name: "Me",
      recipient: contact.email,
      subject: finalSubject,
      body_plain: body,
      body_full: body,
      classification_status: "pending",
    })
    .select("id")
    .single();

  // The mail is already gone. A failed insert is a recording problem, not a
  // sending one, and saying "send failed" here would be a lie.
  if (insertError) {
    console.error("[reply] sent but not recorded:", insertError.message);
    return { status: "error", message: "Sent, but not recorded: " + insertError.message };
  }

  if (reply) await classifyEnquiry(reply.id);

  revalidatePath(`/dashboard/${contactId}`);
  revalidatePath("/dashboard");
  return { status: "sent" };
}

/** Record a reply sent elsewhere, so the thread shows both sides. */
export async function logReply(contactId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const body = String(formData.get("body") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim() || "(reply)";
  if (!body) return;

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts").select("email").eq("id", contactId).single();
  if (!contact) throw new Error("Contact not found");

  const { data: reply } = await admin
    .from("enquiries")
    .insert({
      contact_id: contactId,
      direction: "outbound",
      origin: "manual",
      sender_email: user.email ?? "me",
      sender_name: "Me",
      recipient: contact.email,
      subject,
      body_plain: body,
      body_full: body,
      classification_status: "pending",
    })
    .select("id")
    .single();

  // Re-read the thread so the conversation summary and status reflect the
  // reply. Without this the record still says they are waiting on us.
  if (reply) await classifyEnquiry(reply.id);

  revalidatePath(`/dashboard/${contactId}`);
  revalidatePath("/dashboard");
}

/** What the remarks form renders back to the user after a submit. */
export type RemarksResult = { status: "idle" | "saved" | "error"; message?: string };

/**
 * Free-text remarks. Human-written, never touched by the model.
 *
 * Returns a result rather than nothing: a write with no visible outcome is
 * indistinguishable from a write that silently failed, and the Supabase error
 * was previously discarded without anyone seeing it.
 */
export async function saveRemarks(
  contactId: string,
  _prev: RemarksResult,
  formData: FormData,
): Promise<RemarksResult> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Not signed in." };

  const remarks = String(formData.get("remarks") ?? "").trim();
  const admin = createAdminClient();
  const { error } = await admin
    .from("contacts")
    .update({ remarks: remarks || null })
    .eq("id", contactId);

  if (error) return { status: "error", message: error.message };

  revalidatePath(`/dashboard/${contactId}`);
  // The contact list carries a "Has remarks" badge off the same column.
  revalidatePath("/dashboard");
  return { status: "saved" };
}
