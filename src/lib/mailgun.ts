import crypto from "node:crypto";

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
