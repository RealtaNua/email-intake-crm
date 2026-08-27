import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { LocalTime } from "@/components/local-time";
import type { CompanyProfile } from "@/lib/types";

export const dynamic = "force-dynamic";

type CompanyRow = {
  id: string;
  domain: string;
  profile: CompanyProfile | null;
  enrichment_status: string;
  enrichment_error: string | null;
  enriched_at: string | null;
  contacts: { id: string; name: string | null; email: string; status: string }[];
};

export default async function CompaniesPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("companies")
    .select("*, contacts ( id, name, email, status )")
    .order("created_at", { ascending: false });

  const companies = (data ?? []) as unknown as CompanyRow[];

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Companies</h1>
        <p className="mt-0.5 text-sm text-white/70">
          Researched once per domain. Contacts from a known company reuse the profile
          rather than paying for it again.
        </p>
      </header>

      {companies.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="font-medium text-ink">No companies yet</p>
          <p className="mt-1 text-sm text-ink-muted">
            Companies appear when someone writes in from a work email domain.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {companies.map((company) => (
            <li key={company.id} className="card card-hover p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-ink">
                  {company.profile?.company_name ?? company.domain}
                </p>
                <span className="shrink-0 text-xs text-ink-muted">{company.domain}</span>
              </div>

              {company.profile ? (
                <>
                  <p className="mt-1.5 text-sm text-ink">{company.profile.what_they_do}</p>
                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
                    {company.profile.industry ? (
                      <div><dt className="inline text-slate-400">Industry: </dt><dd className="inline">{company.profile.industry}</dd></div>
                    ) : null}
                    {company.profile.size_estimate ? (
                      <div><dt className="inline text-slate-400">Size: </dt><dd className="inline">{company.profile.size_estimate}</dd></div>
                    ) : null}
                    {company.profile.location ? (
                      <div><dt className="inline text-slate-400">Location: </dt><dd className="inline">{company.profile.location}</dd></div>
                    ) : null}
                  </dl>
                </>
              ) : (
                <p className="mt-1.5 text-sm text-slate-500">
                  {company.enrichment_status === "failed"
                    ? `Research failed: ${company.enrichment_error ?? "unknown error"}`
                    : company.enrichment_status === "capped"
                      ? "Daily research limit reached."
                      : "Researching…"}
                </p>
              )}

              <div className="mt-3 border-t border-slate-100 pt-3">
                <p className="text-xs text-slate-400">
                  {company.contacts.length} contact{company.contacts.length === 1 ? "" : "s"}
                  {company.enriched_at ? (
                    <> · researched <LocalTime iso={company.enriched_at} variant="date" /></>
                  ) : null}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                  {company.contacts.map((contact) => (
                    <li key={contact.id} className="text-sm">
                      <Link href={`/dashboard/${contact.id}`} className="text-slate-600 hover:underline">
                        {contact.name || contact.email}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
