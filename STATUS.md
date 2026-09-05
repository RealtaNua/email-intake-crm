# STATUS

This file is imported by `CLAUDE.md` via `@STATUS.md`, so it loads automatically at
the start of every session. `CLAUDE.md` holds the durable architecture and rules;
this file holds everything that changes.

**Keep it current.** It is loaded as fact, so anything stale here is read as true.

Last updated: 2026-09-05 · 62 commits · 13 migrations

---

## Live

| | |
|---|---|
| App | https://email-intake-crm.vercel.app |
| Repo | https://github.com/RealtaNua/email-intake-crm (public) |
| Intake address | `intake@mg.storyworks.asia` |
| Supabase project | `yauxxaoazphsxphxbitu` (free tier) |
| Vercel project | `storyworks1/email-intake-crm` (Hobby) |
| Deploys | Automatic on push to `main` |

## Build order

- [x] 1. Scaffold Next.js, connect Supabase + Vercel
- [x] 2. Inbound webhook writing raw rows — confirmed with a real email end to end
- [x] 3. Dashboard listing rows
- [x] 4. Company enrichment (Claude + web search)
- [x] 5. Priority classification with reasoning
- [x] 6. Supabase Auth — Google + email/password, sign-up and sign-in both verified
- [x] 7. Contact records, conversation timeline, sender history
- [ ] 8. **Chat-based record updates — the only build item left**
- [x] 9. Rate limit / daily cap — pulled forward into step 4

## Beyond the original build order

Added after the fact, in response to how the thing actually behaved:

- **Restructured into a real CRM** (migration 0005). Was an email log; now
  `companies → contacts → enquiries`. Company research happens once per domain.
- **Two-way conversations** (0006). Messages carry a direction; replies arrive via a
  form or automatically when the intake address is BCC'd.
- **Per-message timeline** (0007). One dated sentence per message, replacing a
  whole-thread paragraph that had to be regenerated on every change.
- **Full message bodies** (0008). Stripped text for the model, unstripped for the
  reader, so sign-offs survive.
- **Per-call cost logging** (0009) at `/dashboard/usage` — purpose, subject, tokens,
  and price at time of call.
- **Navigation and visual design** — gradient header with content overlapping it,
  cards, stat tiles, tinted badges. Owner reviewed and approved: *"style is good, no
  changes needed here."* Do not restyle without being asked. The design system is
  documented in `CLAUDE.md`.
- **`scripts/reprocess.ts`** for ops backfills.
- **Phishing/scam detection** (0010). Classification now separately flags a
  concrete, checkable mismatch (claimed institutional authority the sending
  domain contradicts), not vague suspicion or a personal domain alone. Surfaces
  as a rose alert badge and reasoning on the contact card, the To-Do Items panel,
  and the message timeline. Requires migration 0010 applied before deploy — see
  the ordering note below.

Migrations through `0013` are applied to the live database (`supabase db push`,
`0012`–`0013` on 2026-09-05). Migration history had not recorded `0010` even
though its columns existed — that push applied it idempotently.

- **Raw model output is stored** (0011). `enquiries.classification_raw` holds the
  full tool-call decision from the most recent classification, overwritten on
  reprocess, debug-only and not read by the app. Added because `console.log` did
  not survive Vercel's runtime log buffer — a corrupted call two minutes after
  that logging deployed was already unrecoverable. See `TROUBLESHOOTING.md` 15.
- **Model output is validated before it is stored.** A degenerate value (empty,
  bare single word, stray markup, under 20 chars) leaves its column untouched
  instead of overwriting good data; a phishing flag with unusable reasoning is
  downgraded to false. `strict: true` checks shape, never meaning, and structured
  outputs do not support `minLength`.
- **`reprocess.ts` no longer re-researches a company that already has a profile**
  — pass `--research` to force it. Research is ~55k input tokens versus ~3k for a
  classification, so every debugging run was silently buying the expensive one.
- **Remarks save visibly** and render as a record rather than only as the textarea
  that wrote them. The Notes card is hidden until something writes to it.
- **The CRM sends real email** (0012). `sendReply` posts to the Mailgun API from
  `intake@mg.storyworks.asia` and threads via `In-Reply-To`. The mail goes out
  *before* the row is written, so a failed send cannot leave a record claiming we
  replied. Mailgun's returned `Message-Id` is stored, so a BCC copy of a CRM-sent
  reply dedupes against the unique index instead of double-posting.
- **Replies carry an `origin`** (0012): `crm`, `email_client` (BCC captured), or
  `manual` (typed into the log form). Shown on every outbound message, because
  "did I send that from here or from my phone?" should not depend on memory.
- **BCC capture works** — two bugs fixed, neither previously exercised.
  `parseFromHeader` is anchored and returned one address, so a two-recipient `To`
  matched the last one and a contact in `Cc` matched nothing; `parseAddressList`
  now reads every recipient in order. And an unmatched own-message fell through
  to the enquiry path, where the sender is the operator — filing our outbound
  mail as an inbound enquiry and creating a contact for ourselves. That is what
  the `CS Koh` contact row is.
- **The contact record updates itself** (0012 adds `enquiries` and `contacts` to
  the realtime publication). `LiveRecord` subscribes with the anon key — realtime
  respects RLS — and falls back to a 5s poll when the socket does not connect.
  Triage lands 30–90s behind its row, and refreshing early shows a blank pending
  row that reads as broken.
- **Sending is refused on threads that never passed through the mail server**
  (0013). `enquiries.verified_real` is set only by code holding proof: the
  webhook, where the row exists because it cleared the HMAC check, and our own
  API sends. A thread is replyable if any message in it is real. Backfilled from
  evidence — genuine mail carries `X-Mailgun-Incoming` and the original transport
  headers; the fixtures were inserted with five hand-written fields. Blocked
  threads get a dialog in the composer, and `sendReply` refuses independently
  because a server action is a public endpoint.

## Current data

6 contacts · 2 companies · 10 messages (2 still unclassified) · 8 Claude calls
today (~$0.95)

⚠️ Two enquiries sit at `classification_status = pending` and have never been
classified: "hihi test to claude" and "Corporate storytelling workshop for 200
staff". `enquiries.body_full` is also null on Priya Menon's message. Neither is
diagnosed yet.

⚠️ **The data is fabricated, and this is now established fact rather than memory.**
Exactly one message in the database is real: `chinsiongk@gmail.com` /
"hihi test to claude". Jane Tan, Daniel Lim, Marcus Webb, Priya Menon, Farhan Aziz
and the SGD 42,000 proposal are all fixtures. They read convincingly, which is
exactly the problem — say plainly that they are synthetic, or clear them.

Since `0013` this is enforced rather than remembered: only the `CS Koh` contact can
be replied to. Every fixture thread refuses to send, which matters because Jane,
Daniel and Marcus sit at **real domains** (grabtaxi.com, hubspot.com) and a
mistaken click would put real mail into a real company's servers from our domain.

## Open items

1. **`src/lib/business-context.ts` is inferred, not verified.** Written from limited
   information about the business and never corrected by the owner. It drives every
   priority rating in the system, including ones that name real companies and real
   money. Highest-leverage thing outstanding. Raised three times.
2. **Mailgun SMTP for Supabase Auth emails.** Deferred by the owner's explicit choice.
   Confirmation email currently takes ~3 minutes via Supabase's built-in service,
   which is also rate-limited to a few messages per hour.
3. **Supabase free-tier pause.** Documented as a limitation; no keep-alive built.
4. **Step 8, the chat interface.** Target columns already exist on `contacts`:
   `notes`, `total_received`, `status`. Propose the tool schema before writing code.
5. **Per-call log is empty.** Logging began after the first 20 calls, which exist
   only as a daily total. It populates from the next real email.
6. **`phishing_reasoning` is a required field with nothing to say when the flag is
   false.** The schema asks for an empty string; on a real call the model returned
   the stray markup `"</antmlifake>"` instead. Code now discards it, but the
   cleaner fix is to drop it from the tool's `required` array so the model may
   omit it. **Unverified against the live API** — standard JSON Schema allows it,
   and the Anthropic docs do not require every property to be listed, but a wrong
   guess here 400s every classification until reverted (soft: rows still land,
   status ends up `failed`). Test with one call before trusting it.
7. **Two enquiries never classified**, both at `classification_status = pending`.
   Cause unknown — possibly the daily cap, possibly a failed early run. One of
   them is the only genuinely real message in the database.
8. **Sending and live refresh are unverified in a browser.** Built, deployed and
   checked against the database, but the composer's dialog, the realtime socket
   connecting, and a real send through Mailgun have never been exercised by a
   logged-in human. **No email has ever been sent from the app.** A trial Mailgun
   account also restricts sending to authorized recipients; the composer surfaces
   Mailgun's error verbatim if so.
9. **The `CS Koh` contact is an artefact of the BCC bug**, not a real enquirer —
   our own message filed as an inbound enquiry. It is also, awkwardly, the only
   thread the app will now let you reply to. Delete it and nothing is replyable
   until a genuine email arrives.

## Cost

- Model: `claude-opus-5` at `effort: medium` — the owner's choice, with the cap
  lowered rather than the model downgraded.
- Measured: ~$0.15–0.25 per enriched enquiry. A full-effort run measured $0.54,
  almost entirely web search results re-entering context.
- `ENRICHMENT_DAILY_CAP=25`. Resets at UTC midnight.
- **Reprocessing is the expensive operation**: one call per message plus one for
  company research. A 5-message contact costs 6 calls, not 1.

## Configuration state

All secrets are in `.env.local` (gitignored) and in Vercel production + preview.

| Variable | State |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `_ANON_KEY` | set (Vercel: `--no-sensitive`) |
| `SUPABASE_SERVICE_ROLE_KEY` | set |
| `SUPABASE_DB_PASSWORD` | set (local only; CLI migrations) |
| `ANTHROPIC_API_KEY` | set |
| `MAILGUN_SIGNING_KEY` / `_API_KEY` / `_DOMAIN` / `_REGION` | set |
| `OWNER_EMAILS` | `chinsiongk@gmail.com` — enables BCC reply capture |
| `MAILGUN_FROM` | **not set**, and optional — defaults to `intake@<MAILGUN_DOMAIN>` |
| `ENRICHMENT_DAILY_CAP` | 25 |

⚠️ The Mailgun API key was pasted into a chat transcript during setup and should be
rotated. Its only remaining use is reading routes, so rotating it is low risk.

## Auth state

- Google sign-in: working (`chinsiongk@gmail.com`)
- Email/password: working (`cskoh@webfirestudios.com`)
- Email confirmation is **enabled**; delivery works but takes ~3 minutes
- Disabling confirmation would only affect *new* sign-ups — existing unconfirmed
  accounts stay unconfirmed permanently

## Next session

Step 8 is still the only outstanding build item. Propose the tool schema first —
which fields the chat may write is a design decision, not an implementation detail.

Before that, the cheap and worthwhile thing: send one real email to yourself
through the composer and reply to it from Gmail with the intake address BCC'd.
That exercises sending, capture, `origin` labelling, dedupe and live refresh in
one pass, and every one of them is currently unproven end to end.
