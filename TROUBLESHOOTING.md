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
