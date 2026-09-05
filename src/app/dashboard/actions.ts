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
