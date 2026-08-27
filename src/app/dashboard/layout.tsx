import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { NavLink } from "@/components/nav-link";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const { data: todaysCalls } = await supabase
    .from("claude_calls")
    .select("cost_usd")
    .gte("created_at", startOfDayUtc.toISOString());
  const spentToday = (todaysCalls ?? []).reduce((sum, c) => sum + Number(c.cost_usd), 0);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-3">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-slate-900">
            Intake CRM
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
              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs tabular-nums text-slate-600 transition-colors hover:bg-slate-50"
            >
              ${spentToday.toFixed(2)} today
            </Link>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                title={user.email ?? undefined}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
