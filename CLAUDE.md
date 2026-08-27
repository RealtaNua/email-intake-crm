# CLAUDE.md — Email Intake & Triage CRM

## What this is

An inbound enquiry handling system. Someone emails a dedicated address; the system
researches their company, writes a structured record to Supabase, checks whether
they've emailed before, assigns a priority with reasoning, and surfaces it on a
login-gated dashboard where records can be updated by chatting in plain language.

Portfolio project for a part-time ACLP trainer role interview (advanced AI agents /
automation). The evaluation stage requires a **working, deployed public web app** —
not a slide deck — built on Claude, Vercel, and Supabase, demonstrating real hosting
and deployment, live debugging ability, and GitHub familiarity.

The differentiator over a contact form: it pulls in context beyond the message
itself, takes real action beyond sending a notification, and applies judgment
specific to the business rather than a generic keyword rule.

**Live:** https://email-intake-crm.vercel.app
**Repo:** https://github.com/RealtaNua/email-intake-crm
**Intake address:** `intake@mg.storyworks.asia`

---

## Current status

**Steps 1–7 and 9 are done and deployed. Step 8 (chat-based record updates) is the
only build item remaining.** 18 commits.

- [x] 1. Scaffold Next.js, connect Supabase + Vercel
- [x] 2. Inbound webhook writing raw rows — confirmed with a real email end to end
- [x] 3. Bare dashboard listing rows
- [x] 4. Company-domain enrichment (Claude + web search)
- [x] 5. Priority classification with reasoning (Claude)
- [x] 6. Supabase Auth — Google + email/password, sign-up and sign-in both verified
- [x] 7. Contact detail view, company grouping, reprocess action
- [x] 7b. **Restructured from an email log into a real CRM** (migration 0005)
- [ ] 8. **Chat-based record updates — NEXT**
- [x] 9. Rate limit / daily cap — pulled forward into step 4

### Open items, deliberately not dropped

1. **`src/lib/business-context.ts` contains inferred content, not verified fact.**
   It was written from limited information about the business and drives every
   priority rating in the system. The owner has been asked twice to edit it. Do not
   present ratings as authoritative until it reflects reality.
2. **Mailgun SMTP for Supabase Auth emails** — deferred by the owner's explicit
   choice. Confirmation emails currently take ~3 minutes via Supabase's built-in
   service, which is also rate-limited to a few per hour.
3. **Supabase free-tier pause** — documented as a known limitation; no keep-alive
   built yet.

---

## Project structure

```
src/
  middleware.ts               Session refresh + /dashboard gating
  app/
    page.tsx                  Landing
    login/page.tsx            Google + email/password (sign-up and sign-in)
    auth/callback/route.ts    OAuth / confirmation code exchange
    auth/signout/route.ts     POST -> sign out -> /login
    dashboard/page.tsx        Contact list (the CRM view)
    dashboard/[id]/page.tsx   Contact record: company, notes, all their enquiries
    dashboard/actions.ts      Server actions: reprocessContact(), reprocessEnquiry()
    api/inbound/mailgun/      Inbound webhook (verify -> insert -> 200 -> after())
  lib/
    env.ts                    requireEnv() — SERVER ONLY, see gotcha below
    mailgun.ts                HMAC signature verification, From header parsing
    claude.ts                 Client, MODEL, daily cap claim, token accounting
    enrichment.ts             enrichCompany(id) — research per DOMAIN, done once
    contacts.ts               resolveContact() — upsert company + contact per email
    classification.ts         Priority + reasoning -> priority, priority_reasoning
    business-context.ts       EDITABLE business rules driving triage judgment
    personal-domains.ts       gmail.com etc — skip enrichment entirely
    types.ts                  Enquiry row type
    supabase/
      admin.ts                service_role, bypasses RLS — webhook + reprocess only
      server.ts               User-scoped server client, respects RLS
      client.ts               Browser client, static env literals (see gotcha)
supabase/migrations/
  0001_create_enquiries.sql   Raw inbound table, RLS on with no policies
  0002_add_enrichment.sql     company_profile, claude_usage ledger, atomic cap fn
  0003_add_classification.sql priority, reasoning, signals, respond_by
  0004_rls_policies.sql       select/update for authenticated; no insert/delete
  0005_contacts_and_companies.sql
                              companies <- contacts <- enquiries, with backfill
```

## Data model — read this before touching queries

```
companies  (one per domain)   profile, enrichment_status
    ^
contacts   (one per sender)   name, status, notes[], total_received
    ^
enquiries  (one per MESSAGE)  direction, subject, body, priority, reasoning
```

Messages carry `direction` — `inbound` or `outbound` — so the record shows both
sides. Outbound rows arrive two ways: the "Log a reply" form, or automatically if
the intake address is BCC'd and `OWNER_EMAILS` is set (unset = feature off).

**Contacts are the unit of the CRM.** The dashboard lists contacts, not emails.

- **Company research is per domain and runs once.** A second person emailing from
  an already-researched employer costs nothing extra. Verified: a colleague at
  `grabtaxi.com` produced one Claude call (classification), not two.
- **Durable facts belong on the contact** — status, notes, total received. This is
  where the step 8 chat interface writes.
- **Priority stays on the enquiry.** It is a judgement about a specific message, not
  a standing property of a person.
- **Personal domains get no company row at all.** A "Gmail Inc." record would be
  worse than none.
- **Each message carries its own one-sentence `summary`**, written once when that
  message is processed and never rewritten. The timeline is just those lines in
  date order. A whole-thread paragraph was tried first and replaced: it had to be
  regenerated on every change, and it forced you to read all of it to find the one
  line you needed.
- **Conversation state lives on the contact** — `next_step` and
  `conversation_status`, produced by the *same* Claude call as classification.
- **Our own replies are not triaged.** Outbound messages use a smaller tool
  (`record_reply`) that returns only a summary, next step, and status. Rating a
  message we wrote ourselves is meaningless.
- **`remarks` is human-only.** The model never writes or overwrites it. `notes` is
  the model-writable field.
- **Classification receives the whole thread, both directions.** Without the
  outbound side it cannot tell whether someone is waiting on us or we on them.
- **Classification receives the whole relationship**: company profile, this contact's
  notes and payment history, *and* other contacts at the same company with their
  enquiry history. Without that last part the model asserted "we have no record of
  this company" while a colleague's enquiry sat in the same database.

Dependencies: `next`, `react`, `@anthropic-ai/sdk`, `@supabase/supabase-js`,
`@supabase/ssr`.

---

## Non-negotiable working conventions

**Commit in small, real increments. Do not batch work into one large commit.** The
"live debugging" requirement is met through honest git history: real commits showing
real bugs hit and fixed.

- Commit messages describe **what actually broke and how it was fixed**.
- Real errors get captured with their **actual text** in `TROUBLESHOOTING.md`.
- **Never fabricate a bug, a commit, or an error for narrative effect.**
- `TROUBLESHOOTING.md` was deliberately narrowed to issues the owner was directly
  involved in diagnosing or fixing. Do not re-add routine environment friction.
- `npm run build` must pass before every commit — **every push to `main` deploys
  straight to production.**

---

## Hard-won gotchas — read before touching related code

These each cost real time. Full write-ups in `TROUBLESHOOTING.md`.

**1. Never read `NEXT_PUBLIC_*` through a helper in browser code.**
Next.js only inlines those when it can see the *static* property access at build
time. `process.env[name]` is a runtime lookup, is not substituted, and yields
`undefined` in the browser — with no build warning. `src/lib/supabase/client.ts`
uses static literals on purpose. `requireEnv()` is server-only.

**2. Any async UI handler must clear its loading flag on every path, including
throws.** A rejected promise left the login button spinning forever with no error
anywhere — no console message, no failed request, nothing to debug.

**3. The webhook must return 200 fast.** Mailgun retries any non-2xx for hours.
Enrichment runs in `after()`, and the route sets `maxDuration = 300` because a
Claude call with web search takes 30–90s and the platform default cuts it off.

**4. Supabase DB connections must use the IPv4 session pooler.** Direct connections
are IPv6-only and are refused from this machine:
`postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres`

**5. Middleware uses `getUser()`, never `getSession()`.** `getSession()` only reads
a cookie, which a client can forge. It must never back an auth decision.

**6. The middleware matcher excludes `/api/inbound`.** That endpoint authenticates
by HMAC signature, not a session.

**7. Supabase `signUp` returns success for an existing email**, by design, so the
endpoint cannot enumerate registered addresses. The real outcome is an empty
`identities` array. Sign-in can also return no error *and* no session.

**8. Never format a timestamp in a server component.** Server components render
in the server's timezone — UTC on Vercel — so `toLocaleString()` there shows the
wrong wall-clock time to every reader. Use `<LocalTime>` from
`src/components/local-time.tsx`, which renders a timezone-independent UTC fallback
on the server *and* on the first client render (so hydration cannot mismatch), then
swaps to the reader's local time in an effect.

**9. Do not diagnose from an absence.** Four times in this build, in-flight work was
declared broken because a check ran too early. "Not yet" and "never" are the same
observation. Consult the authority — Mailgun's event stream, the token ledger,
`email_confirmed_at` — rather than polling and inferring.

---

## Architecture decisions

1. **The webhook returns 200 immediately**, then enrichment and classification run
   in `after()`. Classification runs *after* enrichment so the company profile
   informs the rating.
2. **Company research uses Claude's server-side web search tool**
   (`web_search_20260209`) — no separate search provider.
3. **Structured output comes from tool use with `strict: true`**, not JSON parsed
   out of prose. Claude calls `record_company_profile` / `record_priority`.
4. **Model is `claude-opus-5` at `effort: medium`.** Chosen by the owner over
   cheaper options, with the daily cap lowered to 25 instead. Measured cost is
   ~$0.15–0.25 per enriched enquiry; full effort measured $0.54, almost all of it
   web search results re-entering context.
5. **The cost cap is a single atomic Postgres statement** (`claim_claude_call`), not
   read-then-write — concurrent inbound mail is exactly when a check-then-act race
   would breach the ceiling. It **fails closed**.
6. **Personal domains skip enrichment entirely.** Researching the company behind a
   gmail.com address produces confident nonsense.
7. **RLS is the real security boundary.** The dashboard reads as the logged-in user
   via the anon key. `authenticated` has select and update but deliberately **no
   insert or delete** — rows come only from the webhook via `service_role`.
8. **Sender history is split** into same-address ("this person") and same-domain
   ("others at this company"). Merging them would imply a relationship with someone
   who has never written.
10. **Never let the model claim something is unknown when the database knows it.**
   Any context the CRM holds and the prompt omits will eventually surface as a
   confident false statement in reasoning the owner is showing to someone.

---

## Step 8 — what remains

A chat interface on each enquiry where plain language updates the **structured
record**, not a text blob. "Received $500 from this client last week" should write
to real columns.

Approach: Claude tool-use against a defined schema of allowed operations. The
target columns already exist on `contacts` from migration 0005:

- `notes` — append-only array of `{text, created_at, source}`
- `total_received` — numeric
- `status` — new | active | client | archived

**Propose the field schema before building** — which fields the chat may write is a
design decision, not an implementation detail. The chat attaches to the *contact*,
not to an individual enquiry.

It is last in the order because it benefits from real data to test against, and it
is the most open-ended piece.

---

## Explicitly out of scope

- WhatsApp notifications for high-priority enquiries (Meta template approval timing
  is outside our control — keep off the critical path).
- User-defined notification rules in natural language.
- Person-level enrichment beyond what a work email domain implies.
- Any third-party CRM integration. The CRM *is* this app's Supabase-backed dashboard.

---

## Environment

Secrets live in `.env.local` (gitignored); `.env.example` is the committed template.
**Every new variable must be added in both `.env.local` and Vercel** (production and
preview) or it works locally and 500s in production.

`NEXT_PUBLIC_*` variables must be added to Vercel with `--no-sensitive` — Vercel
rejects secret visibility for public-prefixed names, correctly, since they are
inlined into the browser bundle.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
