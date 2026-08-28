import Link from "next/link";
import Image from "next/image";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center bg-gradient-to-br from-brand to-brand-deep px-6 py-16">
      <div className="mx-auto max-w-2xl">
      <Image
        src="/logo.png"
        alt="Intake CRM"
        width={64}
        height={64}
        className="h-16 w-16 drop-shadow-lg"
        priority
      />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white">
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
