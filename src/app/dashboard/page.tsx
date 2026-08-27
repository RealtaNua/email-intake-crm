import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LocalTime } from "@/components/local-time";
import {
  PRIORITY_STYLES, CONVERSATION_LABELS, CONVERSATION_STYLES,
  topPriority, type ContactWithRelations,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Contacts are the unit of the CRM. Enquiries hang underneath them, which is
  // why this reads from contacts rather than from the message log.
  const { data, error } = await supabase
    .from("contacts")
    .select("*, companies ( domain, profile, enrichment_status ), enquiries ( id, subject, priority, received_at, direction, body_plain, summary )")
    .order("last_seen_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-16">
        <h1 className="text-2xl font-semibold text-red-900">Could not load contacts</h1>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error.message}
        </pre>
      </main>
    );
  }

  const contacts = (data ?? []) as unknown as ContactWithRelations[];

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Contacts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Inbound to{" "}
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700">
              intake@mg.storyworks.asia
            </code>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm tabular-nums text-slate-500">
            {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
          </span>
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
      </header>

      {contacts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-6 py-16 text-center">
          <p className="text-slate-900">No contacts yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Send an email to the intake address and it will appear here within a minute.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {contacts.map((contact) => {
            const priority = topPriority(contact.enquiries ?? []);
            const profile = contact.companies?.profile ?? null;
            const count = contact.enquiries?.length ?? 0;

            return (
              <li key={contact.id} className="rounded-xl border border-slate-200 bg-white p-5 transition-colors hover:border-slate-300">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link href={`/dashboard/${contact.id}`} className="font-medium text-slate-900 hover:underline">
                    {contact.name || contact.email}
                  </Link>
                  <span className="flex shrink-0 items-center gap-2">
                    {contact.conversation_status ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${CONVERSATION_STYLES[contact.conversation_status] ?? ""}`}>
                        {CONVERSATION_LABELS[contact.conversation_status] ?? contact.conversation_status}
                      </span>
                    ) : null}
                    {priority ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${PRIORITY_STYLES[priority]}`}>
                        {priority}
                      </span>
                    ) : null}
                    <LocalTime iso={contact.last_seen_at} variant="relative" className="text-xs tabular-nums text-slate-500" />
                  </span>
                </div>

                <p className="mt-1 text-sm text-slate-600">
                  {contact.email}
                  {contact.status !== "new" ? (
                    <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-800">{contact.status}</span>
                  ) : null}
                  {contact.total_received > 0 ? (
                    <span className="ml-2 text-xs text-slate-500">
                      ${Number(contact.total_received).toLocaleString()} received
                    </span>
                  ) : null}
                </p>

                {profile ? (
                  <p className="mt-2 text-sm text-slate-700">
                    <span className="font-medium">{profile.company_name}</span>
                    {profile.industry ? <span className="text-slate-500"> · {profile.industry}</span> : null}
                  </p>
                ) : contact.company_id ? (
                  <p className="mt-2 text-xs text-slate-400">Researching {contact.domain}…</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">Personal email domain</p>
                )}

                {/* Vertical timeline: one dated line per message. A count tells
                    you nothing; a paragraph makes you read all of it to find the
                    one line you need. */}
                <ol className="mt-3 border-t border-slate-100 pt-3">
                  {[...(contact.enquiries ?? [])]
                    .sort((a, b) => +new Date(a.received_at) - +new Date(b.received_at))
                    .map((message) => {
                      const outbound = message.direction === "outbound";
                      return (
                        <li key={message.id} className="relative flex gap-3 pb-3 last:pb-0">
                          <LocalTime
                            iso={message.received_at}
                            className="w-28 shrink-0 pt-0.5 text-xs tabular-nums text-slate-400"
                          />
                          <span
                            className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                              outbound ? "bg-slate-300" : "bg-slate-900"
                            }`}
                            aria-hidden="true"
                          />
                          <details className="min-w-0 flex-1">
                            <summary className="cursor-pointer text-sm text-slate-700 marker:text-slate-300">
                              <span className={outbound ? "text-slate-500" : "text-slate-800"}>
                                {outbound ? "We: " : "They: "}
                              </span>
                              {message.summary || message.subject || "(no subject)"}
                            </summary>
                            <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">
                              {message.body_plain || "(empty)"}
                            </pre>
                          </details>
                        </li>
                      );
                    })}
                </ol>

                {contact.next_step && contact.next_step !== "None" ? (
                  <p className="mt-2 border-t border-slate-100 pt-3 text-sm">
                    <span className="text-slate-400">Next: </span>
                    <span className="text-slate-700">{contact.next_step}</span>
                  </p>
                ) : null}

                <p className="mt-3 text-xs text-slate-500">
                  {count} {count === 1 ? "message" : "messages"}
                  {contact.notes?.length ? ` · ${contact.notes.length} note${contact.notes.length === 1 ? "" : "s"}` : ""}
                  {contact.remarks ? " · has remarks" : ""}
                  {" · "}
                  <Link href={`/dashboard/${contact.id}`} className="text-slate-600 hover:underline">
                    Open record
                  </Link>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
