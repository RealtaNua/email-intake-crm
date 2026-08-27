/**
 * Re-run research and triage for a contact, from the command line.
 *
 *   npx tsx scripts/reprocess.ts daniel.lim@grabtaxi.com
 *   npx tsx scripts/reprocess.ts --all
 *
 * The dashboard has a button for this, but it needs a logged-in session.
 * This is the same operation for ops work: backfilling after a schema change,
 * or recovering records that were capped or failed.
 *
 * Every message costs a Claude call and counts against the daily cap.
 */
process.loadEnvFile(".env.local");

import { createAdminClient } from "../src/lib/supabase/admin";
import { enrichCompany } from "../src/lib/enrichment";
import { classifyEnquiry } from "../src/lib/classification";

async function reprocessContact(admin: ReturnType<typeof createAdminClient>, contact: {
  id: string; email: string; company_id: string | null;
}) {
  console.log(`\n── ${contact.email}`);

  if (contact.company_id) {
    await admin
      .from("companies")
      .update({ enrichment_status: "pending", enrichment_error: null })
      .eq("id", contact.company_id);
    await enrichCompany(contact.company_id);
  } else {
    console.log("   no company (personal domain) — skipping research");
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
  const target = process.argv[2];
  if (!target) {
    console.error("usage: npx tsx scripts/reprocess.ts <email> | --all");
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

  for (const contact of contacts) await reprocessContact(admin, contact);

  const { data: usage } = await admin.from("claude_usage").select("*").limit(1).single();
  if (usage) {
    const cost = (usage.input_tokens * 5 + usage.output_tokens * 25) / 1e6;
    console.log(`\nspend today: ${usage.calls} calls ≈ $${cost.toFixed(2)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
