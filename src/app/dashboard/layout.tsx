import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createServerSupabase, getUser } from "@/lib/supabase/server";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await getUser();
  if (!user) redirect("/login");

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data: todaysCalls } = await supabase
    .from("claude_calls")
    .select("cost_usd")
    .gte("created_at", startOfDayUtc.toISOString());
  const spentToday = (todaysCalls ?? []).reduce((sum, c) => sum + Number(c.cost_usd), 0);

  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      {/* The header block extends well past the nav so cards can overlap it,
          which is what gives the layout depth rather than a flat band. */}
      <div className="bg-gradient-to-br from-brand to-brand-deep pb-24">
        <header className="mx-auto max-w-5xl px-6 pt-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <Image src="/logo-white.png" alt="" width={36} height={36} className="h-9 w-9" />
              <span className="text-[15px] font-semibold leading-tight tracking-tight text-white">
                Intake&nbsp;CRM
              </span>
            </Link>

            <nav className="flex items-center gap-1" aria-label="Main">
              <NavLink href="/dashboard">Contacts</NavLink>
              <NavLink href="/dashboard/companies">Companies</NavLink>
              <NavLink href="/dashboard/usage">Usage</NavLink>
            </nav>

            <div className="ml-auto flex items-center gap-3">
              <Link
                href="/dashboard/usage"
                title="Claude spend today"
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium tabular-nums text-white backdrop-blur transition-colors hover:bg-white/25"
              >
                ${spentToday.toFixed(2)} today
              </Link>
              {/* The avatar used to double as a silent one-click sign-out
                  button, with no visible menu and only a hover tooltip as a
                  clue. A <details> dropdown makes "click profile to sign
                  out" an actual, visible option instead of a hidden action —
                  no client JS, <details> owns the open state. */}
              <details className="group relative">
                <summary
                  title={`Signed in as ${user.email ?? ""}`}
                  className="grid h-9 w-9 cursor-pointer list-none place-items-center rounded-full bg-white/20 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/30"
                >
                  {initial}
                </summary>
                <div className="absolute right-0 top-full z-10 mt-2 w-52 overflow-hidden rounded-xl bg-surface py-1 shadow-lg ring-1 ring-black/5">
                  <p className="truncate px-3 py-2 text-xs text-ink-muted">{user.email}</p>
                  <form action="/auth/signout" method="post">
                    <button
                      type="submit"
                      className="w-full px-3 py-2 text-left text-sm text-ink hover:bg-page"
                    >
                      Sign out
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>
        </header>
      </div>

      {/* Pulled up over the gradient. */}
      <div className="mx-auto -mt-20 max-w-5xl px-6 pb-16">{children}</div>
    </div>
  );
}
