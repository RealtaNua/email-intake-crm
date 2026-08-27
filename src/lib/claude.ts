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

export async function recordTokens(input: number, output: number): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.rpc("record_claude_tokens", {
    p_input: input,
    p_output: output,
  });
  if (error) console.error("[claude] token accounting failed:", error.message);
}
