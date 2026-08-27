import { createAdminClient } from "@/lib/supabase/admin";
import type { Enquiry } from "@/lib/types";

// Always read fresh. An enquiry that arrived seconds ago is the whole point.
export const dynamic = "force-dynamic";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-900 ring-red-200",
  high: "bg-orange-100 text-orange-900 ring-orange-200",
  normal: "bg-sky-100 text-sky-900 ring-sky-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

/** The rating is only useful with the reasoning attached, so they render together. */
function PriorityPanel({ enquiry }: { enquiry: Enquiry }) {
  if (enquiry.classification_status === "pending") {
    return <span className="text-xs text-slate-400">Triaging…</span>;
  }
  if (enquiry.classification_status === "capped") {
    return <span className="text-xs text-amber-700">Not triaged (daily limit)</span>;
  }
  if (!enquiry.priority) return null;

  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${
        PRIORITY_STYLES[enquiry.priority] ?? PRIORITY_STYLES.low
      }`}
    >
      {enquiry.priority}
    </span>
  );
}

function PriorityReasoning({ enquiry }: { enquiry: Enquiry }) {
  if (!enquiry.priority_reasoning) return null;
  return (
    <div className="mt-3 border-l-2 border-slate-200 pl-3">
      <p className="text-sm text-slate-700">{enquiry.priority_reasoning}</p>
      {enquiry.priority_signals?.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {enquiry.priority_signals.map((signal, i) => (
            <li key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
              {signal}
            </li>
          ))}
        </ul>
      ) : null}
      {enquiry.respond_by ? (
        <p className="mt-2 text-xs text-slate-500">
          Respond by: <span className="text-slate-700">{enquiry.respond_by}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Renders whatever enrichment produced — including the honest failure states. */
function CompanyPanel({ enquiry }: { enquiry: Enquiry }) {
  const profile = enquiry.company_profile;

  if (enquiry.enrichment_status === "pending") {
    return <p className="mt-3 text-xs text-slate-400">Researching company…</p>;
  }
  if (enquiry.enrichment_status === "skipped_personal_domain") {
    return (
      <p className="mt-3 text-xs text-slate-400">
        Personal email domain — no company to research.
      </p>
    );
  }
  if (enquiry.enrichment_status === "capped") {
    return (
      <p className="mt-3 text-xs text-amber-700">
        Daily research limit reached — not enriched.
      </p>
    );
  }
  if (enquiry.enrichment_status === "failed") {
    return (
      <p className="mt-3 text-xs text-red-700">
        Research failed{enquiry.enrichment_error ? `: ${enquiry.enrichment_error}` : ""}
      </p>
    );
  }
  if (!profile) return null;

  const confidenceStyle =
    profile.confidence === "high"
      ? "bg-emerald-50 text-emerald-800"
      : profile.confidence === "medium"
        ? "bg-amber-50 text-amber-800"
        : "bg-slate-100 text-slate-600";

  return (
    <div className="mt-4 rounded-lg bg-slate-50 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{profile.company_name}</p>
        <span className={`rounded px-1.5 py-0.5 text-xs ${confidenceStyle}`}>
          {profile.confidence} confidence
        </span>
      </div>

      <p className="mt-1.5 text-sm text-slate-700">{profile.what_they_do}</p>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        {profile.industry ? (
          <div><dt className="inline text-slate-400">Industry: </dt><dd className="inline">{profile.industry}</dd></div>
        ) : null}
        {profile.size_estimate ? (
          <div><dt className="inline text-slate-400">Size: </dt><dd className="inline">{profile.size_estimate}</dd></div>
        ) : null}
        {profile.location ? (
          <div><dt className="inline text-slate-400">Location: </dt><dd className="inline">{profile.location}</dd></div>
        ) : null}
      </dl>

      {profile.recent_news?.length ? (
        <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
          {profile.recent_news.map((item, i) => (
            <li key={i} className="text-xs text-slate-600">
              <span className="text-slate-900">{item.headline}</span>
              {item.date ? <span className="text-slate-400"> · {item.date}</span> : null}
              <span className="block text-slate-500">{item.why_it_matters}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {profile.sources?.length ? (
        <p className="mt-3 text-xs text-slate-400">
          {profile.sources.length} source{profile.sources.length === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

export default async function DashboardPage() {
  // Read server-side with the service_role key. RLS is on with no policies,
  // so the anon key would return an empty array here. Auth arrives at step 6
  // and this becomes a per-user query.
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("enquiries")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-red-900">Could not load enquiries</h1>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error.message}
        </pre>
      </main>
    );
  }

  const enquiries = (data ?? []) as Enquiry[];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Enquiries</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inbound to{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
              intake@mg.storyworks.asia
            </code>
          </p>
        </div>
        <span className="shrink-0 text-sm tabular-nums text-slate-500">
          {enquiries.length} {enquiries.length === 1 ? "record" : "records"}
        </span>
      </header>

      {enquiries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <p className="text-slate-900">No enquiries yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Send an email to the intake address and it will appear here within a minute.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {enquiries.map((enquiry) => (
            <li
              key={enquiry.id}
              className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="font-medium text-slate-900">
                  {enquiry.subject || <span className="text-slate-400">(no subject)</span>}
                </p>
                <span className="flex shrink-0 items-center gap-2">
                <PriorityPanel enquiry={enquiry} />
                <time
                  dateTime={enquiry.received_at}
                  title={new Date(enquiry.received_at).toISOString()}
                  className="shrink-0 text-xs tabular-nums text-slate-500"
                >
                  {timeAgo(enquiry.received_at)}
                </time>
                </span>
              </div>

              <p className="mt-1 text-sm text-slate-600">
                {enquiry.sender_name ? `${enquiry.sender_name} · ` : ""}
                {enquiry.sender_email}
                {enquiry.sender_domain ? (
                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                    {enquiry.sender_domain}
                  </span>
                ) : null}
              </p>

              {enquiry.body_plain ? (
                <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm text-slate-700">
                  {enquiry.body_plain}
                </p>
              ) : null}

              <PriorityReasoning enquiry={enquiry} />
              <CompanyPanel enquiry={enquiry} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
