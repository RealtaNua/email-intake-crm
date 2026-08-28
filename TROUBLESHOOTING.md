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

The `URGENT` hint changed from "Needs a reply today" to "Latest message rated urgent",
because that is what it counts. Whether the ball is in our court is already carried by
the tile next to it, and by `NextStep`, which is red only when both are true.

**Lesson** — a summary is a claim about the underlying rows, and it has to be computed
from them. Each of these three shortcuts was cheaper than the real query and each drifted
the moment the data grew past the case it was written on. A stale aggregate is worse than
no aggregate: nobody double-checks a number that already looks plausible.

---

## What these have in common

Entries 6 and 7 are the same mistake twice:

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
   visible.

4. **Keep the data needed to answer the question you will be asked.** Entry 8 was
   unanswerable not because the system was broken but because it recorded a total
   instead of a record. Aggregates enforce; detail explains.

5. **An analysis re-run over history will rewrite history** unless its inputs are
   pinned to what was knowable at the time (entry 9).
