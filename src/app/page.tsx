import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Email Intake &amp; Triage CRM
      </h1>
      <p className="mt-4 text-slate-600">
        Inbound enquiries are received by email, enriched with a company profile, assigned
        a priority with reasoning, and surfaced on a dashboard.
      </p>
      <Link
        href="/dashboard"
        className="mt-8 inline-flex w-fit rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
      >
        View dashboard
      </Link>
    </main>
  );
}
