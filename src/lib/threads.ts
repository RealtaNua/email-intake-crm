import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Whether a thread may be replied to by email.
 *
 * The seed contacts sit at real domains — grabtaxi.com, hubspot.com — and read
 * convincingly enough to click Send on by mistake. A thread earns the right to
 * be replied to by containing at least one message that genuinely passed
 * through Mailgun: an HMAC-verified inbound, or one we sent through the API.
 *
 * Read from the messages rather than a flag on the contact. Realness is a
 * property of what actually happened, and a column that a form or a model
 * could later write is not evidence of anything.
 */
export async function isRealThread(contactId: string): Promise<boolean> {
  const { count } = await createAdminClient()
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .eq("contact_id", contactId)
    .eq("verified_real", true);
  return (count ?? 0) > 0;
}
