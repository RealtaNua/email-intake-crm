import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side client scoped to the logged-in user.
 *
 * Unlike the admin client, this respects RLS — queries run as the user, not
 * as service_role. Use this everywhere except the inbound webhook.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware refreshes the session, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * The logged-in user, fetched once per request.
 *
 * Every page under /dashboard independently called `supabase.auth.getUser()`
 * to redo the exact same "is anyone logged in" check the layout had already
 * made a moment earlier in the same render — layout, then page, sometimes
 * both hitting Supabase's Auth endpoint for an answer neither needed to ask
 * for twice. `cache()` memoizes by call within one request, so layout and
 * page now share one round trip instead of paying for two. This does not
 * touch middleware's own getUser() call — middleware runs in the Edge
 * Runtime, outside the Server Component render tree React's cache() covers,
 * and still needs its own check to refresh the session cookie regardless of
 * which page is being requested.
 */
export const getUser = cache(async () => {
  const supabase = await createServerSupabase();
  return supabase.auth.getUser();
});
