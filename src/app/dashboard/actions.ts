"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enrichEnquiry } from "@/lib/enrichment";
import { classifyEnquiry } from "@/lib/classification";

/**
 * Re-run enrichment and classification for one enquiry.
 *
 * Exists because rows created before a processing step shipped stay stuck in
 * whatever state they were in, and because a transient failure (a capped day,
 * a timeout) otherwise leaves a record permanently blank with no way back.
 */
export async function reprocessEnquiry(enquiryId: string) {
  // Server actions are publicly callable endpoints. The auth check is not
  // optional — without it, anyone who can guess an id can spend Claude credit.
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  await admin
    .from("enquiries")
    .update({
      enrichment_status: "pending",
      classification_status: "pending",
      enrichment_error: null,
    })
    .eq("id", enquiryId);

  await enrichEnquiry(enquiryId);
  await classifyEnquiry(enquiryId);

  revalidatePath(`/dashboard/${enquiryId}`);
  revalidatePath("/dashboard");
}
