import type { NextConfig } from "next";

// Security response headers.
//
// Added after an authenticated ZeroThreat scan on 2026-09-06 reported the whole
// set as missing (19 medium / 14 low findings, no criticals and no highs). Every
// finding in that scan was a missing header, so this file is the entire fix.
//
// HSTS is deliberately absent from this list: Vercel already sets
// `strict-transport-security: max-age=63072000; includeSubDomains; preload` at
// the edge, verified with `curl -D -`. The scan reported it missing anyway —
// treat a third-party finding as input to check, not a verdict to act on.
//
// `Server: Vercel` (reported as "Information Exposure Server Header Present")
// is added by the platform after this handler runs and cannot be removed on
// Vercel. It stays as an accepted, documented risk.
// React's development build uses eval() for debugging features and logs a hard
// error without it. It never does so in production, so 'unsafe-eval' is scoped
// to `next dev` rather than weakening the deployed policy.
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  // Next.js App Router inlines its hydration and flight-data scripts, so
  // 'unsafe-inline' is required without a per-request nonce. Documented as a
  // partial mitigation: this CSP stops external script injection, not inline.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind and next/font emit inline <style> during SSR.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Supabase REST + Auth over HTTPS, and the realtime socket that LiveRecord
  // subscribes to. Without wss: the record page falls back to polling forever.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP },
  // frame-ancestors above supersedes this for modern browsers; kept because the
  // scanner and older browsers look for the header by name.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
