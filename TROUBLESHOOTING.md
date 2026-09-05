# Troubleshooting Log

Problems hit while building and deploying this system, with the actual error text,
the real cause, and the fix.

Where the first diagnosis turned out to be wrong, the wrong diagnosis is recorded
too. Those are the entries worth reading — being wrong about a cause is the normal
condition of debugging, and what matters is what corrects it.

**Contents**

- [1. Inbound mail could not arrive — the domain had no MX records](#1-inbound-mail-could-not-arrive--the-domain-had-no-mx-records)
- [2. Mailgun API key could not create a route](#2-mailgun-api-key-could-not-create-a-route)
- [3. Vercel could not connect to a public GitHub repo](#3-vercel-could-not-connect-to-a-public-github-repo)
- [4. Login hung forever with no error anywhere](#4-login-hung-forever-with-no-error-anywhere)
- [5. Sign-in silently did nothing](#5-sign-in-silently-did-nothing)
- [6. The test email that "never arrived"](#6-the-test-email-that-never-arrived)
- [7. The confirmation email that "never sent"](#7-the-confirmation-email-that-never-sent)
- [8. Five emails, twenty API calls](#8-five-emails-twenty-api-calls)
- [9. Summaries describing the wrong message](#9-summaries-describing-the-wrong-message)
- [10. Every timestamp was in the wrong timezone](#10-every-timestamp-was-in-the-wrong-timezone)
- [11. A dark-mode rule nobody had looked at](#11-a-dark-mode-rule-nobody-had-looked-at)
- [12. Summary tiles that did not count the messages](#12-summary-tiles-that-did-not-count-the-messages)
- [13. "Urgent" and "waiting on us" are different questions](#13-urgent-and-waiting-on-us-are-different-questions)
- [14. `reprocess.ts` always printed the same "20 calls ≈ $2.03"](#14-reprocessts-always-printed-the-same-20-calls--203)
- [15. A summary that just said "ignore"](#15-a-summary-that-just-said-ignore)
- [16. Every reprocess re-researched a company it already knew](#16-every-reprocess-re-researched-a-company-it-already-knew)
- [17. Remarks that saved perfectly and looked broken](#17-remarks-that-saved-perfectly-and-looked-broken)
- [18. A contact for ourselves](#18-a-contact-for-ourselves)
- [19. The fix that would have silently eaten every test email](#19-the-fix-that-would-have-silently-eaten-every-test-email)
- [20. Convincing fake contacts, at real companies, once the app could send](#20-convincing-fake-contacts-at-real-companies-once-the-app-could-send)
- [What these have in common](#what-these-have-in-common)

---

## 1. Inbound mail could not arrive — the domain had no MX records

**Symptom** — The Mailgun route was configured and the webhook was deployed, but
mail sent to the intake address never produced anything. No webhook call, no error.

**Diagnosis** — Checked the live DNS directly rather than trusting the Mailgun
dashboard's status:

```bash
dig +short MX mg.storyworks.asia     # → (empty)
dig +short MX storyworks.asia        # → aspmx.l.google.com, alt1…alt4 (Google Workspace)
```

**Cause** — `mg.storyworks.asia` had been set up for **sending** only. Sending
requires SPF, DKIM and a tracking CNAME; **receiving** requires MX records, and
there were none. Mail addressed to `intake@mg.storyworks.asia` had no route to
Mailgun at all, so nothing downstream could ever fire.

**Fix** — Added two MX records on the subdomain (DNS hosted at Netlify):

| Type | Name | Priority | Value |
|---|---|---|---|
| MX | `mg` | 10 | `mxa.mailgun.org` |
| MX | `mg` | 10 | `mxb.mailgun.org` |

**Why the subdomain mattered** — The apex domain `storyworks.asia` carries Google
Workspace MX records for real business email. Repointing those at Mailgun would have
broken the live inbox. Isolating inbound processing on a subdomain meant production
mail was never at risk.

**Verified** — Mailgun's own domain API then reported both records `valid`, and
public resolvers agreed:

```bash
dig +short MX mg.storyworks.asia @8.8.8.8   # → 10 mxa.mailgun.org, 10 mxb.mailgun.org
```

**Lesson** — "The domain is configured in the provider" and "the domain can receive
mail" are different claims. Verify from outside the vendor's dashboard; `dig` is the
source of truth, not a green tick in a UI. And when a domain already carries
production mail, put the new thing on a subdomain rather than editing records the
business depends on.

---

## 2. Mailgun API key could not create a route

**Symptom** — Creating the inbound route via the API returned:

```
API key does not have sufficient permissions to perform this action
```

Reads had worked fine moments earlier — `GET /v3/routes` returned normally — which
initially made it look like a malformed request body.

**Cause** — Mailgun scopes API keys by role. The key in use was a **sending** key.
Route management requires **admin** scope. The read succeeded because reads sit
under a broader scope than writes.

**Fix** — Created the route through the Mailgun dashboard rather than minting a new
admin key for a single call:

- Expression: `match_recipient("intake@mg.storyworks.asia")`
- Actions: `forward("https://email-intake-crm.vercel.app/api/inbound/mailgun")`, `stop()`

**Lesson** — When reads succeed and writes fail on the same credential, suspect
authorisation scope before suspecting the request. Also: minting a broader-privilege
key to automate one setup step is usually the wrong trade — the dashboard is a
perfectly good place for a one-off configuration change.

---

## 3. Vercel could not connect to a public GitHub repo

**Symptom** — Connecting the repository for automatic deploys failed:

```
Error: Failed to connect RealtaNua/email-intake-crm to project.
Make sure there aren't any typos and that you have access to the repository
if it's private.
```

The repository was public, and `gh repo view` confirmed access, so the error was
misleading.

**Cause** — The **Vercel GitHub App was not installed** on the GitHub account. No
CLI can install it: authorising a third-party app requires a browser consent screen,
by design.

**Fix** — Installed the Vercel GitHub App and connected the repository in the Vercel
dashboard. The CLI then reported `already connected`.

**Verified functionally** rather than by parsing tool output — pushed a commit
containing a route that had not existed before, then requested it:

```bash
curl -s -o /dev/null -w "%{http_code}" https://email-intake-crm.vercel.app/login   # → 200
```

If the new route answers, the commit is live.

**Lesson** — An error message about "access" can mean an uninstalled integration
rather than repository permissions. OAuth app installation is a consent action that
cannot be automated away, and recognising that class of blocker early saves time
spent re-checking credentials that were never the problem.

---

## 4. Login hung forever with no error anywhere

**Symptom** — Both "Continue with Google" and email/password sign-in left the button
stuck on "Working…" indefinitely. No error in the interface. No console error. No
failed network request. Nothing to work from.

**The clue that located it** — The two login methods share almost no code: different
providers, different endpoints, different payloads. They failed **identically**.
When two unrelated paths break the same way, the fault is in what they share — here,
the Supabase client constructor.

**Cause** — The browser client read its configuration through a helper:

```ts
const value = process.env[name];   // dynamic key
```

Next.js only substitutes `NEXT_PUBLIC_*` variables into browser bundles when it can
see the **static** property access at build time. `process.env[name]` is a runtime
lookup, so it was never replaced. In the browser the value was `undefined`, the
helper threw, the rejected promise was never caught, and the loading flag was never
cleared.

The identical code worked correctly on the server, where `process.env` genuinely
exists. There was no build warning.

**How it was confirmed** — Grepped the build output rather than reasoning about it:

```bash
grep -rl "yauxxaoazphsxphxbitu" .next/server/   # → found (middleware, static access)
grep -rl "yauxxaoazphsxphxbitu" .next/static/   # → nothing
```

Unambiguous: the value reached the server bundle and never reached the browser.

**Fix** — Two changes, and the second matters more than the first:

1. The browser client now reads static `process.env.NEXT_PUBLIC_X` literals, with a
   comment warning against refactoring them back behind a helper.
2. The login handlers wrap their work in `try/catch`, so a thrown error reaches the
   interface instead of leaving a button spinning.

**Lesson** — The configuration bug took minutes to fix once it was visible. What
cost time was a failure mode that emitted no signal anywhere. Any async handler that
sets a loading flag must clear it on **every** path including throws — otherwise a
fault in any dependency presents as an unresponsive UI with zero diagnostic
information.

There is a second, subtler lesson: the helper existed specifically to make missing
configuration *more* obvious. It became the thing that hid a missing configuration,
because wrapping the lookup converted a static property access into a dynamic one
and defeated the build-time analysis. An abstraction that hides a mechanism can
break it.

---

## 5. Sign-in silently did nothing

**Symptom** — Reported precisely, which is what made it quick to isolate: Google
sign-in worked; signing in with a deliberately made-up password correctly showed an
error; but signing in with a **real account that had just been created** produced no
error and no visible effect at all.

That contrast mattered. A working error path on one input and silence on another
ruled out the whole class of "the form isn't submitting".

**Cause** — Two separate silent paths, both in the same handler:

1. `signInWithPassword` returned **no error but no session** — the account existed
   but was not yet confirmed. The code fell through to `router.push('/dashboard')`,
   and middleware immediately redirected back to `/login`. Visually indistinguishable
   from the button doing nothing.

2. `signUp` with an email that already exists returns **success** by design.
   Supabase does this deliberately so the endpoint cannot be used to enumerate which
   addresses are registered. The real outcome is signalled only by an empty
   `identities` array — easy to miss, and it makes the interface claim an account
   was created when nothing happened.

**Fix** — Both cases now produce explicit messages. Separately, Supabase's generic
`Invalid login credentials` is translated into a specific message when the cause is
an unconfirmed email, because that wording otherwise sends people hunting for a
password typo that does not exist.

**Lesson** — "Success with no effect" is a real return value and needs handling as
carefully as an error. And an API behaving strangely for **security** reasons — not
leaking which emails are registered — will look like a bug until you read why it is
designed that way.

---

## 6. The test email that "never arrived"

**What was concluded** — After sending the first real test email through the
completed pipeline, the database was empty and Mailgun reported zero events. The
diagnosis offered was that the sending server had cached a negative DNS result from
before the MX records existed, and a bounce message was requested to confirm it.

**What was actually true** — Nothing was wrong. The email arrived roughly a minute
later and stored correctly, with every field parsed:

```
[inbound] stored enquiry 60365138-… from chinsiongk@gmail.com
POST /api/inbound/mailgun → 200
```

Two empty checks *before delivery* had been read as evidence of failure.

**What settled it** — Mailgun's event stream, which records the full chain:

```
accepted (intake@mg.storyworks.asia)
accepted (https://email-intake-crm.vercel.app/api/inbound/mailgun)
delivered — status 200 OK
```

One query, definitive answer — versus repeated polling that could never have
distinguished "not yet" from "never".

**Lesson** — Do not diagnose from an absence. The correct response to an empty
result is "no result yet", and the correct next step is to consult the system that
actually knows.

---

## 7. The confirmation email that "never sent"

**What was concluded** — Sign-up appeared to send no confirmation email. Sign-in
correctly reported the account as unconfirmed. The diagnosis offered was that
delivery had failed, citing — accurately, but irrelevantly — that Supabase's
built-in email service is rate-limited and explicitly not intended for production.
A recommendation was made to disable email confirmation entirely.

**What was actually true** — The email arrived. It simply took about three minutes:

| Event | Time |
|---|---|
| Account created | `08:16:39` |
| `email_confirmed_at` | `08:19:24` |

The service was working the whole time. The recommendation to disable confirmation
would have removed a working feature to solve a problem that did not exist.

**What settled it** — Supabase's admin users endpoint reports `email_confirmed_at`
directly:

```bash
curl "$SUPABASE_URL/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_ROLE_KEY"
```

**A detail that would have caused a second false conclusion** — disabling "Confirm
email" only affects **new** sign-ups. Accounts created while it was enabled stay
unconfirmed permanently. Had confirmation been switched off as recommended, the
existing account would still have failed to sign in, and the setting would have
looked broken too.

**Lesson** — Waiting longer is a diagnostic step. When a system is known to be slow,
elapsed time is part of the evidence, and "it hasn't happened yet" is not a finding.


---

## 8. Five emails, twenty API calls

**Symptom** — Spotted by the owner reading the usage counter: *"why are there 20 calls
when just 5 emails"*. Nothing had errored. The number was simply much larger than the
work appeared to justify.

**Cause** — Three compounding factors, none visible from the interface:

1. The contact held **five** messages, not three — three inbound plus two replies
   filed against it.
2. A *reprocess* re-researches the company **and** re-classifies every message on the
   contact. One reprocess of that contact was six calls, not one.
3. It had been run **twice** — once producing broken output, once after the fix.

Twelve of the twenty calls were debugging, not the pipeline doing its job.

**The deeper problem** — the question could not be answered from the data. The usage
table held a daily counter and nothing else, so it could say twenty calls had happened
but not what any of them were. The honest answer at the time was "I can't tell you
exactly."

**Fix** — two changes, one behavioural and one structural:

- A `claude_calls` table logging every call: purpose, which contact/company/message it
  related to, token counts, and cost priced at the rates in force at the time.
  Surfaced at `/dashboard/usage` with a breakdown by purpose.
- Reprocessing now requires explicit permission for each run, and the script prints
  the expected call count *before* spending it.

**Lesson** — an aggregate counter enforces a budget but cannot explain one. If a
number is going to be questioned, the data needed to answer the question has to be
kept at the time, not reconstructed afterwards. And a cost that is invisible from the
command that triggers it will eventually be spent by accident.

---

## 9. Summaries describing the wrong message

**Symptom** — After a requested reprocess, the conversation timeline came back wrong
in three ways at once: every priority had collapsed to "normal", several summaries
described a different message than the one they were attached to, and two contained
the literal string `"placeholder"`.

**Cause** — Two independent faults that only appear once a thread has more than one
message.

*Wrong message.* The message being processed sat at the **top** of the prompt,
followed by a large block of context — company profile, relationship, colleagues —
ending with the full thread. The model anchored on the end of the prompt and
summarised the newest thread message instead of the target. The `"placeholder"` values
were it filling a required field it had no answer for.

*Hindsight.* Classification loaded the entire thread, including messages that arrived
**after** the one being processed. Read today, an urgent request that has since been
handled looks routine — so every historical rating flattened.

**Fix** —

- Background first, then the target message inside an explicit
  `THE MESSAGE YOU ARE PROCESSING` delimiter, then the instruction naming what to
  summarise. Both system prompts now also forbid filler values outright.
- The thread is truncated at the message being processed (`.lte(received_at)`), and
  contact-level state is written only when processing the most recent message — so a
  reprocess cannot rewind the conversation status.

**Before:** 5 messages, all "normal", three summaries wrong, two "placeholder".
**After:** high / urgent / reply / urgent / reply, each summary describing its own
message, status correct with the next action named.

**Lesson** — position in a prompt is not neutral. Instructions and the subject of
those instructions belong at the end, past the context, and the subject needs a
delimiter so "this one" is unambiguous. Separately: re-running an analysis over
historical records will quietly rewrite history unless the inputs are pinned to what
was knowable at the time.

---

## 10. Every timestamp was in the wrong timezone

**Symptom** — Requested as a feature: show the time as well as the date, in the
reader's timezone. Investigating it revealed the existing dates were already wrong.

**Cause** — Timestamps were formatted inside **server components**. Server components
render in the server's timezone — UTC on Vercel — so `toLocaleString()` there produces
the server's wall-clock time for every reader regardless of where they are. Adding
minutes would only have made the error more precise.

**Why the obvious fix breaks something else** — moving formatting to the browser
causes a hydration mismatch: the server emits one string, the client computes another,
React warns and may keep the server's wrong value.

**Fix** — a `LocalTime` component that renders a **timezone-independent UTC fallback
on the server *and* on the first client render**, so hydration matches byte for byte,
then applies the reader's local time in an effect. The `title` carries the full
timestamp with the resolved zone name, so "which timezone is this?" is answerable by
hovering.

Verified the fallback is identical under `TZ=UTC`, `Asia/Singapore` and
`America/New_York`, and that a message stored at `07:10Z` renders as `15:10` for a
Singapore reader.

**Lesson** — server-side rendering makes the server's locale and timezone leak into
output that should be per-reader. Anything reader-relative — times, currency,
collation — cannot be resolved during server rendering, and the fix has to preserve
hydration equality rather than ignore it.

---

## 11. A dark-mode rule nobody had looked at

**Symptom** — Found while restyling at the owner's request. Not reported, because the
machine it was seen on was set to light mode.

**Cause** — The project scaffold ships a `prefers-color-scheme: dark` block that
switches the page background to near-black. Every component written since used
explicit light colours. Anyone whose operating system was set to dark would have
loaded the app and seen near-white text on near-white cards over a black page.

The same stylesheet also hardcoded `font-family: Arial`, overriding the Geist font the
layout was loading on every page — so the intended typeface had never once rendered.

**Fix** — committed to a single light theme with named tokens, and removed the Arial
override.

**Lesson** — scaffold defaults are not neutral; they are decisions someone else made
that stay in the codebase until read. A theming rule that only fires under a system
setting the developer does not use will not surface through normal testing, and
"works on my machine" is doing real work in that sentence.

---

## 12. Summary tiles that did not count the messages

**Symptom** — Reported by the owner from the dashboard: the four headline numbers did
not match the records underneath them. A contact whose state read **"Waiting on them"**
was being counted under **URGENT — "needs a reply today."**

**Cause** — three separate ways of not counting the thing being described.

1. **The counts were of the page, not the table.** `Contacts` was the length of a
   query capped at `.limit(100)`, and `Messages` was the sum of the enquiries embedded
   in those rows. A message whose sender never resolved to a contact hangs off no
   contact at all, so it was invisible to a total that claimed to cover "both
   directions".
2. **`Urgent` used the highest rating in the whole thread.** `topPriority()` took the
   maximum across every message a contact had ever sent, so one urgent enquiry marked
   that contact urgent permanently — including after it had been answered and the
   conversation had moved on. That is what put an URGENT badge next to "Waiting on
   them".
3. **`Waiting on us` read only `conversation_status`.** That column is written by
   classification, so an enquiry that has just landed, or one whose classification did
   not finish, has `null` there and was silently counted as *not* waiting — the tile
   read `0` while the message sat unanswered.

**Fix** — both dimensions now come from the message rows. `currentPriority()` takes
the rating of the **latest inbound** message rather than the worst one ever received,
and `ballInOurCourt()` trusts `conversation_status` when it is set and falls back to
the direction of the newest message when it is not. The tiles count the tables
directly instead of what the list happened to render, and the same two helpers drive
the list badges, so a number and the rows below it cannot disagree.

**Lesson** — a summary is a claim about the underlying rows, and it has to be computed
from them. Each of these three shortcuts was cheaper than the real query and each drifted
the moment the data grew past the case it was written on. A stale aggregate is worse than
no aggregate: nobody double-checks a number that already looks plausible.

This entry's own fix still had a gap — see entry 13.

---

## 13. "Urgent" and "waiting on us" are different questions

**Symptom** — The owner, looking at the fix in entry 12: Daniel Lim's thread showed
"Waiting on them" *and* an URGENT badge in the same row. If it's waiting on them, why
would it be urgent?

**Cause** — Entry 12 fixed the two tiles to each read the message rows correctly, but
still treated urgency as one axis. `currentPriority()` returns the rating of the
contact's latest inbound message regardless of who owes the next reply — correct for
"what did they last send us", wrong as the sole input to a badge that is implicitly
read as "needs action from us right now". Daniel's most urgent message had already
been answered; the rating on it hadn't changed, and nothing in the badge said that
that mattered.

**Why the obvious fix breaks something else** — folding "waiting on us" into the
urgency calculation directly (e.g. downgrading to `normal` when it's on them) would
lose real information: an urgent thread sitting with them is still worth watching more
closely than an ordinary one, just not something owed *today*.

**Fix** — added a third bucket. `attentionLevel()` combines `currentPriority()` and
`ballInOurCourt()`: urgent-and-on-us stays `urgent` (red, "needs a reply today"); urgent-
but-on-them becomes a new `high` level (orange, "High priority" — new tile, new badge
label, new `StatTile` accent) rather than being silently downgraded or left red. Every
badge and tile reads this one function instead of `currentPriority()` directly, so the
same judgement can't be computed two different ways in two places again.

**Lesson** — a priority rating and an ownership state look like they overlap ("urgent"
implies "act now") but are answers to different questions, and collapsing them into one
axis discards whichever one loses. The fix in entry 12 was a real improvement — it made
the two tiles individually correct — but "individually correct" is not the same as
"correct together"; the combination needed its own name (`attentionLevel`) rather than
being left for the reader to infer from two badges sitting side by side.

---

## 14. `reprocess.ts` always printed the same "20 calls ≈ $2.03"

**Symptom** — The owner, reprocessing Priya Menon (1 call) and then Marcus Webb
(2 calls), got the identical closing line both times: `spend today: 20 calls ≈
$2.03`. Two runs with different real costs printing the same number is proof
by itself that the number isn't "today" — it doesn't need a second check to
be suspicious.

**Cause** — `claude_usage` (migration `0002`) is one row per UTC day, keyed on
`day`. The script's closing summary read it with `.limit(1).single()` and no
`.eq("day", ...)` filter. With no filter and no explicit order, that returns
whatever row Postgres hands back first — in practice the oldest row in the
table, which is the very first day this project ever logged usage, back
before per-call logging existed (the same 20-call, $2.03 baseline already
flagged in `STATUS.md`'s open items). Every run printed that frozen row.

**What it did *not* affect** — this was cosmetic, confined to one `console.log`
at the end of the script. `claim_claude_call` (same migration) already scopes
correctly to today's UTC date for the real cap enforcement, and the
dashboard's `$X.XX today` header badge reads `claude_calls` (the accurate
per-call log, migration `0009`) filtered to today. Both were fine the whole
time; only the script's own summary line was reading the wrong row.

**Fix** — filter `claude_usage` to today's UTC date before reading it, and use
`maybeSingle()` instead of `single()` so an empty result doesn't throw.

**Lesson** — `.limit(1).single()` with no filter and no order is a bug that
looks like a working query: it returns *a* row, never errors, and only shows
itself when you happen to compare two runs and notice the number never moves.
The tell was in the comparison, not the query — one run alone would have looked
perfectly plausible.

---

## 15. A summary that just said "ignore"

**Symptom** — The owner spotted Priya Menon's timeline line reading `They: ⚠️
ignore` on the dashboard. On the next reprocess her To-Do item said `ignore`
too. Every *other* field on the same calls was specific and correct — the
priority reasoning, the phishing reasoning and the signals all named the SGD
55,000 budget, the 31 March deadline and the gmail/moe.gov.sg mismatch.

**First diagnosis was wrong.** The word "ignore" appears exactly once in the
whole prompt payload — in the `priority` enum's own description, `"low:
courtesy reply or ignore."` — so the obvious theory was a token leaking from a
neighbouring field. Marcus Webb disproves it: he is the *low priority* contact
where that text actually applies, and his `next_step` came back as the fluent
`"None — ignore, or send a one-line decline if you want the inbox clear."` The
word is used correctly exactly where the leak theory predicts corruption.

**Getting the evidence** — the raw API response was not recoverable. `claude_calls`
stores only tokens and cost. A `console.log` of the decision was deployed at
06:21 UTC and a corrupted call ran at 06:23, yet `vercel logs -q "classify"`
returned nothing minutes later — the runtime log buffer had already been
flushed by the dashboard's own polling traffic. Persisting it to
`enquiries.classification_raw` (migration `0011`) is what finally captured it.

**What the data showed** — commit `2892e84` (phishing detection) landed at
06:05:20 UTC. Priya's four calls straddle it, and the input grew by exactly the
773 tokens the new section and two new fields added:

| Time (UTC) | Phishing feature | In | Out | `message_summary` | `next_step` |
|---|---|---|---|---|---|
| 04:05 | before | 2465 | 665 | *(overwritten)* | *(overwritten)* |
| 06:13 | after | 3238 | 1458 | `"ignore"` | full sentence |
| 06:23 | after | 3238 | 1207 | `"ignore"` | `"ignore"` |
| 06:38 | after | 3238 | 1306 | `"ignore"` | `"ignore"` |

Reprocessing Marcus against the same prompt then produced a *different* junk
value in a *different* field: `"phishing_reasoning": "</antmlifake>\n"` — stray
markup, where the schema asks for an empty string when the flag is false. His
summary and next step were both fine, so the phishing section had not degraded
the prompt generally.

**Cause** — sort the nine fields by what they ask for and the pattern is exact.
The fields asking for *one short sentence* (`message_summary`, `next_step`) are
the two that collapse; the fields asking for *two or three sentences*
(`reasoning`, `phishing_reasoning` when genuinely set), and every enum and
boolean, come back clean. Both observed failures are a short free-text slot
being filled with whatever was top of mind — Priya's verdict about a scam, or
nothing at all — rather than with what the field asked for. The schema also has
no way to say "high business value, but do not engage", so a contradiction the
model genuinely holds has nowhere legitimate to go.

**Why `strict: true` did not catch it** — strict tool use guarantees the
*shape*: the field is present and is a string. It never inspects what the
string says. Anthropic's structured outputs additionally do not support
`minLength`/`maxLength`, so this class of check cannot be expressed in the
schema at all — it has to be code.

**Mitigation (shipped first, stays in place)** — validate the decision before
storing it. A degenerate value (empty, a bare single word, stray `<`/`>`
markup, under 20 characters) leaves its column untouched rather than
overwriting good data; the dashboard falls back to the subject line. A stored
value that is itself junk gets cleared rather than kept, so a rejected fresh
answer cannot leave an earlier bad run standing as if it were current.
`next_step` still accepts its documented one-word `"None"`. A phishing flag
whose reasoning is unusable is downgraded to false — what the prompt already
says to do when in doubt. This does not depend on understanding the cause and
was never expected to fix it — it only stops junk from reaching the reader.

**Isolating the actual cause** — a system-prompt line telling the model a
suspected scam still needs a real summary and a real next step fixed
`next_step` immediately and did nothing for `message_summary`, on the same
call. That split was the clue: something was reaching one field and not the
other, despite both being asked for in the same sentence of the prompt.

`scripts/dump-prompt.ts` (added to reproduce the exact payload rather than a
hand-copied approximation) rendered the identical system prompt, schema, and
email as a claude.ai-pasteable request. Run there — same wording, same
`effort: medium`, same model — `message_summary` came back correct, more than
once. That single result eliminated, in order: the email content (unchanged
across both paths), the prompt wording (identical), the field's position in
the schema's `required` array (identical), the effort level (same setting),
and the model (same Opus). Everything that could be described as "the
prompt" was now controlled for and still not explaining the difference.

What differs between the two paths is the delivery mechanism: on the API,
the schema travels in the `tools` parameter, which Anthropic renders *before*
the system prompt, under `strict: true` constrained decoding. In claude.ai
there is no `tools` parameter — the schema was inlined into the prompt itself,
after the instructions. The system-prompt fix reaching `next_step` but not
`message_summary` is consistent with strict decoding reading the *field's own
description* differently than free-form prompt text reaches it.

**Fix** — moved the instruction out of the system prompt and into
`message_summary`'s own property description in `CLASSIFY_TOOL`: *"Describe
what the message said even when you believe it is a scam — never a verdict or
an instruction like 'ignore' or 'spam'; suspected_phishing carries that."*
Two sentences, no other field touched.

**Verified** — reprocessed Priya Menon (1 call). `message_summary` returned
*"Claimed to write for an MOE division with approved budget of SGD 55,000 for
a leadership communication programme covering roughly 60 officers in three
cohorts, requiring first delivery in the second week of March and commitment
before FY close on 31 March, and asked for a scoping call this week."* —
specific, past tense, matches the field's own spec. `next_step`, the phishing
flag and its reasoning were all intact on the same call. Confirmed on the
dashboard, not just in the raw response.

**Lesson** — the guard already in the prompt (*"never emit filler like
'placeholder', 'n/a' or 'TBD'"*) was written after entry 9, where the model
emitted the literal string "placeholder". It did not prevent this, because
`"ignore"` is not filler — it is a real word the model meant, in the wrong box.
**A prompt instruction is not a validation layer**, and the code guard above
remains in place regardless of this fix — but a second lesson sits underneath
the first: **not every instruction belongs in the same place.** A rule can be
true and still fail to reach the field it's about, if it's written somewhere
the decoding path for that field doesn't weight the same way. The fix here was
not "give it a firmer instruction" — the firmer instruction already existed
and had already worked on a neighbouring field. It was moving the *same*
instruction to where the broken field could actually see it.

---

## 16. Every reprocess re-researched a company it already knew

**Symptom** — The owner ran `npx tsx scripts/reprocess.ts marcus.webb@hubspot.com`
to test a classification change and watched it print `[enrich] profiled
hubspot.com -> HubSpot, Inc.` — despite the dashboard already showing
`HubSpot, Inc. · B2B SaaS — CRM and marketing/sales software` before the run.

**Cause** — `enrichCompany()` returns early unless `enrichment_status` is
`"pending"`, and that guard is the whole mechanism behind "company research is
per domain and runs once". `reprocess.ts` set the status *back* to `"pending"`
immediately before calling it, defeating the guard by construction. Nothing was
broken; the script was doing exactly what it said. It just made the expensive
choice every time, invisibly.

**Why it matters more than it looks** — research is the most expensive call in
the system by a wide margin. A classification call on this contact is ~3,200
input tokens; the company enrichment measured 54,902, almost entirely web
search results re-entering context. Every debugging reprocess silently bought
one, and the cost preview printed it as a flat "+1 company research" without
saying it was avoidable.

**Fix** — research only a company with no profile yet, or when `--research`
explicitly forces it. The cost preview now counts distinct domains that will
actually run, rather than every contact holding a `company_id` — colleagues
share a company, so `--all` was over-counting and, worse, would have researched
the same domain once per contact.

**Lesson** — a guard that a caller resets right before invoking is not a guard.
The skip logic read as correct in `enrichment.ts` and the reset read as
reasonable in `reprocess.ts`; only running the two together shows the cost.

---

## 17. Remarks that saved perfectly and looked broken

**Symptom** — Reported by the owner: *"Double check if the special remarks section
is saving the remarks properly. There's no indication after I pressed save. And if
it's saved, the remarks are not shown anywhere."*

**Diagnosis** — Went to the system of record before touching the write path, and
queried the row directly with the service-role key:

```
"Farhan Aziz" → remarks: "We worked together before on another 3 hour training
project in 2024.\r\nPrefers simple and direct communication."
```

Saving had never been broken. Not once.

**Cause** — Three separate defects, none of them in the write, all of them
downstream of it:

1. `saveRemarks` discarded the Supabase result entirely. It returned nothing on
   success **and** nothing on failure, so a broken save and a working one produced
   byte-identical experiences. The error object was thrown away unread.
2. The saved value only ever appeared as the textarea's `defaultValue`. A record
   rendered into the box that wrote it reads as an unsaved draft, not as something
   on file.
3. `revalidatePath` covered `/dashboard/[id]` but not `/dashboard`, where the
   contact list renders a "Has remarks" badge off the same column. Adding remarks
   did not light the badge until something unrelated invalidated the list.

**Fix** — The action returns a `RemarksResult`; the form renders "Saving…", a green
"Saved", or the Supabase error verbatim. Saved remarks render as a read-only block
with an Edit button, preserving line breaks. Both paths revalidate.

**Lesson** — **A write with no visible outcome is indistinguishable from a write
that failed.** The owner's report was a completely reasonable reading of the
evidence available to them; the evidence was just missing. Note also the direction
this could have gone: the obvious response to "it isn't saving" is to start
rewriting the save. Checking the database first cost one query and ruled out the
entire write path before a line was changed.

---

## 18. A contact for ourselves

**Symptom** — The `contacts` table held a row for `CS Koh <chinsiongk@gmail.com>` —
the operator — sitting in the CRM as though they were an enquirer, attached to a
test message reading "hihi test to claude". Nobody had created it.

**Diagnosis** — Found while answering a question the owner asked about something
else: whether the system could capture replies they sent from their own mail
client. Reading the BCC-capture branch to answer it turned up two faults, neither
of which had ever been exercised, because the branch had never once run in
production.

**Cause** — Two, compounding:

1. `parseFromHeader` is anchored (`/^\s*(.*?)\s*<([^>]+)>\s*$/`). That is correct
   for a `From` header, which holds one address, and wrong for `To` or `Cc`: given
   `A <a@x>, B <b@y>` it matches only the **last** address. A reply to two people
   attached to the wrong contact; a contact sitting in `Cc` matched nothing.
2. When no contact matched, the branch fell through to the normal enquiry path.
   On that path the sender is the operator — so `resolveContact` did exactly what
   it is built to do and created a contact for the sender. Our own mail, filed as
   an inbound enquiry from ourselves.

**Fix** — `parseAddressList` reads every recipient in header order, respecting
angle brackets and quoted display names. An unmatched own-message is dropped
rather than falling through.

**Lesson** — **"Fall through to the normal path" is only safe when the normal path
is correct for that input.** Here the branch existed precisely to deny the normal
path's central assumption — that the sender is the enquirer — and then handed the
message to it anyway when it could not finish the job.

---

## 19. The fix that would have silently eaten every test email

**Symptom** — None yet. Caught before it could produce one, while writing up
entry 18, by checking what the stored real message actually contained:

```
sender:    chinsiongk@gmail.com
To:        intake@mg.storyworks.asia
recipient: intake@mg.storyworks.asia
```

**Cause** — The fix in entry 18 was right about the fall-through and wrong about
the condition guarding it. It treated *any* mail from an owner address as our own
outbound copy. But that message is not a reply — it is addressed **to** the intake
address. It is the owner emailing the system, which is how the owner tests it and
is otherwise the most ordinary path there is.

Under the new code that message would have matched `isOwnReply`, found no known
recipient, and been **dropped with a 200**. Silently. The webhook would have logged
`own message with no known recipient, skipped` and Mailgun would have been told
everything was fine. The previous behaviour — creating a contact for ourselves —
was wrong, but at least it was visibly wrong. This would have looked like mail
that never arrived, which is entry 6 all over again, except self-inflicted and with
a plausible cause already written into the code.

**Fix** — The discriminator is not who sent it. It is whether the intake address is
among the **visible** recipients:

- Intake address in `To` or `Cc` → the message was addressed to us → enquiry, even
  from the owner.
- Intake address absent from both → we were BCC'd on mail written to someone else
  → our own reply.

```ts
const isOwnReply = owners.includes(senderEmail) && !addressedToUs;
```

**Lesson** — **A branch keyed on the sender was answering the wrong question.**
"Who wrote this?" does not distinguish a reply from an enquiry; "was this addressed
to us, or were we copied on it?" does, and that fact is sitting in the headers. Two
further things worth keeping: the bug was found by reading the one piece of real
data in the system rather than reasoning about the code, and a fix shipped hours
earlier is still a fix that needs its own review.

---

## 20. Convincing fake contacts, at real companies, once the app could send

**Symptom** — No failure. A capability and a hazard that met: the CRM gained the
ability to send real email through the Mailgun API, and the database was full of
fixtures written during the build to read convincingly — `jane.tan@grabtaxi.com`,
`marcus.webb@hubspot.com`, `daniel.lim@grabtaxi.com`. Those are real domains with
real mail servers. One click on Send would have put genuine mail into a real
company's inbox, from the owner's domain, addressed to somebody who does not exist.

**Diagnosis** — The owner asked whether the database could distinguish real
messages from invented ones. It can, and the evidence is unambiguous. A message
that genuinely passed through Mailgun's inbound route carries the full transport
header set; the fixtures were inserted with exactly the five fields a person types
by hand:

```
real     Arc-Seal, Authentication-Results, Dkim-Signature, Received,
         X-Mailgun-Incoming, message-headers, body-html, stripped-html … (29)
fixture  Message-Id, from, recipient, stripped-text, subject               (5)
```

Exactly one message in the database is real.

**Fix** — `enquiries.verified_real`, backfilled from that evidence rather than by
recognising names, and afterwards set only by code that holds proof: the webhook,
where a row exists *because* it cleared the HMAC check, and our own API sends. A
thread may be replied to if any message in it is real, so a contact becomes
replyable the moment they actually write in. Blocked threads raise a dialog in the
composer, and `sendReply` refuses independently — a server action is a public
endpoint, so a client-side check is an explanation, not enforcement.

**Lesson** — **Seed data becomes dangerous at exactly the moment the system gains
the power to act on it.** It was harmless for the entire build and hazardous the
hour sending shipped, and nothing about the fixtures changed in between. Worth
asking of any new capability: what does it do to the data already sitting there?
The realness flag is also deliberately derived from what happened rather than
declared — a column a form or a model could write is not evidence of anything.

---

## What these have in common

Entries 6, 7 and 19 are the same mistake three times, and the third was nearly
self-inflicted — a fix that would have answered a real email with a silent 200 and
a log line saying it had been skipped on purpose:

> An empty result at one moment in time was treated as a permanent state.

**"Not yet" and "never" are the same observation.** Polling a result and reasoning
from its absence cannot separate them, however many times you poll. What separates
them is an **authoritative log or system of record**:

| Question | Polling (cannot answer) | Authority (answers in one call) |
|---|---|---|
| Did the email send? | Is the row there yet? | Mailgun event stream |
| Did confirmation work? | Check the inbox again | `email_confirmed_at` via admin API |
| Did the deploy go live? | Parse deployment listings | Request a route only the new build has |

Both times, the false conclusion also produced a *recommended fix* — chase a bounce
message; disable email confirmation. The second would have made things worse by
removing working functionality. **A confident diagnosis is more dangerous than an
uncertain one**, because it comes with an action attached.

The practice adopted: wait on a completion signal rather than polling; check the
system of record before declaring failure; and where no authority exists, report
"no result yet" rather than "it failed".

Entries 10 and 11 share a different shape: **a fault that cannot surface through the
way you normally use the thing.** A timezone bug is invisible to a developer whose
machine matches the server; a dark-mode bug is invisible to anyone testing in light
mode. Neither would ever have been reported by a user who happened not to be affected.
Both were found only because something adjacent was being changed.

Three further patterns from the other entries:

1. **Two unrelated things failing identically means the fault is in what they
   share.** This located the login bug in entry 4 immediately, and ruled out both
   auth providers without testing either.

2. **Verify from outside the vendor's dashboard.** `dig` found the missing MX
   records in entry 1; grepping the build output found the missing browser
   configuration in entry 4. A provider's status display describes its own
   configuration, not whether the thing works end to end.

3. **Silent failure costs more than loud failure.** The two most expensive bugs here
   — entries 4 and 5 — produced no error anywhere. Neither was complicated once
   visible. Entry 17 is the mirror image: nothing failed at all, but the interface
   said nothing either, and a working feature was reported as broken because a
   successful write and a failed one looked exactly the same.

6. **Check the record before rewriting the code.** Entry 17 was reported as a broken
   save and was not one; a single query settled it before anything was touched.
   Entry 19 was found the same way, by reading the one real row in the database
   rather than reasoning about what the handler ought to do with it.

4. **Keep the data needed to answer the question you will be asked.** Entry 8 was
   unanswerable not because the system was broken but because it recorded a total
   instead of a record. Aggregates enforce; detail explains.

5. **An analysis re-run over history will rewrite history** unless its inputs are
   pinned to what was knowable at the time (entry 9).
