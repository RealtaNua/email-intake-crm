import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { reprocessEnquiry } from "../actions";
import type { Enquiry } from "@/lib/types";

export const dynamic = "force-dynamic";
// Reprocessing runs two Claude calls inline, one with web search.
export const maxDuration = 300;

const PRIORITY_STYLES: Record<string, string> = {
  urgent: "bg-red-100 text-red-900 ring-red-200",
  high: "bg-orange-100 text-orange-900 ring-orange-200",
  normal: "bg-sky-100 text-sky-900 ring-sky-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase.from("enquiries").select("*").eq("id", id).single();
  if (!data) notFound();
  const enquiry = data as Enquiry;

  // Sender history. Matched on the exact address first — that is the person.
  // Domain matches are shown separately because a colleague writing in is
  // useful context but is not the same relationship.
  const { data: samePerson } = await supabase
    .from("enquiries")
    .select("id, received_at, subject, priority")
    .eq("sender_email", enquiry.sender_email)
    .neq("id", enquiry.id)
    .order("received_at", { ascending: false });

  const { data: sameCompany } = enquiry.sender_domain
    ? await supabase
        .from("enquiries")
        .select("id, received_at, subject, priority, sender_email")
        .eq("sender_domain", enquiry.sender_domain)
        .neq("sender_email", enquiry.sender_email)
        .order("received_at", { ascending: false })
    : { data: [] };

  const profile = enquiry.company_profile;
  const history = samePerson ?? [];
  const colleagues = sameCompany ?? [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link href="/dashboard" className="text-sm text-slate-500 hover:text-slate-900">
        ← All enquiries
      </Link>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {enquiry.subject || "(no subject)"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {enquiry.sender_name ? `${enquiry.sender_name} · ` : ""}
            {enquiry.sender_email}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {new Date(enquiry.received_at).toLocaleString()}
            {enquiry.recipient ? ` · to ${enquiry.recipient}` : ""}
          </p>
        </div>
        {enquiry.priority ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium uppercase tracking-wide ring-1 ${
              PRIORITY_STYLES[enquiry.priority] ?? PRIORITY_STYLES.low
            }`}
          >
            {enquiry.priority}
          </span>
        ) : null}
      </header>

      {/* ── History ─────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-900">History</h2>
        {history.length === 0 && colleagues.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            First contact from this sender.
          </p>
        ) : (
          <div className="mt-2 space-y-3">
            {history.length > 0 ? (
              <div>
                <p className="text-xs text-slate-400">
                  {history.length} previous enquir{history.length === 1 ? "y" : "ies"} from this person
                </p>
                <ul className="mt-1.5 space-y-1">
                  {history.map((h) => (
                    <li key={h.id} className="text-sm">
                      <Link href={`/dashboard/${h.id}`} className="text-slate-700 hover:underline">
                        {h.subject || "(no subject)"}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">
                        {new Date(h.received_at).toLocaleDateString()}
                        {h.priority ? ` · ${h.priority}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {colleagues.length > 0 ? (
              <div>
                <p className="text-xs text-slate-400">
                  {colleagues.length} from others at {enquiry.sender_domain}
                </p>
                <ul className="mt-1.5 space-y-1">
                  {colleagues.map((c) => (
                    <li key={c.id} className="text-sm">
                      <Link href={`/dashboard/${c.id}`} className="text-slate-700 hover:underline">
                        {c.subject || "(no subject)"}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{c.sender_email}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* ── Triage ──────────────────────────────────────────── */}
      {enquiry.priority_reasoning ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-slate-900">Why this priority</h2>
          <p className="mt-2 text-sm text-slate-700">{enquiry.priority_reasoning}</p>
          {enquiry.priority_signals?.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {enquiry.priority_signals.map((s, i) => (
                <li key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                  {s}
                </li>
              ))}
            </ul>
          ) : null}
          {enquiry.respond_by ? (
            <p className="mt-2 text-xs text-slate-500">
              Respond by: <span className="text-slate-700">{enquiry.respond_by}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ── Company ─────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-900">Company</h2>
        {profile ? (
          <div className="mt-2 rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">{profile.company_name}</p>
            <p className="mt-1 text-sm text-slate-700">{profile.what_they_do}</p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
              {profile.industry ? <div><dt className="inline text-slate-400">Industry: </dt><dd className="inline">{profile.industry}</dd></div> : null}
              {profile.size_estimate ? <div><dt className="inline text-slate-400">Size: </dt><dd className="inline">{profile.size_estimate}</dd></div> : null}
              {profile.location ? <div><dt className="inline text-slate-400">Location: </dt><dd className="inline">{profile.location}</dd></div> : null}
            </dl>
            {profile.recent_news?.length ? (
              <ul className="mt-3 space-y-1.5 border-t border-slate-200 pt-3">
                {profile.recent_news.map((n, i) => (
                  <li key={i} className="text-xs text-slate-600">
                    <span className="text-slate-900">{n.headline}</span>
                    {n.date ? <span className="text-slate-400"> · {n.date}</span> : null}
                    <span className="block text-slate-500">{n.why_it_matters}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {profile.sources?.length ? (
              <ul className="mt-3 space-y-0.5 border-t border-slate-200 pt-3">
                {profile.sources.map((src, i) => (
                  <li key={i} className="truncate text-xs">
                    <a href={src} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-700">
                      {src}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            {enquiry.enrichment_status === "skipped_personal_domain"
              ? "Personal email domain — no company to research."
              : enquiry.enrichment_status === "capped"
                ? "Daily research limit reached."
                : enquiry.enrichment_status === "failed"
                  ? `Research failed: ${enquiry.enrichment_error ?? "unknown error"}`
                  : "Not researched yet."}
          </p>
        )}
      </section>

      {/* ── Message ─────────────────────────────────────────── */}
      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-900">Message</h2>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 p-4 font-sans text-sm text-slate-700">
          {enquiry.body_plain || "(empty)"}
        </pre>
      </section>

      <form
        action={async () => {
          "use server";
          await reprocessEnquiry(id);
        }}
        className="mt-8 border-t border-slate-200 pt-6"
      >
        <button
          type="submit"
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
        >
          Re-run research &amp; triage
        </button>
        <span className="ml-3 text-xs text-slate-400">
          Takes up to a minute. Counts against the daily cap.
        </span>
      </form>
    </main>
  );
}
