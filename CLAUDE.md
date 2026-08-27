# CLAUDE.md — Email Intake & Triage CRM

> **Read [STATUS.md](STATUS.md) first, once, at the start of every session.**
> It holds what is built, what is outstanding, what things cost, and what is
> configured. This file holds only what does not change: architecture, rules, and
> the mistakes already paid for.

## What this is

An inbound enquiry handling system. Someone emails a dedicated address; the system
researches their company, writes a structured record to Supabase, tracks the whole
conversation, assigns a priority with reasoning, and surfaces it on a login-gated
dashboard where records can be updated by chatting in plain language.

Portfolio project for a part-time ACLP trainer role interview (advanced AI agents /
automation). The evaluation stage requires a **working, deployed public web app** —
not a slide deck — demonstrating real hosting and deployment, live debugging ability,
and GitHub familiarity.

The differentiator over a contact form: it pulls in context beyond the message
itself, takes real action beyond sending a notification, and applies judgment
specific to the business rather than a generic keyword rule.

---

## Non-negotiable working conventions

**Ask before reprocessing anything. Every time.**

Reprocessing re-researches the company *and* re-classifies every message on the
contact, so a contact with five messages costs six Claude calls, not one. It is the
single most expensive operation here and the cost is invisible from the command.

- Never run `scripts/reprocess.ts` — one contact or `--all` — without explicit
  permission for that specific run.
- State the expected cost first: messages × 1 call, plus 1 if the company will be
  re-researched.
- To verify a fix, test on a **single message**, not a whole contact.

**Commit in small, real increments.** The "live debugging" requirement is met through
honest git history.

- Commit messages describe what actually broke and how it was fixed.
- Real errors get captured with their actual text in `TROUBLESHOOTING.md`.
- **Never fabricate a bug, a commit, or an error for narrative effect.**
- `TROUBLESHOOTING.md` is deliberately limited to issues the owner was involved in
  diagnosing or fixing. Do not re-add routine environment friction.
- `npm run build` and `npx eslint src` must pass before every commit — **every push
  to `main` deploys straight to production.**

---

## Data model

```
companies  (one per domain)   profile, enrichment_status
    ^
contacts   (one per sender)   name, status, notes[], total_received, remarks,
    ^                         next_step, conversation_status
enquiries  (one per MESSAGE)  direction, subject, body_plain, body_full,
                              summary, priority, priority_reasoning
```

**Contacts are the unit of the CRM.** The dashboard lists contacts, not emails.

- **Company research is per domain and runs once.** A second person from an
  already-researched employer costs nothing extra.
- **Durable facts belong on the contact.** Step 8's chat writes here.
- **Priority stays on the enquiry.** It judges a message, not a person.
- **Personal domains get no company row.** A "Gmail Inc." record is worse than none.
- **Each message carries its own one-sentence `summary`**, written once and never
  rewritten. The timeline is those lines in date order.
- **`remarks` is human-only**; the model never writes it. `notes` is model-writable.
- **Our own replies are not triaged** — outbound uses a smaller tool that returns
  only a summary, next step, and status.
- **`body_plain` is stripped text for the model; `body_full` is unstripped for the
  reader**, so sign-offs survive.

---

## Hard-won gotchas — read before touching related code

Each cost real time. Full write-ups in `TROUBLESHOOTING.md`.

1. **Never read `NEXT_PUBLIC_*` through a helper in browser code.** Next.js only
   inlines those when it sees the *static* property access at build time.
   `process.env[name]` yields `undefined` in the browser with no build warning.
   `requireEnv()` is server-only.
2. **Any async UI handler must clear its loading flag on every path, including
   throws.** A rejected promise left the login button spinning forever with no error
   anywhere.
3. **The webhook must return 200 fast.** Mailgun retries any non-2xx for hours.
   Enrichment runs in `after()` with `maxDuration = 300`.
4. **Supabase DB connections must use the IPv4 session pooler.** Direct connections
   are IPv6-only and refused from this machine.
5. **Middleware uses `getUser()`, never `getSession()`.** The latter only reads a
   cookie, which a client can forge.
6. **The middleware matcher excludes `/api/inbound`** — that endpoint authenticates
   by HMAC signature, not a session.
7. **Supabase `signUp` returns success for an existing email**, by design, so the
   endpoint cannot enumerate addresses. The real outcome is an empty `identities`
   array. Sign-in can also return no error *and* no session.
8. **Never format a timestamp in a server component.** They render in the server's
   timezone (UTC on Vercel). Use `<LocalTime>`, which emits a timezone-independent
   fallback on the server *and* the first client render, then swaps to local in an
   effect.
9. **Put the thing being processed LAST in the prompt, and delimit it.** With the
   target at the top and long context after it, the model summarised the *newest*
   message instead, and twice emitted the literal string "placeholder".
10. **Never judge a past message with future context.** Classification includes the
    thread only up to the message being processed (`.lte(received_at)`). Contact-level
    state is written only when processing the most recent message.
11. **Never let the model claim something is unknown when the database knows it.**
    Any context the CRM holds and the prompt omits will surface as a confident false
    statement in reasoning the owner is showing someone.
12. **Do not diagnose from an absence.** Four times in this build, in-flight work was
    declared broken because a check ran too early. "Not yet" and "never" are the same
    observation. Consult the authority — Mailgun's event stream, the call log,
    `email_confirmed_at` — rather than polling and inferring.

---

## Architecture decisions

1. **The webhook returns 200 immediately**, then research and classification run in
   `after()`. Classification runs *after* research so the profile informs the rating.
2. **Company research uses Claude's server-side web search** (`web_search_20260209`).
3. **Structured output comes from tool use with `strict: true`**, not JSON parsed out
   of prose.
4. **Model is `claude-opus-5` at `effort: medium`** — the owner's choice over cheaper
   options, with the daily cap lowered instead.
5. **Cost is logged per call** in `claude_calls`: purpose, subject, tokens, and price
   at time of call. Rates live in `RATES` in `src/lib/claude.ts` and must be updated
   alongside the model. `/dashboard/usage` renders it.
6. **The cap is a single atomic Postgres statement** (`claim_claude_call`), not
   read-then-write — concurrent mail is exactly when a check-then-act race would
   breach it. It **fails closed**. The daily counter stays separate from the call log
   because the claim must remain one cheap statement.
7. **RLS is the real security boundary.** The dashboard reads as the logged-in user
   via the anon key. `authenticated` has select and update but deliberately **no
   insert or delete** — rows come only from the webhook via `service_role`.
8. **Sender history is split** into same-address and same-domain. Merging them would
   imply a relationship with someone who has never written.
9. **Styling is Tailwind**, committed to a single light theme with tokens in
   `globals.css`. Shared UI lives in `src/components/` — `Badge`, `StatTile`,
   `NextStep`, `LocalTime`, `MessageView`.

---

## Project structure

```
src/
  middleware.ts               Session refresh + /dashboard gating
  app/
    page.tsx                  Landing
    login/page.tsx            Google + email/password (sign-up and sign-in)
    auth/callback|signout     OAuth exchange, sign out
    dashboard/layout.tsx      Gradient header, nav, spend, auth check
    dashboard/page.tsx        Contact list with timelines
    dashboard/[id]/page.tsx   Contact record
    dashboard/companies/      Companies, one row per researched domain
    dashboard/usage/          Per-call cost log
    dashboard/actions.ts      reprocessContact, reprocessEnquiry, logReply, saveRemarks
    api/inbound/mailgun/      Webhook: verify -> insert -> 200 -> after()
  components/                 Badge, StatTile, NextStep, LocalTime, MessageView, NavLink
  lib/
    env.ts                    requireEnv() — SERVER ONLY (see gotcha 1)
    mailgun.ts                HMAC verification, From header parsing
    claude.ts                 Client, MODEL, RATES, cap claim, per-call logging
    contacts.ts               resolveContact() — upsert company + contact
    enrichment.ts             enrichCompany() — per domain, once
    classification.ts         Priority, summary, conversation state
    business-context.ts       EDITABLE business rules driving triage judgment
    personal-domains.ts       gmail.com etc — skip research
scripts/reprocess.ts          Ops backfill (permission required)
supabase/migrations/          0001-0009
```

---

## Explicitly out of scope

- WhatsApp notifications (Meta template approval timing is outside our control).
- User-defined notification rules in natural language.
- Person-level enrichment beyond what a work email domain implies.
- Any third-party CRM integration. The CRM *is* this app.

---

## Ops

```bash
# REQUIRES THE OWNER'S EXPLICIT PERMISSION FOR EACH RUN — see conventions above.
npx tsx scripts/reprocess.ts <email>
npx tsx scripts/reprocess.ts --all

# Migrations (IPv4 pooler — direct connections are refused, see gotcha 4)
supabase db push --db-url "postgresql://postgres.<ref>:<pw>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
```

**Every new env var must be added to `.env.local` *and* Vercel** (production and
preview) or it works locally and 500s in production. `NEXT_PUBLIC_*` needs
`--no-sensitive` — Vercel rejects secret visibility for public-prefixed names,
correctly, since they are inlined into the browser bundle.
