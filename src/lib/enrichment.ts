import type Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClaudeClient, MODEL, claimClaudeCall, recordCall } from "@/lib/claude";
import { isPersonalDomain } from "@/lib/personal-domains";

export type CompanyProfile = {
  company_name: string;
  what_they_do: string;
  industry: string | null;
  size_estimate: string | null;
  location: string | null;
  recent_news: { headline: string; date: string | null; why_it_matters: string }[];
  confidence: "high" | "medium" | "low";
  sources: string[];
};

/**
 * Claude records its findings by calling this tool rather than by writing JSON
 * into prose. strict:true means the input is guaranteed to match the schema,
 * so there is no parsing step that can fail on a stray backtick.
 */
const RECORD_PROFILE_TOOL: Anthropic.Tool = {
  name: "record_company_profile",
  description:
    "Record the researched profile of a company. Call this exactly once, after " +
    "you have finished searching. If research turned up little or nothing, still " +
    "call it, with confidence 'low' and empty fields rather than guesses.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      company_name: { type: "string", description: "Official company name, or the domain if unknown." },
      what_they_do: { type: "string", description: "One or two plain sentences. No marketing language." },
      industry: { type: ["string", "null"] },
      size_estimate: { type: ["string", "null"], description: "e.g. '10-50 employees', or null if unknown." },
      location: { type: ["string", "null"], description: "Headquarters or primary market." },
      recent_news: {
        type: "array",
        description: "At most 3 genuinely relevant recent items. Empty array if none found.",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            headline: { type: "string" },
            date: { type: ["string", "null"] },
            why_it_matters: { type: "string", description: "Why this matters to someone handling their enquiry." },
          },
          required: ["headline", "date", "why_it_matters"],
        },
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "How much of this is grounded in sources actually found, versus inference.",
      },
      sources: { type: "array", items: { type: "string" }, description: "URLs actually used." },
    },
    required: [
      "company_name", "what_they_do", "industry", "size_estimate",
      "location", "recent_news", "confidence", "sources",
    ],
  },
};

const SYSTEM = `You research companies from their email domain, for someone triaging an inbound business enquiry.

Rules:
- Search the web before answering. Do not rely on memory for company facts.
- Report only what you find. If you cannot confirm something, use null and lower your confidence.
- Never invent employee counts, funding, locations, or news. An honest "unknown" is far more useful here than a plausible guess, because this profile is used to decide how to respond to a real person.
- "Recent" means the last 12 months or so. Skip filler press releases.
- Finish by calling record_company_profile exactly once.`;

/**
 * Research a company and store the profile against its domain.
 *
 * Keyed on the company rather than the enquiry, so a second person writing
 * from the same employer reuses this profile instead of paying for the same
 * research again.
 *
 * Runs off the webhook request path. Never throws: a failure here must not
 * affect the inbound pipeline, which has already returned 200 to Mailgun.
 */
export async function enrichCompany(companyId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: company, error: readError } = await supabase
    .from("companies")
    .select("id, domain, enrichment_status")
    .eq("id", companyId)
    .single();

  if (readError || !company) {
    console.error("[enrich] could not load company", companyId, readError?.message);
    return;
  }
  if (company.enrichment_status !== "pending") {
    console.log("[enrich] already researched", company.domain, company.enrichment_status);
    return;
  }
  if (isPersonalDomain(company.domain)) {
    console.log("[enrich] personal domain, refusing to research:", company.domain);
    return;
  }

  const setStatus = async (fields: Record<string, unknown>) => {
    await supabase.from("companies").update(fields).eq("id", companyId);
  };

  if (!(await claimClaudeCall())) {
    console.warn("[enrich] daily cap reached, skipping", company.domain);
    await setStatus({ enrichment_status: "capped" });
    return;
  }


  try {
    const client = createClaudeClient();
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Research the company that uses the email domain: ${company.domain}`,
      },
    ];

    let profile: CompanyProfile | null = null;

    // Server-side web search can pause the turn; resume until Claude either
    // records the profile or we hit the iteration ceiling.
    for (let i = 0; i < 5 && !profile; i++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 4000,
        // Effort is the dominant cost lever here. At default (high) effort a
        // single enquiry cost ~$0.54, mostly because each web search result
        // is fed back into context. "medium" gets materially the same profile
        // for a fraction of that. Raise it if profile quality disappoints.
        output_config: { effort: "medium" },
        system: SYSTEM,
        messages,
        tools: [
          { type: "web_search_20260209", name: "web_search", max_uses: 4 },
          RECORD_PROFILE_TOOL,
        ],
      });

      await recordCall({
        purpose: "enrich_company",
        usage: response.usage,
        companyId,
      });

      for (const block of response.content) {
        if (block.type === "tool_use" && block.name === "record_company_profile") {
          profile = block.input as CompanyProfile;
        }
      }

      if (profile) break;
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }

    if (!profile) {
      console.warn("[enrich] no profile recorded for", company.domain);
      await setStatus({
        enrichment_status: "failed",
        enrichment_error: "Model finished without calling record_company_profile",
      });
      return;
    }

    await setStatus({
      profile,
      enrichment_status: "enriched",
      enrichment_error: null,
      enriched_at: new Date().toISOString(),
    });
    console.log(
      "[enrich] profiled", company.domain,
      "->", profile.company_name, `(confidence: ${profile.confidence})`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[enrich] failed for", company.domain, message);
    await setStatus({ enrichment_status: "failed", enrichment_error: message.slice(0, 500) });
  }
}
