"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichCompany } from "@/lib/enrichment";
import { classifyEnquiry } from "@/lib/classification";

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

/** Record a reply we sent, so the thread shows both sides. */
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
      sender_email: user.email ?? "me",
      sender_name: "Me",
      recipient: contact.email,
      subject,
      body_plain: body,
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

/** Free-text remarks. Human-written, never touched by the model. */
export async function saveRemarks(contactId: string, formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const remarks = String(formData.get("remarks") ?? "");
  const admin = createAdminClient();
  await admin.from("contacts").update({ remarks }).eq("id", contactId);

  revalidatePath(`/dashboard/${contactId}`);
}
