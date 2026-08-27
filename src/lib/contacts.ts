import { createAdminClient } from "@/lib/supabase/admin";
import { isPersonalDomain } from "@/lib/personal-domains";

export type ResolvedContact = {
  contactId: string;
  companyId: string | null;
  companyNeedsResearch: boolean;
};

/**
 * Find or create the company and contact behind an inbound email.
 *
 * Company rows exist per domain, so a second person writing from the same
 * employer reuses the profile that already exists instead of paying for the
 * same research twice. Personal domains get no company at all — there is
 * nothing to research, and a "Gmail Inc." record would be worse than none.
 */
export async function resolveContact(params: {
  email: string;
  name: string | null;
  domain: string | null;
  receivedAt?: string;
}): Promise<ResolvedContact> {
  const admin = createAdminClient();
  const { email, name, domain } = params;
  const seenAt = params.receivedAt ?? new Date().toISOString();

  let companyId: string | null = null;
  let companyNeedsResearch = false;

  if (domain && !isPersonalDomain(domain)) {
    const { data: existing } = await admin
      .from("companies")
      .select("id, enrichment_status")
      .eq("domain", domain)
      .maybeSingle();

    if (existing) {
      companyId = existing.id;
      companyNeedsResearch = existing.enrichment_status === "pending";
    } else {
      const { data: created, error } = await admin
        .from("companies")
        .insert({ domain })
        .select("id")
        .single();
      // A concurrent insert can win the race; fall back to reading the winner.
      if (error) {
        const { data: raced } = await admin
          .from("companies").select("id, enrichment_status").eq("domain", domain).maybeSingle();
        companyId = raced?.id ?? null;
        companyNeedsResearch = raced?.enrichment_status === "pending";
      } else {
        companyId = created.id;
        companyNeedsResearch = true;
      }
    }
  }

  const { data: contact } = await admin
    .from("contacts")
    .select("id, name")
    .eq("email", email)
    .maybeSingle();

  if (contact) {
    await admin
      .from("contacts")
      .update({
        last_seen_at: seenAt,
        // Only fill a missing name. A later email signed differently should
        // not silently rewrite who this person is on the record.
        ...(contact.name ? {} : name ? { name } : {}),
        ...(companyId ? { company_id: companyId } : {}),
      })
      .eq("id", contact.id);
    return { contactId: contact.id, companyId, companyNeedsResearch };
  }

  const { data: created, error } = await admin
    .from("contacts")
    .insert({ email, name, domain, company_id: companyId, first_seen_at: seenAt, last_seen_at: seenAt })
    .select("id")
    .single();

  if (error || !created) {
    const { data: raced } = await admin.from("contacts").select("id").eq("email", email).single();
    return { contactId: raced!.id, companyId, companyNeedsResearch };
  }
  return { contactId: created.id, companyId, companyNeedsResearch };
}
