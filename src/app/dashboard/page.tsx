import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { PRIORITY_STYLES, timeAgo, topPriority, type ContactWithRelations } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Contacts are the unit of the CRM. Enquiries hang underneath them, which is
  // why this reads from contacts rather than from the message log.
  const { data, error } = await supabase
    .from("contacts")
    .select("*, companies ( domain, profile, enrichment_status ), enquiries ( id, subject, priority, received_at )")
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
                    {priority ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${PRIORITY_STYLES[priority]}`}>
                        {priority}
                      </span>
                    ) : null}
                    <time className="text-xs tabular-nums text-slate-500">{timeAgo(contact.last_seen_at)}</time>
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

                <p className="mt-3 text-xs text-slate-500">
                  {count} {count === 1 ? "enquiry" : "enquiries"}
                  {contact.notes?.length ? ` · ${contact.notes.length} note${contact.notes.length === 1 ? "" : "s"}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
