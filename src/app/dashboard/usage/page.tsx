import { redirect } from "next/navigation";
import { createServerSupabase, getUser } from "@/lib/supabase/server";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

const PURPOSE_LABELS: Record<string, string> = {
  enrich_company: "Company research",
  classify_inbound: "Triage (inbound)",
  classify_reply: "Reply logged",
  chat_update: "Chat update",
};

type Call = {
  id: string;
  created_at: string;
  purpose: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  web_search_requests: number;
  cost_usd: number;
  contacts: { email: string; name: string | null } | null;
  companies: { domain: string } | null;
};

export default async function UsagePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("claude_calls")
    .select("*, contacts ( email, name ), companies ( domain )")
    .order("created_at", { ascending: false })
    .limit(200);

  const calls = (data ?? []) as unknown as Call[];

  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);
  const today = calls.filter((c) => new Date(c.created_at) >= startOfDayUtc);

  const spentToday = today.reduce((sum, c) => sum + Number(c.cost_usd), 0);
  const spentAll = calls.reduce((sum, c) => sum + Number(c.cost_usd), 0);

  // What is the money actually going on? This is the question the daily
  // counter could not answer.
  const byPurpose = new Map<string, { count: number; cost: number }>();
  for (const call of calls) {
    const entry = byPurpose.get(call.purpose) ?? { count: 0, cost: 0 };
    entry.count += 1;
    entry.cost += Number(call.cost_usd);
    byPurpose.set(call.purpose, entry);
  }

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Claude usage</h1>
        <p className="mt-0.5 text-sm text-white/70">
          Every call, what it was for, and what it cost. The daily cap counts calls, not dollars.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Today (UTC)</p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums text-ink">
            ${spentToday.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{today.length} calls</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Last 200 calls</p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums text-ink">
            ${spentAll.toFixed(2)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">{calls.length} calls</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Average per call</p>
          <p className="mt-1.5 text-3xl font-semibold tabular-nums text-ink">
            ${calls.length ? (spentAll / calls.length).toFixed(3) : "0.000"}
          </p>
        </div>
      </div>

      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold text-ink">Where it goes</h2>
        <ul className="mt-2 space-y-1">
          {[...byPurpose.entries()]
            .sort((a, b) => b[1].cost - a[1].cost)
            .map(([purpose, stats]) => (
              <li key={purpose} className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-1.5 text-sm">
                <span className="text-slate-700">{PURPOSE_LABELS[purpose] ?? purpose}</span>
                <span className="shrink-0 tabular-nums text-slate-500">
                  {stats.count} × &nbsp; ${stats.cost.toFixed(2)}
                  <span className="ml-2 text-slate-400">
                    (${(stats.cost / stats.count).toFixed(3)} each)
                  </span>
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold text-ink">Recent calls</h2>
        {calls.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No calls logged yet. Logging started when this table was added — earlier calls
            exist only in the daily totals.
          </p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                  <th className="py-2 pr-4 font-normal">When</th>
                  <th className="py-2 pr-4 font-normal">Purpose</th>
                  <th className="py-2 pr-4 font-normal">About</th>
                  <th className="py-2 pr-4 text-right font-normal">In</th>
                  <th className="py-2 pr-4 text-right font-normal">Out</th>
                  <th className="py-2 pr-4 text-right font-normal">Search</th>
                  <th className="py-2 text-right font-normal">Cost</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => (
                  <tr key={call.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-4 text-xs text-slate-500">
                      <LocalTime iso={call.created_at} />
                    </td>
                    <td className="py-1.5 pr-4 text-slate-700">
                      {PURPOSE_LABELS[call.purpose] ?? call.purpose}
                    </td>
                    <td className="max-w-[16rem] truncate py-1.5 pr-4 text-slate-500">
                      {call.contacts?.name || call.contacts?.email || call.companies?.domain || "—"}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-slate-500">
                      {call.input_tokens.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-slate-500">
                      {call.output_tokens.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-4 text-right tabular-nums text-slate-400">
                      {call.web_search_requests || ""}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-700">
                      ${Number(call.cost_usd).toFixed(3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
