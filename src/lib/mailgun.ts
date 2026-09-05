import crypto from "node:crypto";
import { requireEnv } from "@/lib/env";

/**
 * Verify that an inbound POST genuinely came from Mailgun.
 *
 * Mailgun signs every webhook with HMAC-SHA256 over the concatenation of
 * timestamp and token, keyed with the account's HTTP webhook signing key
 * (Settings -> API keys -> "HTTP webhook signing key" — NOT the sending
 * API key, which is a different value and a common source of silent 401s).
 *
 * Without this check the endpoint is a public, unauthenticated write into our
 * database, and later a public trigger for paid Claude calls.
 */
export function verifyMailgunSignature(params: {
  timestamp: string;
  token: string;
  signature: string;
  signingKey: string;
  /** Reject signatures older than this, to blunt replay attacks. */
  toleranceSeconds?: number;
}): { ok: true } | { ok: false; reason: string } {
  const { timestamp, token, signature, signingKey } = params;
  const tolerance = params.toleranceSeconds ?? 300;

  if (!timestamp || !token || !signature) {
    return { ok: false, reason: "missing timestamp, token or signature" };
  }

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) {
    return { ok: false, reason: `timestamp outside ${tolerance}s tolerance` };
  }

  const expected = crypto
    .createHmac("sha256", signingKey)
    .update(timestamp + token)
    .digest("hex");

  // Constant-time compare. Buffers must match in length or timingSafeEqual
  // throws rather than returning false.
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature mismatch" };
  }

  return { ok: true };
}

/** Pull "Jane Doe <jane@acme.com>" apart. Falls back to the raw value. */
export function parseFromHeader(from: string | null): {
  email: string | null;
  name: string | null;
} {
  if (!from) return { email: null, name: null };
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1].replace(/^["']|["']$/g, "").trim();
    return { email: match[2].trim().toLowerCase(), name: name || null };
  }
  return { email: from.trim().toLowerCase(), name: null };
}

/**
 * Pull every address out of a To or Cc header.
 *
 * `parseFromHeader` is anchored and returns one address, which is right for a
 * From header and wrong for a recipient list: on "A <a@x>, B <b@y>" it matches
 * only the last one. A reply addressed to two people, or one where the contact
 * sits in Cc, would attach to the wrong record or to none.
 *
 * Splitting on commas outside angle brackets keeps a display name containing a
 * comma ("Tan, Jane" <jane@x>) from being torn in half.
 */
export function parseAddressList(header: string | null): string[] {
  if (!header) return [];
  const parts: string[] = [];
  let current = "";
  let inAngle = false;
  let inQuote = false;

  for (const char of header) {
    if (char === '"') inQuote = !inQuote;
    else if (char === "<") inAngle = true;
    else if (char === ">") inAngle = false;

    if (char === "," && !inAngle && !inQuote) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);

  const seen = new Set<string>();
  for (const part of parts) {
    const email = parseFromHeader(part.trim()).email;
    if (email && email.includes("@")) seen.add(email);
  }
  return [...seen];
}

/**
 * Message-Ids are compared across two paths — the id Mailgun returns when we
 * send, and the Message-Id header on the BCC copy that comes back. They are
 * the same id, but not always the same string: angle brackets and case vary by
 * hop. Normalising both is what makes the unique constraint deduplicate a
 * CRM-sent reply against its own BCC copy instead of storing it twice.
 */
export function normalizeMessageId(id: string | null): string | null {
  if (!id) return null;
  const trimmed = id.trim().replace(/^</, "").replace(/>$/, "").trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Mailgun's API host differs by region, and a mismatch 404s rather than 401s. */
function mailgunApiBase(): string {
  return (process.env.MAILGUN_REGION ?? "us").toLowerCase() === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";
}

/**
 * The address replies are sent from. Defaults to the intake mailbox on the
 * sending domain, so replies land back in the same webhook when answered.
 */
export function replyFromAddress(): string {
  const domain = requireEnv("MAILGUN_DOMAIN");
  return process.env.MAILGUN_FROM ?? `intake@${domain}`;
}

/**
 * Send a reply through Mailgun.
 *
 * Returns the Message-Id Mailgun assigned, which is stored on the row: if the
 * same message later arrives back as a BCC copy, the unique index on
 * message_id rejects it as a duplicate rather than posting it twice.
 *
 * Throws on a non-2xx. The caller must not write an enquiry row for a send
 * that failed — a record claiming we replied when nothing left the building is
 * worse than no record at all.
 */
export async function sendReplyEmail(params: {
  to: string;
  subject: string;
  text: string;
  /** Message-Id of the message being answered, for client-side threading. */
  inReplyTo?: string | null;
}): Promise<{ messageId: string | null }> {
  const domain = requireEnv("MAILGUN_DOMAIN");
  const apiKey = requireEnv("MAILGUN_API_KEY");

  const body = new URLSearchParams({
    from: replyFromAddress(),
    to: params.to,
    subject: params.subject,
    text: params.text,
  });

  if (params.inReplyTo) {
    const bracketed = params.inReplyTo.startsWith("<")
      ? params.inReplyTo
      : `<${params.inReplyTo}>`;
    body.set("h:In-Reply-To", bracketed);
    body.set("h:References", bracketed);
  }

  const response = await fetch(`${mailgunApiBase()}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const raw = await response.text();
  if (!response.ok) {
    // Mailgun's failure body is short and specific ("Domain not found",
    // "not authorized"). Surfacing it beats a bare status code.
    throw new Error(`Mailgun send failed (${response.status}): ${raw.slice(0, 300)}`);
  }

  let messageId: string | null = null;
  try {
    messageId = normalizeMessageId((JSON.parse(raw) as { id?: string }).id ?? null);
  } catch {
    // A 200 with an unparseable body still means the mail went out. Losing the
    // id only costs us BCC deduplication, so it is not worth failing the send.
    console.warn("[mailgun] send succeeded but response was not JSON");
  }

  return { messageId };
}
