import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";

/** Enrichment and classification both run on this model. */
export const MODEL = "claude-opus-5";

export function createClaudeClient() {
  return new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
}

function dailyCap(): number {
  const raw = Number(process.env.ENRICHMENT_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? raw : 25;
}

/**
 * Reserve one Claude call against today's cap.
 *
 * The webhook is a public endpoint. Signature verification means only Mailgun
 * can reach it, but anyone can email the intake address — so the volume of
 * paid calls is ultimately controlled by strangers. This is the hard ceiling.
 *
 * The increment-and-check is a single atomic statement in Postgres rather than
 * a read followed by a write, because concurrent inbound mail is exactly the
 * situation where a check-then-act race would let the cap be exceeded.
 */
export async function claimClaudeCall(): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_claude_call", {
    p_cap: dailyCap(),
  });

  if (error) {
    // Fail closed. If we cannot confirm we're under the cap, we don't spend.
    console.error("[claude] cap check failed, refusing call:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Per-million-token rates, in USD.
 *
 * Used to price each call at the time it is made, so historical rows stay
 * accurate after a price change. Update alongside the model.
 */
const RATES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 3, output: 15, cacheRead: 0.3 },
};

export type CallPurpose =
  | "enrich_company"
  | "classify_inbound"
  | "classify_reply"
  | "chat_update";

type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
};

/**
 * Record one Claude call: what it was for, what it touched, what it cost.
 *
 * The daily counter alone could say twenty calls happened but not what any of
 * them were, which made "why did five emails cost twenty calls?" unanswerable
 * from the data. This is the answer to that question.
 *
 * Never throws — accounting must not break the work it is accounting for.
 */
export async function recordCall(params: {
  purpose: CallPurpose;
  usage: UsageLike;
  model?: string;
  contactId?: string | null;
  companyId?: string | null;
  enquiryId?: string | null;
  error?: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  const model = params.model ?? MODEL;
  const usage = params.usage;

  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const searches = usage.server_tool_use?.web_search_requests ?? 0;

  const rate = RATES[model] ?? RATES["claude-opus-5"];
  // Web search is billed per request on top of tokens; not priced here
  // because the count is what matters for spotting a runaway loop.
  const cost =
    (input * rate.input + output * rate.output + cacheRead * rate.cacheRead) / 1e6;

  const { error } = await supabase.from("claude_calls").insert({
    purpose: params.purpose,
    model,
    contact_id: params.contactId ?? null,
    company_id: params.companyId ?? null,
    enquiry_id: params.enquiryId ?? null,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    web_search_requests: searches,
    cost_usd: Number(cost.toFixed(6)),
    error: params.error ?? null,
  });
  if (error) console.error("[claude] call log failed:", error.message);

  // Keep the daily aggregate too. The cap claim reads it, and that path must
  // stay a single cheap statement rather than a count over a growing table.
  const { error: aggError } = await supabase.rpc("record_claude_tokens", {
    p_input: input,
    p_output: output,
  });
  if (aggError) console.error("[claude] token accounting failed:", aggError.message);
}
