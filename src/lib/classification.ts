import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClaudeClient, MODEL, claimClaudeCall, recordTokens } from "@/lib/claude";
import { BUSINESS_CONTEXT } from "@/lib/business-context";

export type Priority = "urgent" | "high" | "normal" | "low";

type ContactJoin = {
  id: string;
  name: string | null;
  status: string;
  total_received: number;
  notes: { text: string }[] | null;
  companies: { domain: string; profile: unknown } | null;
  company_id?: string | null;
};

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "record_priority",
  description:
    "Record the triage decision for this message and the state of the whole " +
    "conversation with this contact. Call exactly once.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      priority: {
        type: "string",
        enum: ["urgent", "high", "normal", "low"],
        description:
          "urgent: needs a reply today. high: this week. normal: routine. low: courtesy reply or ignore.",
      },
      reasoning: {
        type: "string",
        description:
          "Two or three sentences explaining the call, referencing the specifics of THIS enquiry. " +
          "Someone reading only this should understand why without reopening the email.",
      },
      signals: {
        type: "array",
        items: { type: "string" },
        description: "The concrete facts that drove the rating. Short phrases, not sentences.",
      },
      respond_by: {
        type: "string",
        description: "Plain-language target, e.g. 'today', 'within 2 working days', 'no deadline'.",
      },
      conversation_summary: {
        type: "string",
        description:
          "Two or three sentences covering the whole thread with this contact, both directions: " +
          "what they want, what has been said back, and where it now stands. Write it so someone " +
          "picking this up cold knows what to do next without reading the emails.",
      },
      conversation_status: {
        type: "string",
        enum: [
          "awaiting_our_reply",
          "awaiting_their_reply",
          "scheduled",
          "closed_won",
          "closed_lost",
          "no_action_needed",
        ],
        description:
          "Whose court the ball is in. awaiting_our_reply means they are waiting on us.",
      },
    },
    required: [
      "priority", "reasoning", "signals", "respond_by",
      "conversation_summary", "conversation_status",
    ],
  },
};

const SYSTEM = `You triage inbound business enquiries for the business described below.

${BUSINESS_CONTEXT}

HOW TO JUDGE
- Reason from the business context above, not from generic urgency cues. The word
  "urgent" in an email means very little; a stated budget and a fixed date mean a lot.
- A polite, unhurried email from a government agency with a real budget outranks an
  agitated email from someone selling software.
- Check the company history before claiming anything is unknown. If a colleague has
  written before, that is prior contact with the organisation even if this individual
  is new, and a message referencing "the proposal" is probably referencing theirs.
- An existing relationship changes everything. Someone already recorded as a paying
  client, or with notes on file, is not a cold enquiry — say so in your reasoning.
- Use the company profile when one is supplied. A large regional employer with a
  procurement budget is a different prospect from an unknown two-person outfit,
  and you should say so in your reasoning.
- If the sender used a personal email address and no company profile exists, do not
  penalise them for it — judge the message on its own terms.
- The thread is given to you in full, both directions. If we have already replied and
  they have not come back, that is not urgent no matter how good the opportunity is.
- Be willing to rate things low. A triage system that marks everything high is useless.
- Your reasoning is read by a human deciding what to do next. Make it specific and
  honest, including when you are uncertain.

Finish by calling record_priority exactly once.`;

/**
 * Assign a priority with reasoning. Runs after enrichment so the company
 * profile, when there is one, informs the judgement.
 *
 * No web search here — classification reasons over material already gathered,
 * which keeps it fast and cheap relative to enrichment.
 */
export async function classifyEnquiry(enquiryId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: enquiry, error: readError } = await supabase
    .from("enquiries")
    .select(
      "id, contact_id, sender_email, sender_name, sender_domain, subject, body_plain, classification_status, contacts ( id, name, company_id, status, total_received, notes, companies ( domain, profile ) )",
    )
    .eq("id", enquiryId)
    .single();

  if (readError || !enquiry) {
    console.error("[classify] could not load enquiry", enquiryId, readError?.message);
    return;
  }
  if (enquiry.classification_status !== "pending") {
    console.log("[classify] already processed", enquiryId, enquiry.classification_status);
    return;
  }

  const setStatus = async (fields: Record<string, unknown>) => {
    await supabase.from("enquiries").update(fields).eq("id", enquiryId);
  };

  // The whole thread, both directions, oldest first. Without the outbound
  // side the model cannot tell whether someone is waiting on us or we are
  // waiting on them, which is the question the status is meant to answer.
  const { data: thread } = await supabase
    .from("enquiries")
    .select("direction, subject, body_plain, received_at")
    .eq("contact_id", (enquiry as unknown as { contact_id: string }).contact_id ?? "")
    .order("received_at", { ascending: true });

  const threadSection = (thread ?? [])
    .map((m) =>
      `[${m.direction === "outbound" ? "WE REPLIED" : "THEY WROTE"} · ` +
      `${new Date(m.received_at).toLocaleDateString()}] ${m.subject ?? "(no subject)"}\n` +
      `${(m.body_plain ?? "").slice(0, 1200)}`,
    )
    .join("\n\n---\n\n");

  if (!(await claimClaudeCall())) {
    console.warn("[classify] daily cap reached, skipping", enquiryId);
    await setStatus({ classification_status: "capped" });
    return;
  }

  try {
    const client = createClaudeClient();

    // The contact carries the durable relationship: the company profile, the
    // running notes, and anything recorded about money. All of it is relevant
    // to how urgent a new message from this person is.
    const contact = (enquiry as unknown as { contacts: ContactJoin | null }).contacts;
    const profile = contact?.companies?.profile ?? null;

    const profileSection = profile
      ? `COMPANY PROFILE (researched from the sender's domain):\n${JSON.stringify(profile, null, 2)}`
      : `No company profile — the sender used a personal email domain, or research found nothing.`;

    const relationshipSection = contact
      ? `EXISTING RELATIONSHIP\n` +
        `Status: ${contact.status}\n` +
        `Total received to date: ${contact.total_received}\n` +
        (Array.isArray(contact.notes) && contact.notes.length
          ? `Notes on file:\n${contact.notes.map((n) => `- ${n.text}`).join("\n")}`
          : `No notes on file.`)
      : `No contact record.`;

    // Company-level history. Without this the model can assert "we have no
    // record of this company" while a colleague's enquiry sits in the same
    // database — a confident claim our own data contradicts, which is worse
    // than saying nothing.
    let companySection = "";
    if (contact?.companies) {
      const { data: colleagues } = await supabase
        .from("contacts")
        .select("name, email, status, total_received, enquiries ( subject, received_at, priority )")
        .eq("company_id", (contact as unknown as { company_id: string }).company_id ?? "")
        .neq("id", contact.id);

      if (colleagues?.length) {
        companySection =
          `\n\nOTHERS AT THIS COMPANY ALREADY IN THE CRM\n` +
          colleagues
            .map((c) => {
              const history = (c.enquiries ?? [])
                .map((e) => `    - "${e.subject}" (${new Date(e.received_at).toLocaleDateString()}${e.priority ? `, rated ${e.priority}` : ""})`)
                .join("\n");
              return `  ${c.name ?? c.email} <${c.email}> — status ${c.status}` +
                (history ? `\n${history}` : "");
            })
            .join("\n");
      }
    }

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content:
            `ENQUIRY\n` +
            `From: ${enquiry.sender_name ?? "(no name)"} <${enquiry.sender_email}>\n` +
            `Domain: ${enquiry.sender_domain ?? "unknown"}\n` +
            `Subject: ${enquiry.subject ?? "(no subject)"}\n\n` +
            `${(enquiry.body_plain ?? "(empty body)").slice(0, 4000)}\n\n` +
            `${profileSection}\n\n${relationshipSection}${companySection}\n\n` +
            `FULL THREAD WITH THIS CONTACT (oldest first)\n${threadSection}`,
        },
      ],
      tools: [CLASSIFY_TOOL],
    });

    await recordTokens(response.usage.input_tokens, response.usage.output_tokens);

    const block = response.content.find(
      (b) => b.type === "tool_use" && b.name === "record_priority",
    );

    if (!block || block.type !== "tool_use") {
      console.warn("[classify] no decision recorded for", enquiryId);
      await setStatus({ classification_status: "failed" });
      return;
    }

    const decision = block.input as {
      priority: Priority;
      reasoning: string;
      signals: string[];
      respond_by: string;
      conversation_summary: string;
      conversation_status: string;
    };

    // Conversation state belongs to the relationship, not to one message.
    const contactId = (enquiry as unknown as { contact_id: string | null }).contact_id;
    if (contactId) {
      await supabase
        .from("contacts")
        .update({
          conversation_summary: decision.conversation_summary,
          conversation_status: decision.conversation_status,
          summary_updated_at: new Date().toISOString(),
        })
        .eq("id", contactId);
    }

    await setStatus({
      priority: decision.priority,
      priority_reasoning: decision.reasoning,
      priority_signals: decision.signals,
      respond_by: decision.respond_by,
      classification_status: "classified",
      classified_at: new Date().toISOString(),
    });
    console.log("[classify]", enquiryId, "->", decision.priority, "|", decision.respond_by);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[classify] failed for", enquiryId, message);
    await setStatus({ classification_status: "failed" });
  }
}
