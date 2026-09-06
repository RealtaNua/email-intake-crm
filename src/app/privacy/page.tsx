import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — Intake CRM",
  description:
    "What Intake CRM collects when you email it, where that data is processed, who can see it, and how to have it removed.",
};

// Last substantive review of this policy. Update it when the data flow changes,
// not on every deploy — a date that moves without the text moving is noise.
const LAST_UPDATED = "6 September 2026";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-muted">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-full bg-page">
      <div className="bg-gradient-to-br from-brand to-brand-deep pb-24 pt-12">
        <div className="mx-auto max-w-3xl px-6">
          <Link
            href="/"
            className="text-sm text-white/70 transition-colors hover:text-white"
          >
            ← Intake CRM
          </Link>
          <h1 className="mt-4 text-3xl font-semibold text-white">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-white/70">
            Last updated {LAST_UPDATED}
          </p>
        </div>
      </div>

      <div className="mx-auto -mt-20 max-w-3xl space-y-4 px-6 pb-20">
        <Section title="What this system is">
          <p>
            Intake CRM is an inbound enquiry handling system operated by
            Storyworks Consulting. It receives email sent to a dedicated intake
            address, researches the sender&rsquo;s organisation, and presents the
            resulting record on a login-gated dashboard so enquiries can be
            prioritised and answered.
          </p>
          <p>
            It is also a portfolio and demonstration project. Most of the
            contacts currently visible in the dashboard are synthetic records
            created during development, not real people. Where a record is
            genuine, it is because that person emailed the intake address.
          </p>
        </Section>

        <Section title="What we collect, and how">
          <p>
            We do not operate trackers, advertising pixels or third-party
            analytics on this site, and the public pages set no cookies. There
            are two ways data reaches this system:
          </p>
          <p className="font-medium text-ink">1. You email the intake address</p>
          <p>
            Everything in the message you sent is stored: your name and email
            address as they appear in the headers, the recipients, the subject,
            the full message body, the time it was sent, and the technical
            transport headers your mail server attached. If you did not email
            us, we hold nothing about you.
          </p>
          <p className="font-medium text-ink">
            2. We look up your organisation
          </p>
          <p>
            From the domain of your email address, we research the organisation
            using publicly available web sources and store a short profile of
            it. This is deliberately limited to the organisation. We do not
            build a profile of you as an individual, and we do not buy, enrich
            from, or cross-reference third-party personal data brokers.
          </p>
          <p>
            Signing in to the dashboard sets a session cookie. That cookie is
            strictly necessary for authentication and is used for nothing else.
          </p>
        </Section>

        <Section title="How the data is used">
          <p>
            Your message is passed to Anthropic&rsquo;s Claude API, which writes
            a one-sentence summary, assigns a priority with written reasoning,
            and flags messages showing a concrete sign of impersonation. Those
            outputs are advisory. No reply is ever sent automatically: a person
            reviews the record and decides what to do, and a human being clicks
            send on every outbound email.
          </p>
          <p>
            Under Anthropic&rsquo;s commercial terms, data sent through the API
            is not used to train their models.
          </p>
        </Section>

        <Section title="Who processes it, and where">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-ink">Mailgun</span> — receives
              and sends the email. United States region.
            </li>
            <li>
              <span className="font-medium text-ink">Vercel</span> — hosts the
              application. Requests are served from Singapore.
            </li>
            <li>
              <span className="font-medium text-ink">Supabase</span> — stores
              the database. Singapore region (ap-southeast-1).
            </li>
            <li>
              <span className="font-medium text-ink">Anthropic</span> —
              processes message text to produce the summary and priority.
              United States.
            </li>
          </ul>
          <p>
            Using these services means your message is transferred outside
            Singapore, to the United States. We rely on each provider&rsquo;s
            contractual data protection terms for that transfer.
          </p>
        </Section>

        <Section title="Who can see it">
          <p>
            One operator. Access requires a confirmed account and a valid
            session; the database enforces this itself through row-level
            security rather than relying on the application to check. An
            unauthenticated request returns no rows even when it presents the
            public API key that ships in the browser, and accounts that can sign
            in are granted read and update only — they cannot insert or delete
            records. Records are created solely by the mail webhook, which
            accepts a message only after verifying its cryptographic signature.
          </p>
          <p>
            We do not sell your data, share it with advertisers, or disclose it
            to anyone outside the processors listed above, except where we are
            legally required to.
          </p>
        </Section>

        <Section title="How long it is kept">
          <p>
            Enquiries are retained while the enquiry is live and for as long as
            the business relationship makes it useful to keep them. There is
            currently no automated deletion schedule; records are reviewed and
            removed manually. If you want your record removed sooner, ask and we
            will delete it.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Under Singapore&rsquo;s Personal Data Protection Act you may ask
            what personal data we hold about you and how it has been used, ask
            us to correct anything inaccurate, ask us to delete it, and withdraw
            consent for further processing.
          </p>
          <p>
            To make any of those requests, or to raise a concern about how this
            system has handled your data, email{" "}
            <a
              className="font-medium text-brand hover:underline"
              href="mailto:intake@mg.storyworks.asia"
            >
              intake@mg.storyworks.asia
            </a>
            . A person reads that address and will respond.
          </p>
        </Section>

        <Section title="Automated decisions">
          <p>
            The priority rating and the impersonation flag are produced by a
            language model and can be wrong. They are shown to a human alongside
            the reasoning behind them, and they do not by themselves decide
            anything about you: no message is deleted, rejected or replied to on
            the strength of a model output alone. If you believe a rating about
            your enquiry is wrong, tell us at the address above and a person
            will look at it.
          </p>
        </Section>

        <Section title="Security">
          <p>
            The application was scanned by an independent automated security
            service (ZeroThreat) on 6 September 2026, which reported no critical
            and no high severity findings, and an A+ grade for the TLS
            certificate. The medium and low findings were missing HTTP security
            headers; those have been added. The access controls described above
            were separately verified by direct testing.
          </p>
          <p>
            If you find a security issue in this application, please report it
            to the address above rather than disclosing it publicly, and we will
            respond.
          </p>
        </Section>

        <p className="px-2 pt-4 text-xs text-ink-muted">
          Intake CRM is operated by Storyworks Consulting. This policy describes
          the system as it actually behaves today; where something is not yet
          automated, it says so.
        </p>
      </div>
    </main>
  );
}
