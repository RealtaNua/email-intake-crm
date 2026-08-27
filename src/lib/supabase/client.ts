import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "@/lib/env";

/** Browser-side client. Uses the anon key, so RLS is what protects the data. */
export function createClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
