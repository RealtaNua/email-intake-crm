# STATUS

This file is imported by `CLAUDE.md` via `@STATUS.md`, so it loads automatically at
the start of every session. `CLAUDE.md` holds the durable architecture and rules;
this file holds everything that changes.

**Keep it current.** It is loaded as fact, so anything stale here is read as true.

Last updated: 2026-08-28 · 33 commits · 10 migrations

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

⚠️ **Migration 0010 must be applied to the live database before/at the same time
as the code that writes `suspected_phishing`/`phishing_reasoning`.** Until it is,
any real inbound email arriving via the webhook will fail classification (rows
still land safely; `classification_status` just ends up `failed` and can be
reprocessed later) because the new columns don't exist yet on Supabase.

## Current data

5 contacts · 2 companies · 9 messages · 20 Claude calls today (~$2.03)

⚠️ **The data is fabricated.** Jane Tan, Daniel Lim, Marcus Webb, Priya Menon, Serene
Ho, and the SGD 42,000 proposal are all test fixtures written during the build. They
read convincingly, which is exactly the problem. Clear them before any demo, or be
ready to say plainly that they are synthetic.

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

Start with step 8. Propose the tool schema first — which fields the chat may write is
a design decision, not an implementation detail. Everything else on the list above is
optional polish.
