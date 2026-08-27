import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClaudeClient, MODEL, claimClaudeCall, recordTokens } from "@/lib/claude";
import { BUSINESS_CONTEXT } from "@/lib/business-context";

export type Priority = "urgent" | "high" | "normal" | "low";

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "record_priority",
  description: "Record the triage decision for this enquiry. Call exactly once.",
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
    },
    required: ["priority", "reasoning", "signals", "respond_by"],
  },
};

const SYSTEM = `You triage inbound business enquiries for the business described below.

${BUSINESS_CONTEXT}

HOW TO JUDGE
- Reason from the business context above, not from generic urgency cues. The word
  "urgent" in an email means very little; a stated budget and a fixed date mean a lot.
- A polite, unhurried email from a government agency with a real budget outranks an
  agitated email from someone selling software.
- Use the company profile when one is supplied. A large regional employer with a
  procurement budget is a different prospect from an unknown two-person outfit,
  and you should say so in your reasoning.
- If the sender used a personal email address and no company profile exists, do not
  penalise them for it — judge the message on its own terms.
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
      "id, sender_email, sender_name, sender_domain, subject, body_plain, company_profile, classification_status",
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

  if (!(await claimClaudeCall())) {
    console.warn("[classify] daily cap reached, skipping", enquiryId);
    await setStatus({ classification_status: "capped" });
    return;
  }

  try {
    const client = createClaudeClient();

    const profileSection = enquiry.company_profile
      ? `COMPANY PROFILE (researched from the sender's domain):\n${JSON.stringify(enquiry.company_profile, null, 2)}`
      : `No company profile — the sender used a personal email domain, or research found nothing.`;

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
            `${profileSection}`,
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
    };

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
