import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * Server-only Supabase client using the service_role key.
 *
 * This key bypasses Row Level Security. It must never reach the browser —
 * note there is no NEXT_PUBLIC_ prefix, so Next.js will not inline it into
 * client bundles. Only import this from route handlers and server components.
 */
export function createAdminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
