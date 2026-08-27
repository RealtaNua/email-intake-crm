# Troubleshooting Log

Every problem hit while building this project, in the order encountered, with the
actual error text, the real cause, and the fix.

Nothing here is reconstructed or hypothetical. Where the first diagnosis was wrong,
the wrong diagnosis is recorded too — those are the entries worth reading, because
being wrong about a cause is the normal condition of debugging, and what matters is
what corrects it.

**Contents**

- [A. Local environment and tooling](#a-local-environment-and-tooling)
- [B. Shell — zsh is not bash](#b-shell--zsh-is-not-bash)
- [C. DNS and email delivery](#c-dns-and-email-delivery)
- [D. Platform configuration](#d-platform-configuration)
- [E. Application bugs](#e-application-bugs)
- [F. LLM integration and cost](#f-llm-integration-and-cost)
- [G. Diagnostic method failures](#g-diagnostic-method-failures)
- [Patterns worth generalising](#patterns-worth-generalising)

---

## A. Local environment and tooling

### A1. `create-next-app` failed with EACCES on the npm cache

**Symptom** — Project scaffold aborted partway through `npm install`.

```
npm error code EACCES
npm error syscall mkdir
npm error path /Users/…/.npm/_cacache/index-v5/53/80
npm error Your cache folder contains root-owned files, due to a bug in
npm error previous versions of npm which has since been addressed.
```

**Cause** — 85 files in the npm cache were owned by `root`, left behind by a
`sudo npm install` run months earlier. npm running as the normal user cannot write
into them. Confirmed with `find ~/.npm -user root | wc -l`.

**Fix** — Re-ran the install against a clean cache directory rather than escalating
privileges:

```bash
npm_config_cache=/tmp/npm-cache-clean npm install
```

The permanent fix is `sudo chown -R $(id -u):$(id -g) ~/.npm`.

**Lesson** — The error message named the real cause precisely. Reading it fully beat
guessing. Also: a workaround that needs no password is often available and is
preferable to `sudo` on a machine you do not own.

---

### A2. npm refused a directory name beginning with an underscore

**Symptom**

```
Could not create a project called "_scaffold" because of npm naming restrictions:
    * name cannot start with an underscore
```

**Cause** — `create-next-app` derives the package name from the directory name and
validates it against npm's package naming rules.

**Fix** — Renamed to `scaffold-tmp`.

**Lesson** — Trivial, but it cost a full install cycle. Directory names that feed
into package metadata inherit that ecosystem's naming rules.

---

### A3. A standalone test script could not resolve `node_modules`

**Symptom**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@anthropic-ai/sdk'
imported from /tmp/…/test-enrich.mjs
```

**Cause** — The script was written to a scratch directory outside the project.
Node resolves packages by walking up from the *file's* location, not from the
working directory, so it never reached the project's `node_modules`.

**Fix** — Ran the script from inside the project directory.

**Lesson** — `cd project && node /elsewhere/script.mjs` does not do what it looks
like it does.

---

### A4. Leftover scaffold identity in `package.json`

**Symptom** — `npm run dev` printed `> scaffold-tmp@0.1.0 dev`.

**Cause** — The project was scaffolded into a temporary subdirectory (to avoid a
conflict with pre-existing files) and then moved up. The package name came along.

**Fix** — Renamed the package to `email-intake-crm`.

**Lesson** — Workarounds leave residue. Worth a sweep afterwards for artefacts of
the workaround rather than of the intent.

---

## B. Shell — zsh is not bash

Both of these produced *silent wrong behaviour* rather than an error, which is what
made them expensive.

### B1. `shopt: command not found`

**Symptom**

```
(eval):1: command not found: shopt
```

…and, because the commands were chained with `&&`, everything after it silently did
not run. A file that should have been rewritten was left untouched, and the next
step read stale content.

**Cause** — `shopt` is a bash builtin. macOS defaults to zsh.

**Fix** — Used zsh-native globbing instead.

**Lesson** — A failed command in an `&&` chain stops the chain. If a later step
reads state an earlier step was supposed to write, it reads the old state and may
appear to succeed.

---

### B2. zsh does not word-split unquoted variables

**Symptom** — A loop pushing 11 environment variables to Vercel reported a single
failure whose name was the entire list:

```
FAIL production/NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY …
```

**Cause** — In bash, `for v in $VARS` splits `$VARS` on whitespace. In zsh it does
not; the whole string is one word. The loop ran once with a nonsense variable name.

**Fix** — Used a real array:

```zsh
VARS=(NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY …)
for v in "${VARS[@]}"; do … done
```

**Lesson** — Shell snippets copied from bash-oriented documentation can run without
error under zsh and still be wrong. Arrays are portable; word-splitting is not.

---

## C. DNS and email delivery

### C1. The Mailgun domain could not receive mail at all

**Symptom** — Route configured, webhook deployed, nothing ever arrived.

**Diagnosis** — Checked the actual DNS rather than the Mailgun dashboard:

```bash
dig +short MX mg.storyworks.asia     # → (empty)
dig +short MX storyworks.asia        # → Google Workspace
```

**Cause** — `mg.storyworks.asia` was configured for *sending* only. Sending needs
SPF/DKIM/CNAME records; receiving needs MX records, and there were none. Mail to
`intake@mg.storyworks.asia` had no route to Mailgun.

**Fix** — Added two MX records **on the subdomain only**:

| Type | Name | Priority | Value |
|---|---|---|---|
| MX | `mg` | 10 | `mxa.mailgun.org` |
| MX | `mg` | 10 | `mxb.mailgun.org` |

**Why the subdomain matters** — The apex `storyworks.asia` carries Google Workspace
MX records for real business email. Repointing those would have broken the
production inbox. Putting inbound mail on a subdomain isolates it completely.

**Lesson** — "The domain is set up in Mailgun" and "the domain can receive mail" are
different claims. Verify from outside the vendor's own dashboard: `dig` is the
source of truth, not the provider's green tick.

---

### C2. Confirmation emails appeared not to send

Recorded in full at [G4](#g4-the-confirmation-email-that-was-only-slow) — the
diagnosis was wrong. Delivery was working; it took about three minutes.

---

## D. Platform configuration

### D1. Supabase direct database connection refused

**Symptom**

```
failed to connect to `host=db.<ref>.supabase.co user=postgres database=postgres`:
dial error (connect ECONNREFUSED 2406:da18:167b:f900:…:5432)
```

The error's own suggestion pointed at "Network Restrictions and Network Bans",
which sent the first investigation in the wrong direction.

**Cause** — The address in the error is IPv6. Supabase direct connections are
IPv6-only, and the machine had no IPv6 route out. Nothing to do with restrictions.

**Fix** — Used the IPv4 session pooler:

```
postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

**Lesson** — Read the address family in a connection error. A `2406:` prefix is
IPv6 and immediately narrows the problem. A vendor's suggested remedy is a guess
based on the most common cause, not a diagnosis of *your* failure.

---

### D2. Vercel refused `NEXT_PUBLIC_*` environment variables

**Symptom**

```json
{
  "status": "error",
  "reason": "invalid_visibility",
  "message": "Environment variables with a public framework prefix (NEXT_PUBLIC)
              cannot use secret visibility on Production or Preview."
}
```

**Cause** — The Vercel CLI defaults new variables to *sensitive* visibility.
`NEXT_PUBLIC_*` values are inlined into the browser bundle by definition, so they
cannot be secret. Vercel refused a genuine contradiction.

**Fix** — Added those two with `--no-sensitive`; the nine real secrets stayed
sensitive.

**Lesson** — This was the platform catching a category error, not obstructing.
Worth understanding rather than working around: anything prefixed `NEXT_PUBLIC_`
is public, and treating it as a secret is the actual mistake.

---

### D3. Mailgun API key could not create a route

**Symptom**

```
API key does not have sufficient permissions to perform this action
```

Reads succeeded (`GET /v3/routes` returned normally); only the write failed, which
initially looked like a malformed request.

**Cause** — Mailgun scopes API keys by role. The key in use was a sending key;
route management requires admin scope.

**Fix** — Created the route in the dashboard rather than minting an admin key for a
single call.

**Lesson** — When reads work and writes do not, suspect authorisation scope before
suspecting the request body.

---

### D4. `vercel git connect` failed against a public repo

**Symptom**

```
Error: Failed to connect RealtaNua/email-intake-crm to project.
Make sure there aren't any typos and that you have access to the repository
if it's private.
```

The repo was public and `gh repo view` confirmed access, so the message was
misleading.

**Cause** — The Vercel GitHub App was not installed on the GitHub account. The CLI
cannot install it; that requires a browser consent screen.

**Fix** — Installed the Vercel GitHub App and connected in the dashboard. The CLI
then reported `already connected`.

**Lesson** — OAuth app installation is a consent action that no CLI can perform on
your behalf. An error about "access" may mean an uninstalled integration rather
than repository permissions.

---

## E. Application bugs

### E1. Login hung forever with no error anywhere — the worst bug of the build

**Symptom** — Both Google OAuth and email/password sign-in left the button on
"Working…" indefinitely. No error in the UI. No console error. No failed network
request. Nothing to work with.

**The clue** — The two login methods share almost no code: different providers,
different endpoints, different payloads. They failed *identically*. When two
unrelated paths break the same way, the fault is in what they share — here,
`createClient()`.

**Cause** — The Supabase browser client read its configuration through a helper:

```ts
const value = process.env[name];   // dynamic key
```

Next.js only substitutes `NEXT_PUBLIC_*` into client bundles when it can see the
**static** property access at build time. `process.env[name]` is a runtime lookup
and is not replaced, so the browser received `undefined`, the helper threw, the
promise rejected, and the loading flag was never cleared.

The same helper worked perfectly on the server, where `process.env` is real. There
was no build warning.

**How it was confirmed** — Grepped the build output instead of reasoning about it:

```bash
grep -rl "yauxxaoazphsxphxbitu" .next/server/   # → found (middleware, static access)
grep -rl "yauxxaoazphsxphxbitu" .next/static/   # → nothing
```

Unambiguous: the value reached the server bundle and not the browser.

**Fix** — Two changes, and the second matters more:

1. The browser client now reads static `process.env.NEXT_PUBLIC_X` literals, with a
   comment warning against refactoring them back through a helper.
2. The login handlers wrap their work in `try/catch`, so a thrown error reaches the
   UI instead of leaving a button spinning.

**Lesson** — The env bug took minutes to fix once visible. What cost time was a
failure mode that produced no signal anywhere. An async handler that sets a loading
flag must clear it on **every** path, including throws — otherwise a bug in any
dependency presents as an unresponsive UI with no diagnostic information at all.

A second lesson: an abstraction written to make failures *more* obvious
(`requireEnv` exists to give a clear message on a missing variable) became the thing
that hid one, because it changed a static property access into a dynamic one.

---

### E2. Sign-in silently did nothing for an unconfirmed account

**Symptom** — After signing up, signing in produced no error and no visible effect.

**Cause** — Two separate silent paths:

1. `signInWithPassword` returned **no error but no session**. The code fell through
   to `router.push('/dashboard')`, and middleware immediately redirected back to
   `/login`. Visually identical to the button doing nothing.
2. `signUp` with an email that already exists returns **success** by design —
   Supabase does this deliberately so the endpoint cannot be used to enumerate
   registered addresses. The real outcome is signalled only by an empty
   `identities` array.

**Fix** — Both cases now produce explicit messages. The generic
`Invalid login credentials` is also translated into a specific message when the
cause is an unconfirmed email, since that wording otherwise sends people hunting
for a password typo that does not exist.

**Lesson** — A security-motivated API design (not leaking which emails are
registered) will look like a bug unless you read why it behaves that way. "Success
with no effect" is a real return value and needs handling.

---

### E3. Long-running work was cut off after the HTTP response

**Symptom** — Enrichment claimed a slot in the daily cost ledger (`calls = 1`) but
recorded no result, no error, and no tokens. Work started and vanished.

**Cause** — Enrichment runs in `after()` so the webhook can return `200` immediately
(Mailgun retries any non-2xx for hours). But a Claude call with web search takes
30–90 seconds, and the platform's default function duration is far shorter. The
invocation was terminated mid-flight.

**Fix** — `export const maxDuration = 300;` on the route. Vercel Hobby with Fluid
compute permits 300s.

**Contributing misdiagnosis** — See [G2](#g2-the-enrichment-that-was-still-running).
Part of this was real; part was checking too early.

**Lesson** — Deferred work (`after`, background tasks, fire-and-forget) is still
bounded by the invocation's lifetime. Returning a response early does not buy
unlimited time.

---

### E4. Stale page metadata

**Symptom** — Deployed pages showed `<title>Create Next App</title>` after the
metadata had been changed and deployed.

**Cause** — The check ran before the production alias finished pointing at the new
deployment. A re-check moments later showed the correct title. See
[G3](#g3-the-deployments-that-had-already-happened).

**Lesson** — A deployment being "Ready" and the alias serving it are two events.

---

## F. LLM integration and cost

### F1. One enquiry cost $0.54

**Symptom** — The usage ledger after a single successful enrichment:

```
input_tokens: 88,560   output_tokens: 3,952
```

At Claude Opus 5 rates ($5/$25 per million) that is roughly **$0.54 for one email**.

**Cause** — Not verbosity. Server-side web search feeds every search result back
into the model's context, so input tokens dominate. A measured comparison:

| Configuration | Input tokens | Output tokens | Approx cost |
|---|---|---|---|
| Default effort, `max_uses: 6` | 88,560 | 3,952 | ~$0.54 |
| `effort: low`, `max_uses: 3` | 27,125 | 988 | ~$0.16 |

**Fix** — Dropped to `effort: medium` with `max_uses: 4`, and lowered the daily cap
from 100 to 25 after seeing real numbers.

**Lesson** — Measure before optimising, and measure before setting a cap. The cap
was originally 100/day, chosen with no cost data; at the measured rate that was a
~$54/day worst case on an endpoint strangers can trigger by sending email.

---

### F2. A public endpoint that spends money needs a cap built in, not bolted on

**Not a bug — a design decision made early to prevent one.**

The inbound webhook is publicly reachable. HMAC signature verification means only
Mailgun can invoke it, but *anyone can email the intake address*, so the volume of
paid API calls is ultimately controlled by strangers.

The cap is claimed with a single atomic Postgres statement:

```sql
insert into claude_usage (day, calls) values (current_date, 1)
on conflict (day) do update set calls = claude_usage.calls + 1
returning calls into v_calls;
if v_calls > p_cap then … rollback the increment; return false; end if;
```

Read-then-write in application code would be a genuine race under concurrent
inbound mail — which is exactly the condition a cap exists for. It also **fails
closed**: if the cap check itself errors, no API call is made.

**Lesson** — For anything that spends money, the check and the increment must be
one atomic operation, and the failure mode must be "spend nothing".

---

### F3. `curl -F` silently mangled a Message-Id

**Symptom** — Local webhook tests returned `HTTP 000` with curl exit code 26, but
only for requests carrying a `Message-Id`.

**Cause** — `curl -F` treats a leading `<` in a value as "read this value from a
file". Every RFC-compliant Message-Id begins with `<`.

**Fix** — `--form-string`, which disables that interpretation.

**Lesson** — A test-harness bug, not an application bug, but it presented as the
endpoint crashing. When only *some* requests fail, compare what is different about
them before suspecting the server.

---

## G. Diagnostic method failures

**The most important section.** Four times in this build, work in progress was
declared broken. Twice it sent someone chasing a fix for a problem that did not
exist. The technical entries above are ordinary; these are the ones that reveal how
debugging actually goes wrong.

### G1. The first test email that "never arrived"

**What was concluded** — After sending the first real test email, the database was
empty and Mailgun reported zero events. Diagnosis: the sending server had cached a
negative DNS result from before the MX records existed. A bounce message was
requested to confirm.

**What was true** — Nothing was wrong. The email arrived about a minute later and
stored correctly. Two empty polls before delivery were read as evidence of failure.

**What settled it** — Mailgun's event stream:
`accepted → accepted → delivered (200 OK)`.

---

### G2. The enrichment that was still running

**What was concluded** — Enrichment had claimed a cost-ledger slot but written no
result. A check for open connections appeared to show none, so the conclusion was
that the work had died silently.

**What was true** — Partly right, partly wrong. The `maxDuration` problem
([E3](#e3-long-running-work-was-cut-off-after-the-http-response)) was real. But the
specific run under investigation completed successfully about a minute later.

**The instrumentation was also broken.** The connection check was:

```bash
lsof -nP -p $PID | grep -i "TCP"
```

The only line it matched was `libngtcp2.16.dylib` — a *library filename* containing
the letters "tcp". The check could not have detected a connection. It returned a
confident-looking negative that meant nothing.

**Lesson** — A check that has never produced a positive result has not been
validated. Before trusting a negative, confirm the check can detect the thing at
all.

---

### G3. The deployments that had already happened

**What was concluded** — Twice, that push-to-deploy was not working.

**What was true** — It was working. Both checks were broken:

```bash
# Check 1 — counted matches of a string that does not appear in non-TTY output
BASE=$(vercel ls … | grep -c "storyworks1/email-intake-crm")   # → 0, always

# Check 2 — took column 1 of a line whose column 1 is not the age
AGE=$(vercel ls … | sed -n '5p' | awk '{print $1}')            # → a URL
```

**What settled it** — A functional test instead of a parsed one:

```bash
curl -s -o /dev/null -w "%{http_code}" https://…/login   # → 200
```

The `/login` route existed only in the new commit. If it responds, the commit is
live. No parsing, no assumptions about output format.

**Lesson** — Prefer a functional check over parsing tool output. "Does the new
behaviour exist?" is robust; "does column 1 of line 5 look like a duration?" is
not.

---

### G4. The confirmation email that was only slow

**What was concluded** — Sign-up sent no confirmation email. Supabase's built-in
mailer was blamed, correctly noting it is rate-limited and marked unsuitable for
production. A recommendation was made to disable email confirmation entirely.

**What was true** — The email arrived about three minutes after sign-up and the
account confirmed normally, at `08:19:24` for a sign-up at `08:16:39`. The service
was working the entire time.

**What settled it** — Supabase's admin users endpoint, which reports
`email_confirmed_at` directly. One call, definitive answer.

---

### The common thread

All four have the same shape:

> An empty result at one moment in time was treated as a permanent state.

**"Not yet" and "never" are the same observation.** Polling a result and reasoning
from its absence cannot distinguish them — no matter how many times you poll.

What *does* distinguish them is an **authoritative log or system of record**:

| Question | Poll (cannot answer) | Authority (answers in one call) |
|---|---|---|
| Did the email send? | Is the row there yet? | Mailgun event stream |
| Did enrichment run? | Is the column filled? | Application logs + token ledger |
| Did the deploy fire? | Parse `vercel ls` output | Request the new route |
| Did confirmation work? | Check the inbox | `email_confirmed_at` via admin API |

**The practice adopted:** wait on a completion signal rather than polling, and check
the system of record before declaring failure. Where no authority exists, say
"no result yet" — not "it failed".

---

## Patterns worth generalising

1. **Two unrelated things failing identically means the fault is in what they
   share.** This located [E1](#e1-login-hung-forever-with-no-error-anywhere--the-worst-bug-of-the-build) immediately.

2. **Verify from outside the vendor's dashboard.** `dig` found [C1](#c1-the-mailgun-domain-could-not-receive-mail-at-all); grepping the build
   output found E1. A provider's green tick describes its own configuration, not
   whether the thing actually works.

3. **Silent failure is worse than loud failure.** The costliest bugs here — E1, E2,
   B1 — all produced *no error anywhere*. Every async path that sets a loading flag
   must clear it on throw. Every `&&` chain can stop halfway and leave stale state
   that looks fine.

4. **Read the whole error, including the address family and the suggested remedy.**
   [D1](#d1-supabase-direct-database-connection-refused) was solved by noticing
   `2406:` is IPv6. The vendor's own suggestion pointed elsewhere.

5. **Reads working while writes fail means authorisation scope**, not a malformed
   request ([D3](#d3-mailgun-api-key-could-not-create-a-route)).

6. **Measure before capping.** The cost ceiling was set at 100/day with no data;
   the measured rate made that a ~$54/day exposure ([F1](#f1-one-enquiry-cost-054)).

7. **Validate the check before trusting its result** — especially a negative one
   ([G2](#g2-the-enrichment-that-was-still-running)).

8. **Prefer functional tests to parsed output** ([G3](#g3-the-deployments-that-had-already-happened)).

9. **An abstraction that hides a mechanism can break it.** `requireEnv()` existed to
   make missing configuration obvious, and it defeated Next.js's static analysis.
