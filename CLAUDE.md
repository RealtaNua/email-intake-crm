# CLAUDE.md — Email Intake & Triage CRM (MVP)

## What this is

An inbound enquiry handling system. Someone emails a dedicated address; the system
researches their company, writes a structured record to Supabase, checks whether
they've emailed before, assigns a priority with reasoning, and surfaces it all on a
login-gated dashboard where the owner can update records by chatting in plain language.

It is a portfolio project for a part-time ACLP trainer role interview (advanced AI
agents / automation). The evaluation stage requires a **working, deployed public web
app** — not a slide deck — built on Claude, Vercel, and Supabase, demonstrating real
hosting/deployment, live debugging ability, and GitHub familiarity.

The differentiator over a contact form: it pulls in context beyond the message itself,
takes real action beyond sending a notification, and applies judgment specific to the
business rather than a generic keyword rule.

## Non-negotiable working conventions

**Commit in small, real increments as you go. Do not batch work into one large commit
at the end.** The "live debugging" requirement of the interview is being met through
honest git history: real commits showing real bugs hit and fixed during the build (a
missing RLS policy, a missing env var in Vercel, etc.).

- Commit messages describe **what actually broke and how it was fixed**, not "add feature".
- When a real error is hit, capture the **actual error text** and add it to the README's
  debugging section. Do not paraphrase or invent errors after the fact.
- Never fabricate a bug or a commit for narrative effect. The history has to be true.

## Tech stack

- **Next.js** deployed on **Vercel**
- **Supabase**: Postgres, Row Level Security, Auth
- **Anthropic API (Claude)** for: company research/summarisation, priority
  classification with reasoning, and the record-update chat interface
- **Inbound email** via Postmark or SendGrid inbound parse — whichever has the simpler
  DNS setup for the domain in use. Default lean: Postmark (one MX record on a
  subdomain, no full domain verification needed just to receive).

### Auth requirements (both must work, both must be tested)

1. Sign in with Google
2. Email/password — **both sign-up (new account creation) and sign-in (returning user)**

Testing only one path does not count as done.

## Architecture decisions

1. **The webhook returns fast.** Postmark/SendGrid retry on non-2xx, and enrichment is
   multiple Claude calls. The inbound webhook writes the raw row and returns 200
   immediately; enrichment and classification happen on a separate path. This also means
   the spend cap is enforced on the enrichment path, not on the insert.
2. **Company research uses the Anthropic API's server-side web search tool** rather than
   a separate search provider — one less API key, one less account.
3. **The chat interface updates structured columns** via Claude tool-use against a
   defined tool schema (e.g. `add_note`, `record_payment`, `set_status`), not free-text
   appended to a blob column. Updating the actual structured record is the point.

## Build order — thinnest slice first, do not build in parallel

1. Scaffold Next.js; connect to the Supabase project and the Vercel project.
2. Inbound email webhook endpoint: receive payload, write a raw row to `enquiries`.
   **Confirm end to end (send a real test email, see the row appear) before anything else.**
3. Bare unauthenticated dashboard page listing rows. Confirm the pipeline is visibly working.
4. Company-domain enrichment (Claude + web search) on new rows.
5. Priority classification (Claude) on new rows.
6. Supabase Auth; gate the dashboard. Google + email/password sign-up *and* sign-in.
7. Fuller dashboard UI: per-enquiry detail view, history lookup by sender email.
8. Chat-based record update interface — last, because it benefits from real data to test
   against and is the most open-ended piece.
9. Rate limit / daily cap on the public webhook path **before considering this deployable**.

## Explicitly out of scope (stretch goals, not MVP)

- WhatsApp notifications for high-priority enquiries. Infrastructure exists from a
  separate project, but Meta template approval timing is outside our control — keep it
  off the critical path.
- User-defined notification rules set in natural language ("only alert me for enquiries
  over $X").
- Person-level enrichment beyond what's inferable from a work email domain. For personal
  domains (gmail.com etc.), **skip person-level identification entirely** — unreliable
  without a paid enrichment API.
- Any third-party CRM integration (HubSpot, Salesforce, etc.). The CRM *is* this app's
  own Supabase-backed dashboard.

## Known risks to design around

- **Supabase free-tier projects pause after inactivity.** Note this in the README as a
  known limitation; add a basic keep-alive if time allows.
- **The Claude API is reachable from a public endpoint** (the inbound email webhook
  triggers it). This needs a rate limit or daily cap **built in from the start**, not
  bolted on later, to avoid open-ended cost exposure.

## Definition of done

A public URL where:

- New enquiries sent to the intake address appear on the login-gated dashboard within a
  minute or two, enriched with a company profile and a priority rating with visible reasoning.
- Returning senders show prior history on their record.
- The owner can log in, view the board, and update a record by typing a plain-language
  note into a chat box tied to that record.
- The GitHub repo shows real, incremental commit history reflecting actual problems hit,
  plus a README documenting the real errors and their fixes.

## Current status

Nothing built yet. Working directory is empty; no git repo initialised.

Local tooling: node v24, npm 11. `vercel`, `supabase`, and `gh` CLIs are **not installed**.

Credentials still needed before step 1: Supabase project URL / anon key / service role
key, Anthropic API key, GitHub repo name, Vercel project, and the domain + DNS host for
the intake address. Secrets go in `.env.local`, gitignored from the first commit.
