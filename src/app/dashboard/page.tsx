import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { LocalTime } from "@/components/local-time";
import { MessageView } from "@/components/message-view";
import { NextStep } from "@/components/next-step";
import { StatTile } from "@/components/stat-tile";
import { Badge, PRIORITY_TONE, CONVERSATION_TONE } from "@/components/badge";
import {
  CONVERSATION_LABELS,
  PRIORITY_LABELS,
  attentionLevel,
  ballInOurCourt,
  type ContactWithRelations,
  type MessageState,
} from "@/lib/types";

export const dynamic = "force-dynamic";

/** One group of next-step lines, each anchoring down to its contact's card. */
function NextStepGroup({
  label,
  dotClassName,
  items,
}: {
  label: string;
  dotClassName: string;
  items: { contact: ContactWithRelations }[];
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {label} · {items.length}
      </p>
      {items.length ? (
        <ul className="mt-2 space-y-0.5">
          {items.map(({ contact }) => (
            <li key={contact.id}>
              <a
                href={`#contact-${contact.id}`}
                title={contact.next_step ?? undefined}
                className="-mx-2 flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {contact.name || contact.email}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">{contact.next_step}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-ink-muted">Nothing outstanding.</p>
      )}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createServerSupabase();

  // Contacts are the unit of the CRM. Enquiries hang underneath them, which is
  // why this reads from contacts rather than from the message log.
  const { data, error } = await supabase
    .from("contacts")
    .select("*, companies ( domain, profile, enrichment_status ), enquiries ( id, subject, priority, received_at, direction, body_plain, body_full, summary, sender_name, sender_email, recipient )")
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <div className="card p-6">
        <h1 className="text-lg font-semibold text-red-900">Could not load contacts</h1>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error.message}
        </pre>
      </div>
    );
  }

  const contacts = (data ?? []) as unknown as ContactWithRelations[];

  // The tiles count the table, not this page. The list above is capped at 100
  // contacts, and a message whose sender could not be resolved hangs off no
  // contact at all, so adding up what was rendered under-reports both totals.
  // Both reads below are narrow — a few columns, no bodies, no joins.
  const [{ data: stateRows }, { data: messageRows }] = await Promise.all([
    supabase.from("contacts").select("id, conversation_status"),
    supabase.from("enquiries").select("contact_id, direction, priority, received_at"),
  ]);

  // If either read fails, fall back to the contacts already in hand rather than
  // showing a zero that reads as "nothing here" instead of "could not count".
  const states = stateRows ?? contacts.map((c) => ({ id: c.id, conversation_status: c.conversation_status }));
  const allMessages =
    messageRows ??
    contacts.flatMap((c) =>
      (c.enquiries ?? []).map((e) => ({
        contact_id: c.id,
        direction: e.direction,
        priority: e.priority,
        received_at: e.received_at,
      })),
    );

  const messagesByContact = new Map<string, MessageState[]>();
  for (const m of allMessages) {
    if (!m.contact_id) continue;
    const forContact = messagesByContact.get(m.contact_id) ?? [];
    forContact.push(m);
    messagesByContact.set(m.contact_id, forContact);
  }

  const waitingOnUs = states.filter((c) => ballInOurCourt(c, messagesByContact.get(c.id) ?? [])).length;
  const attention = states.map((c) => attentionLevel(c, messagesByContact.get(c.id) ?? []));
  const urgent = attention.filter((level) => level === "urgent").length;
  const highPriority = attention.filter((level) => level === "high").length;
  const messages = allMessages.length;

  // Every outstanding next step, in one place, split by whose turn it is —
  // the same judgement the badges below use, so this panel and the list it
  // links into can't disagree about who owes what.
  const RANK: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
  const outstanding = contacts
    .filter((c) => c.next_step && c.next_step.trim().toLowerCase() !== "none")
    .map((c) => ({
      contact: c,
      onUs: ballInOurCourt(c, c.enquiries ?? []),
      level: attentionLevel(c, c.enquiries ?? []),
    }))
    .sort((a, b) => (RANK[b.level ?? ""] ?? 0) - (RANK[a.level ?? ""] ?? 0));
  // Low priority is pulled out ahead of the on-us/on-them split — "ignore, or
  // send a one-line decline" isn't really waiting on either side, and lumping
  // it into "Waiting on them" made a courtesy-reply-or-skip case look like a
  // live conversation sitting with the other party.
  const urgentSteps = outstanding.filter((n) => n.onUs && n.level === "urgent");
  const waitingOnUsSteps = outstanding.filter((n) => n.onUs && n.level !== "urgent" && n.level !== "low");
  const waitingOnThemSteps = outstanding.filter((n) => !n.onUs && n.level !== "low");
  const lowPrioritySteps = outstanding.filter((n) => n.level === "low");

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Contacts</h1>
          <p className="mt-0.5 text-sm text-white/70">
            Inbound to intake@mg.storyworks.asia
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Contacts" value={states.length} accent="brand" />
        <StatTile label="Waiting on us" value={waitingOnUs} accent="amber" hint="Ball in our court" />
        <StatTile label="Urgent" value={urgent} accent="red" hint="Needs a reply today" />
        <StatTile
          label="High priority"
          value={highPriority}
          accent="orange"
          hint="Important, not due today"
        />
        <StatTile label="Messages" value={messages} accent="slate" hint="Both directions" />
      </div>

      {outstanding.length > 0 ? (
        <section className="card mt-4 p-6">
          <h2 className="text-base font-semibold text-ink">Next steps</h2>
          <div className="mt-3 space-y-5">
            <NextStepGroup label="Urgent" dotClassName="bg-red-500" items={urgentSteps} />
            <NextStepGroup label="Waiting on us" dotClassName="bg-amber-500" items={waitingOnUsSteps} />
            <NextStepGroup label="Waiting on them" dotClassName="bg-slate-300" items={waitingOnThemSteps} />
            <NextStepGroup label="Low priority" dotClassName="bg-slate-300" items={lowPrioritySteps} />
          </div>
        </section>
      ) : null}

      {contacts.length === 0 ? (
        <div className="card mt-6 px-6 py-16 text-center">
          <p className="font-medium text-ink">No contacts yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Send an email to the intake address and it will appear here within a minute.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {contacts.map((contact) => {
            // The badge is the same judgement the tiles count, so the two can
            // never disagree about what a contact needs.
            const priority = attentionLevel(contact, contact.enquiries ?? []);
            const profile = contact.companies?.profile ?? null;
            const count = contact.enquiries?.length ?? 0;

            return (
              <li
                key={contact.id}
                id={`contact-${contact.id}`}
                className="card card-hover scroll-mt-6 p-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <Link
                      href={`/dashboard/${contact.id}`}
                      className="text-base font-semibold text-ink hover:text-brand"
                    >
                      {contact.name || contact.email}
                    </Link>
                    <p className="mt-0.5 text-sm text-ink-muted">{contact.email}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {contact.conversation_status ? (
                      <Badge tone={CONVERSATION_TONE[contact.conversation_status] ?? "slate"}>
                        {CONVERSATION_LABELS[contact.conversation_status] ?? contact.conversation_status}
                      </Badge>
                    ) : null}
                    {priority ? (
                      <Badge tone={PRIORITY_TONE[priority] ?? "slate"} uppercase>
                        {PRIORITY_LABELS[priority] ?? priority}
                      </Badge>
                    ) : null}
                    <LocalTime
                      iso={contact.last_seen_at}
                      variant="relative"
                      className="text-xs tabular-nums text-ink-muted"
                    />
                  </div>
                </div>

                {profile ? (
                  <p className="mt-3 text-sm text-ink">
                    <span className="font-medium">{profile.company_name}</span>
                    {profile.industry ? (
                      <span className="text-ink-muted"> · {profile.industry}</span>
                    ) : null}
                  </p>
                ) : contact.company_id ? (
                  <p className="mt-3 text-xs text-ink-muted">Researching {contact.domain}…</p>
                ) : (
                  <p className="mt-3 text-xs text-ink-muted">Personal email domain</p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  {contact.status !== "new" ? <Badge tone="emerald">{contact.status}</Badge> : null}
                  {contact.total_received > 0 ? (
                    <Badge tone="emerald">
                      ${Number(contact.total_received).toLocaleString()} received
                    </Badge>
                  ) : null}
                  {contact.remarks ? <Badge tone="violet">Has remarks</Badge> : null}
                </div>

                {/* Vertical timeline: one dated line per message. A count tells
                    you nothing; a paragraph makes you read all of it to find the
                    one line you need. */}
                <ol className="mt-4 border-t border-slate-100 pt-4">
                  {[...(contact.enquiries ?? [])]
                    .sort((a, b) => +new Date(a.received_at) - +new Date(b.received_at))
                    .map((message) => {
                      const outbound = message.direction === "outbound";
                      return (
                        <li key={message.id} className="flex gap-3 pb-3 last:pb-0">
                          <LocalTime
                            iso={message.received_at}
                            className="w-28 shrink-0 pt-0.5 text-xs tabular-nums text-ink-muted"
                          />
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              outbound ? "bg-slate-300" : "bg-brand"
                            }`}
                            aria-hidden="true"
                          />
                          <details className="min-w-0 flex-1">
                            <summary className="cursor-pointer text-sm text-ink hover:text-brand">
                              <span className={outbound ? "text-ink-muted" : "font-medium text-brand"}>
                                {outbound ? "We: " : "They: "}
                              </span>
                              {message.summary || message.subject || "(no subject)"}
                            </summary>
                            <div className="mt-2">
                              <MessageView message={message} />
                            </div>
                          </details>
                        </li>
                      );
                    })}
                </ol>

                <NextStep
                  text={contact.next_step}
                  urgent={priority === "urgent"}
                  className="mt-4"
                />

                <p className="mt-4 text-xs text-ink-muted">
                  {count} {count === 1 ? "message" : "messages"}
                  {contact.notes?.length ? ` · ${contact.notes.length} note${contact.notes.length === 1 ? "" : "s"}` : ""}
                  {" · "}
                  <Link href={`/dashboard/${contact.id}`} className="font-medium text-brand hover:underline">
                    Open record
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
