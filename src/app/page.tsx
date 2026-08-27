import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-gradient-to-br from-brand to-brand-deep px-6 py-16">
      <div className="mx-auto max-w-2xl">
      <h1 className="text-4xl font-semibold tracking-tight text-white">
        Email Intake &amp; Triage CRM
      </h1>
      <p className="mt-4 text-lg leading-relaxed text-white/80">
        Inbound enquiries are received by email, enriched with a company profile, assigned
        a priority with reasoning, and surfaced on a dashboard.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex w-fit rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-deep shadow-sm transition-transform hover:-translate-y-0.5"
      >
        View dashboard
      </Link>
      </div>
    </main>
  );
}
