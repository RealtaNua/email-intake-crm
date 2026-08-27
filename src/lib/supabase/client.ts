import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side client. Uses the anon key, so RLS is what protects the data.
 *
 * These two values are written as static `process.env.NEXT_PUBLIC_X` literals
 * on purpose. Next.js only substitutes NEXT_PUBLIC_* into client bundles when
 * it can see the full property access at build time — a dynamic lookup like
 * process.env[name] is NOT replaced, and silently evaluates to undefined in
 * the browser. Do not refactor these through a helper.
 */
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase browser client is missing NEXT_PUBLIC_SUPABASE_URL or " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY. These must be present at build time.",
    );
  }
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
