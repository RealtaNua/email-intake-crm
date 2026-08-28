/**
 * Re-run research and triage for a contact, from the command line.
 *
 *   npx tsx scripts/reprocess.ts daniel.lim@grabtaxi.com
 *   npx tsx scripts/reprocess.ts --all
 *   npx tsx scripts/reprocess.ts daniel.lim@grabtaxi.com --research
 *
 * The dashboard has a button for this, but it needs a logged-in session.
 * This is the same operation for ops work: backfilling after a schema change,
 * or recovering records that were capped or failed.
 *
 * COST: one Claude call per message. A company is researched only when it has no
 * profile yet, or when --research forces it: research is by far the most expensive
 * call here (web search results re-enter context — tens of thousands of tokens),
 * and re-running it to test a classification change is pure waste.
 * Get the owner's explicit permission before running this — for a single contact
 * as well as for --all.
 */
process.loadEnvFile(".env.local");

import { createAdminClient } from "../src/lib/supabase/admin";
import { enrichCompany } from "../src/lib/enrichment";
import { classifyEnquiry } from "../src/lib/classification";

async function reprocessContact(
  admin: ReturnType<typeof createAdminClient>,
  contact: { id: string; email: string; company_id: string | null },
  opts: { forceResearch: boolean; researched: Set<string> },
) {
  console.log(`\n── ${contact.email}`);

  // enrichCompany() returns early unless the row is "pending" — that guard is
  // what makes research run once per domain. Flipping the status back to
  // "pending" unconditionally defeated it, so every reprocess paid for a fresh
  // web-search run even when the profile was already on file. Only force it
  // when asked, or when there is genuinely no profile yet.
  if (!contact.company_id) {
    console.log("   no company (personal domain) — skipping research");
  } else if (opts.researched.has(contact.company_id)) {
    // --all lists contacts, not companies: colleagues share a domain.
    console.log("   company already researched in this run — skipping");
  } else {
    const { data: company } = await admin
      .from("companies")
      .select("domain, enrichment_status")
      .eq("id", contact.company_id)
      .maybeSingle();

    if (opts.forceResearch || company?.enrichment_status !== "enriched") {
      await admin
        .from("companies")
        .update({ enrichment_status: "pending", enrichment_error: null })
        .eq("id", contact.company_id);
      await enrichCompany(contact.company_id);
      opts.researched.add(contact.company_id);
    } else {
      console.log(
        `   ${company.domain} already researched — skipping (--research to force)`,
      );
    }
  }

  const { data: messages } = await admin
    .from("enquiries")
    .select("id, subject, direction, received_at")
    .eq("contact_id", contact.id)
    .order("received_at", { ascending: true });

  for (const message of messages ?? []) {
    await admin
      .from("enquiries")
      .update({ classification_status: "pending" })
      .eq("id", message.id);
    // Sequential on purpose: each message's summary and the conversation
    // status are written in order, and running them in parallel would race
    // on the contact row.
    await classifyEnquiry(message.id);
  }
  console.log(`   ${messages?.length ?? 0} message(s) reprocessed`);
}

async function main() {
  const args = process.argv.slice(2);
  const forceResearch = args.includes("--research");
  const target = args.find((a) => a === "--all" || !a.startsWith("--"));
  if (!target) {
    console.error(
      "usage: npx tsx scripts/reprocess.ts <email> | --all [--research]",
    );
    process.exit(1);
  }

  const admin = createAdminClient();
  const query = admin.from("contacts").select("id, email, company_id");
  const { data: contacts, error } =
    target === "--all" ? await query : await query.eq("email", target.toLowerCase());

  if (error) throw error;
  if (!contacts?.length) {
    console.error(`no contact matching ${target}`);
    process.exit(1);
  }

  // Make the cost visible before spending it, so an accidental --all is obvious
  // from the output rather than from the bill.
  const { count } = await admin
    .from("enquiries")
    .select("id", { count: "exact", head: true })
    .in("contact_id", contacts.map((c) => c.id));

  // Count the domains that will actually be researched, not the contacts that
  // happen to have one. Colleagues share a company, and an already-researched
  // company costs nothing unless --research forces it.
  const companyIds = [
    ...new Set(
      contacts.map((c) => c.company_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  let research = companyIds.length;
  if (!forceResearch && companyIds.length) {
    const { data: companies } = await admin
      .from("companies")
      .select("id, enrichment_status")
      .in("id", companyIds);
    research = (companies ?? []).filter(
      (c) => c.enrichment_status !== "enriched",
    ).length;
  }

  console.log(
    `About to reprocess ${contacts.length} contact(s): ` +
      `${count ?? "?"} message(s) + ${research} company research = ` +
      `~${(count ?? 0) + research} Claude calls.` +
      (forceResearch ? " (--research: forcing re-research)" : ""),
  );

  const researched = new Set<string>();
  for (const contact of contacts) {
    await reprocessContact(admin, contact, { forceResearch, researched });
  }

  // claude_usage is one row per UTC day (see migration 0002) — without this
  // filter, .limit(1) returned whatever row Postgres handed back first,
  // which in practice was the oldest day on record, not today's.
  const todayUtc = new Date().toISOString().slice(0, 10);
  const { data: usage } = await admin
    .from("claude_usage")
    .select("*")
    .eq("day", todayUtc)
    .maybeSingle();
  if (usage) {
    const cost = (usage.input_tokens * 5 + usage.output_tokens * 25) / 1e6;
    console.log(`\nspend today: ${usage.calls} calls ≈ $${cost.toFixed(2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
