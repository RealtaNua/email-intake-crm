import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase, getUser } from "@/lib/supabase/server";
import { reprocessContact, logReply, saveRemarks, type RemarksResult } from "../actions";
import { LocalTime } from "@/components/local-time";
import { MessageView } from "@/components/message-view";
import { NextStep } from "@/components/next-step";
import { RemarksForm } from "@/components/remarks-form";
import { Chevron } from "@/components/chevron";
import { Badge, PRIORITY_TONE, CONVERSATION_TONE } from "@/components/badge";
import {
  CONVERSATION_LABELS,
  attentionLevel,
  type Contact,
  type Company,
  type Enquiry,
} from "@/lib/types";

export const dynamic = "force-dynamic";
// Reprocessing runs research plus a classification per enquiry, inline.
export const maxDuration = 300;

type ContactRecord = Contact & { companies: Company | null };

export default async function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  const { data: { user } } = await getUser();
  if (!user) redirect("/login");

  const { data: contactData } = await supabase
    .from("contacts")
    .select("*, companies ( * )")
    .eq("id", id)
    .single();

  if (!contactData) notFound();
  const contact = contactData as unknown as ContactRecord;

  const { data: enquiryData } = await supabase
    .from("enquiries")
    .select("*")
    .eq("contact_id", id)
    .order("received_at", { ascending: false });

  const enquiries = (enquiryData ?? []) as Enquiry[];
  const profile = contact.companies?.profile ?? null;

  // Other people writing from the same employer. Kept separate from this
  // contact's own history: a colleague is context, not the same relationship.
  const { data: colleagueData } = contact.company_id
    ? await supabase
        .from("contacts")
        .select("id, name, email")
        .eq("company_id", contact.company_id)
        .neq("id", contact.id)
    : { data: [] };
  const colleagues = colleagueData ?? [];

  return (
    <>
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-white/70 hover:text-white">
          ← All contacts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white">
          {contact.name || contact.email}
        </h1>
        <p className="mt-0.5 text-sm text-white/70">{contact.email}</p>
      </div>

      <div className="card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={contact.status === "new" ? "slate" : "emerald"}>{contact.status}</Badge>
          {contact.total_received > 0 ? (
            <Badge tone="emerald">${Number(contact.total_received).toLocaleString()} received</Badge>
          ) : null}
          <span className="text-xs text-ink-muted">
            {enquiries.length} {enquiries.length === 1 ? "message" : "messages"} · first contact{" "}
            <LocalTime iso={contact.first_seen_at} variant="date" />
          </span>
        </div>
      </div>

      {/* ── Where this stands ───────────────────────────────── */}
      {contact.conversation_status || contact.next_step ? (
        <section className="card mt-4 p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Where this stands</h2>
            {contact.conversation_status ? (
              <Badge tone={CONVERSATION_TONE[contact.conversation_status] ?? "slate"}>
                {CONVERSATION_LABELS[contact.conversation_status] ?? contact.conversation_status}
              </Badge>
            ) : null}
          </div>
          <NextStep
            text={contact.next_step}
            urgent={attentionLevel(contact, enquiries) === "urgent"}
            className="mt-3"
          />
        </section>
      ) : null}

      {/* ── Special remarks ─────────────────────────────────── */}
      <RemarksForm
        remarks={contact.remarks}
        action={async (_prev: RemarksResult, formData: FormData) => {
          "use server";
          return saveRemarks(id, _prev, formData);
        }}
      />

      {/* ── Company ─────────────────────────────────────────── */}
      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold text-ink">Company</h2>
        {profile ? (
          <div className="mt-2 rounded-lg bg-slate-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{profile.company_name}</p>
              <span className="text-xs text-slate-400">{contact.companies?.domain}</span>
            </div>
            <p className="mt-1.5 text-sm text-slate-700">{profile.what_they_do}</p>
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
                    <a href={src} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-slate-700">{src}</a>
                  </li>
                ))}
              </ul>
            ) : null}
            {colleagues.length > 0 ? (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="text-xs text-slate-400">Others at this company</p>
                <ul className="mt-1 space-y-0.5">
                  {colleagues.map((c) => (
                    <li key={c.id} className="text-xs">
                      <Link href={`/dashboard/${c.id}`} className="text-slate-600 hover:underline">
                        {c.name || c.email}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            {!contact.company_id
              ? "Personal email domain — no company to research."
              : contact.companies?.enrichment_status === "capped"
                ? "Daily research limit reached."
                : contact.companies?.enrichment_status === "failed"
                  ? `Research failed: ${contact.companies?.enrichment_error ?? "unknown error"}`
                  : "Researching…"}
          </p>
        )}
      </section>

      {/* ── Notes ───────────────────────────────────────────── */}
      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold text-ink">Notes</h2>
        {contact.notes?.length ? (
          <ul className="mt-2 space-y-2">
            {contact.notes.map((note, i) => (
              <li key={i} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm text-slate-700">{note.text}</p>
                <p className="mt-1 text-xs text-slate-400">
                  <LocalTime iso={note.created_at} />
                  {note.source ? ` · ${note.source}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            No notes yet. The chat interface (step 8) writes here.
          </p>
        )}
      </section>

      {/* ── Conversation timeline ───────────────────────────── */}
      <section className="card mt-4 p-6">
        <h2 className="text-sm font-semibold text-ink">Conversation</h2>
        <p className="mt-1 text-xs text-slate-400">
          Oldest first, both directions. Times shown in your timezone — hover for the full timestamp.
        </p>

        <ol className="mt-3 space-y-3 border-l border-slate-200 pl-4">
          {[...enquiries]
            .sort((a, b) => +new Date(a.received_at) - +new Date(b.received_at))
            .map((message) => {
              const outbound = message.direction === "outbound";
              return (
                <li key={message.id} className="relative">
                  <span
                    className={`absolute -left-[21px] top-2 h-2 w-2 rounded-full ${
                      outbound ? "bg-slate-300" : "bg-brand"
                    }`}
                    aria-hidden="true"
                  />
                  <div className={`rounded-lg border p-4 ${outbound ? "border-slate-200 bg-slate-50" : "border-slate-200"}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="min-w-0 text-sm text-slate-800">
                        <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${outbound ? "bg-slate-100 text-slate-500" : "bg-brand/10 text-brand"}`}>
                          {outbound ? "We" : "They"}
                        </span>
                        {message.summary || message.subject || "(no subject)"}
                      </p>
                      <span className="flex shrink-0 items-center gap-2">
                        {!outbound && message.suspected_phishing ? (
                          <Badge tone="rose">
                            <span aria-hidden="true">⚠️</span>&nbsp;Suspected phishing
                          </Badge>
                        ) : null}
                        {!outbound && message.priority ? (
                          <Badge tone={PRIORITY_TONE[message.priority] ?? "slate"} uppercase>
                            {message.priority}
                          </Badge>
                        ) : null}
                        <LocalTime iso={message.received_at} className="text-xs tabular-nums text-slate-400" />
                      </span>
                    </div>

                    {!outbound && message.suspected_phishing ? (
                      <div className="mt-2 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-rose-900">
                        <span aria-hidden="true">⚠️</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                            Suspected scam or phishing
                          </p>
                          <p className="mt-0.5 text-sm">{message.phishing_reasoning}</p>
                        </div>
                      </div>
                    ) : null}

                    {!outbound && message.priority_reasoning ? (
                      <div className="mt-2 border-l-2 border-slate-200 pl-3">
                        <p className="text-sm text-slate-700">{message.priority_reasoning}</p>
                        {message.priority_signals?.length ? (
                          <ul className="mt-2 flex flex-wrap gap-1.5">
                            {message.priority_signals.map((sig, i) => (
                              <li key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{sig}</li>
                            ))}
                          </ul>
                        ) : null}
                        {message.respond_by ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Respond by: <span className="text-slate-700">{message.respond_by}</span>
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <details className="group mt-3">
                      <summary className="flex cursor-pointer items-start gap-1.5 text-xs text-slate-500 hover:text-slate-900">
                        <Chevron className="mt-0.5" />
                        <span className="min-w-0">
                          {message.subject || "(no subject)"} — show full message
                        </span>
                      </summary>
                      <div className="mt-2">
                        <MessageView message={message} />
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
        </ol>

        {/* Logging a reply keeps the record honest about whose turn it is.
            Replies also arrive automatically if the intake address is BCC'd
            and OWNER_EMAILS is configured. */}
        <form
          action={async (formData: FormData) => {
            "use server";
            await logReply(id, formData);
          }}
          className="mt-4 rounded-lg border border-dashed border-slate-300 p-4"
        >
          <h3 className="text-sm font-medium text-slate-900">Log a reply you sent</h3>
          <input
            name="subject"
            placeholder="Subject"
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <textarea
            name="body"
            rows={3}
            required
            placeholder="What you sent them."
            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900"
          />
          <button
            type="submit"
            className="mt-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-deep"
          >
            Log reply
          </button>
          <span className="ml-3 text-xs text-slate-400">
            Re-reads the thread and updates the status. Counts against the daily cap.
          </span>
        </form>
      </section>

      <form
        action={async () => {
          "use server";
          await reprocessContact(id);
        }}
        className="card mt-4 p-6"
      >
        <button
          type="submit"
          className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:bg-slate-50"
        >
          Re-run research &amp; triage
        </button>
        <span className="ml-3 text-xs text-slate-400">
          Re-researches the company and re-rates every enquiry. Counts against the daily cap.
        </span>
      </form>
    </>
  );
}
