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
                <time
                  dateTime={enquiry.received_at}
                  title={new Date(enquiry.received_at).toISOString()}
                  className="shrink-0 text-xs tabular-nums text-slate-500"
                >
                  {timeAgo(enquiry.received_at)}
                </time>
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
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
