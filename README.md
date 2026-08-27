# Email Intake & Triage CRM

An inbound enquiry handling system. Someone emails a dedicated address; the system
researches their company, writes a structured record, checks whether they've emailed
before, assigns a priority with reasoning, and surfaces it on a login-gated dashboard
where records can be updated by chatting in plain language.

**Live:** https://email-intake-crm.vercel.app
**Intake address:** `intake@mg.storyworks.asia`

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) on **Vercel**
- **Supabase** — Postgres, Row Level Security, Auth
- **Claude** (Anthropic API) — company research, priority classification, record-update chat
- **Mailgun** — inbound email routing

## Pipeline

```
email -> Mailgun MX -> route: forward()
      -> POST /api/inbound/mailgun  (verify HMAC signature, insert row, return 200)
      -> Supabase enquiries table
      -> [enrichment + classification, separate path]
      -> dashboard
```

The webhook stays thin on purpose. Mailgun retries any non-2xx response for hours, and
two Claude calls would blow past its timeout — so the handler verifies, inserts, and
returns 200. Enrichment happens off the request path.

## Progress against the build order

- [x] 1. Scaffold Next.js, connect Supabase + Vercel
- [x] 2. Inbound webhook writing raw rows — **confirmed end to end with a real email**
- [x] 3. Bare dashboard listing rows
- [x] 4. Company-domain enrichment (Claude + web search)
- [x] 5. Priority classification (Claude)
- [x] 6. Supabase Auth (Google + email/password, sign-up and sign-in)
- [x] 7. Per-enquiry detail view, sender history
- [ ] 8. Chat-based record updates
- [x] 9. Rate limit / daily cap on the public webhook — *pulled forward to step 4*

## Debugging log

Every problem hit during this build — with the actual error text, the real cause,
and the fix — is documented in **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**.

It covers seven issues, including two application bugs that failed completely
silently, a DNS misconfiguration that made inbound mail impossible, and two
occasions where work still in flight was wrongly declared dead. The closing
section draws out what the failures had in common.


## Known limitations

- **Supabase free-tier projects pause after inactivity.** A paused project means the
  webhook's insert fails and Mailgun retries. A keep-alive is planned.
- **The webhook is a public endpoint that triggers paid Claude calls.** HMAC signature
  verification means only Mailgun can invoke it, and a hard daily cap (`ENRICHMENT_DAILY_CAP`,
  currently 25) bounds the spend. The cap is claimed with a single atomic Postgres
  statement and fails closed. Measured cost is roughly \$0.15-0.25 per enriched enquiry
  at medium effort; a full-effort run measured \$0.54, almost entirely from web search
  results being fed back into context.
- **Email confirmation is enabled and uses Supabase's built-in email service.**
  Delivery works but is slow (measured: ~3 minutes) and the free tier allows
  only a few messages per hour, so repeated sign-up testing will hit the limit.
  Custom SMTP via Mailgun is the proper fix and remains outstanding.
- **Priority quality depends on `src/lib/business-context.ts`.** That file describes what
  a valuable enquiry looks like for this specific business. It is the difference between
  real triage and a keyword rule, and it should be edited to match reality.
- **Every push to `main` deploys to production.** The GitHub repo is connected to the
  Vercel project, so a broken commit goes live. `npm run build` passing locally is the
  gate before each commit.


## Local development

```bash
npm install
cp .env.example .env.local   # then fill in every value
npm run dev
```

Database migrations live in `supabase/migrations/` and are applied with:

```bash
supabase db push --db-url "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```
