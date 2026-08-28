/**
 * Print the exact payload a classification call sends, for one message.
 *
 *   npx tsx scripts/dump-prompt.ts <email>            # newest message
 *   npx tsx scripts/dump-prompt.ts <email> --chat     # claude.ai-pasteable
 *
 * COSTS NOTHING. It reads the database and assembles the prompt; it never
 * calls Claude. Use it to see what the model is actually given, rather than
 * reading the template and imagining the interpolation.
 *
 * The system prompt, tool schema, and user message all come from
 * `src/lib/classification.ts` itself, so this cannot drift from production.
 *
 * `--chat` rewrites the tool call as an instruction to return JSON, because
 * claude.ai has no tools parameter. That is a DIFFERENT MECHANISM from
 * `strict: true` structured output — see the note it prints.
 */
process.loadEnvFile(".env.local");

import { createAdminClient } from "../src/lib/supabase/admin";
import {
  SYSTEM,
  CLASSIFY_TOOL,
  buildClassificationUserMessage,
} from "../src/lib/classification";

async function main() {
  const args = process.argv.slice(2);
  const chat = args.includes("--chat");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target) {
    console.error("usage: npx tsx scripts/dump-prompt.ts <email> [--chat]");
    process.exit(1);
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, name, email, status, total_received, notes, company_id")
    .eq("email", target.toLowerCase())
    .maybeSingle();

  if (!contact) {
    console.error(`no contact matching ${target}`);
    process.exit(1);
  }

  const { data: messages } = await admin
    .from("enquiries")
    .select("id, direction, subject, body_plain, sender_name, sender_email, received_at")
    .eq("contact_id", contact.id)
    .order("received_at", { ascending: true });

  const enquiry = messages?.[messages.length - 1];
  if (!enquiry) {
    console.error("contact has no messages");
    process.exit(1);
  }

  // Mirrors classifyEnquiry's own section building. Personal domains get no
  // company row at all, which is why this is usually the "no profile" branch.
  let profileSection =
    "No company profile — the sender used a personal email domain, or research found nothing.";
  if (contact.company_id) {
    const { data: company } = await admin
      .from("companies")
      .select("profile")
      .eq("id", contact.company_id)
      .maybeSingle();
    if (company?.profile) {
      profileSection =
        `COMPANY PROFILE (researched from the sender's domain):\n` +
        JSON.stringify(company.profile, null, 2);
    }
  }

  const notes = contact.notes as { text: string }[] | null;
  const relationshipSection =
    `EXISTING RELATIONSHIP\n` +
    `Status: ${contact.status}\n` +
    `Total received to date: ${contact.total_received}\n` +
    (Array.isArray(notes) && notes.length
      ? `Notes on file:\n${notes.map((n) => `- ${n.text}`).join("\n")}`
      : `No notes on file.`);

  const prior = (messages ?? []).filter((m) => m.id !== enquiry.id);
  const threadSection = prior.length
    ? prior
        .map(
          (m) =>
            `[${m.direction === "outbound" ? "WE REPLIED" : "THEY WROTE"} · ` +
            `${new Date(m.received_at).toLocaleDateString()}] ${m.subject ?? "(no subject)"}\n` +
            `${(m.body_plain ?? "").slice(0, 1200)}`,
        )
        .join("\n\n---\n\n")
    : "(nothing — this is the first message)";

  const userMessage = buildClassificationUserMessage({
    profileSection,
    relationshipSection,
    companySection: "",
    threadSection,
    isOutbound: enquiry.direction === "outbound",
    senderName: enquiry.sender_name,
    senderEmail: enquiry.sender_email,
    subject: enquiry.subject,
    bodyPlain: enquiry.body_plain,
  });

  if (!chat) {
    console.log("=============== SYSTEM ===============\n");
    console.log(SYSTEM);
    console.log("\n=============== TOOL (tools parameter) ===============\n");
    console.log(JSON.stringify(CLASSIFY_TOOL, null, 2));
    console.log("\n=============== USER MESSAGE ===============\n");
    console.log(userMessage);
    return;
  }

  const schema = CLASSIFY_TOOL.input_schema as {
    properties: Record<string, unknown>;
    required: string[];
  };

  console.log(SYSTEM);
  console.log(`
OUTPUT FORMAT
Reply with a single JSON object and nothing else — no preamble, no code fence,
no commentary. It must have exactly these keys, in this order:

${schema.required.map((k) => `  ${k}`).join("\n")}

Each key's meaning and constraints:

${JSON.stringify(schema.properties, null, 2)}
`);
  console.log(`---

${userMessage}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
