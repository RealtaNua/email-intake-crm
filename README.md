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
- [ ] 3. Bare dashboard listing rows
- [ ] 4. Company-domain enrichment (Claude + web search)
- [ ] 5. Priority classification (Claude)
- [ ] 6. Supabase Auth (Google + email/password, sign-up and sign-in)
- [ ] 7. Per-enquiry detail view, sender history
- [ ] 8. Chat-based record updates
- [ ] 9. Rate limit / daily cap on the public webhook

## Debugging log

Real errors hit during this build, with the actual text and the actual fix. This is not
a tidy retrospective — these are the things that went wrong, in the order they went wrong.

### 1. `create-next-app` failed with EACCES on the npm cache

```
npm error code EACCES
npm error syscall mkdir
npm error path /Users/…/.npm/_cacache/index-v5/53/80
npm error Your cache folder contains root-owned files, due to a bug in
npm error previous versions of npm which has since been addressed.
```

**Cause:** 85 files in the npm cache were owned by `root`, left behind by an earlier
`sudo npm install`. npm running as the normal user could not write into them.

**Fix:** re-ran the install against a clean cache directory
(`npm_config_cache=/tmp/…`) rather than sudo-chowning the whole cache. Permanent fix is
`sudo chown -R 501:20 ~/.npm`.

### 2. Supabase direct database connection refused

```
failed to connect to `host=db.<ref>.supabase.co user=postgres database=postgres`:
dial error (connect ECONNREFUSED 2406:da18:167b:f900:…:5432)
```

**Cause:** Supabase direct connections are IPv6-only. The machine running the migration
had no IPv6 route out, so the connection was refused at the socket level. The error
suggests network restrictions, which sent me looking in the wrong place first.

**Fix:** used the IPv4 session pooler instead
(`aws-0-ap-southeast-1.pooler.supabase.com:5432`, user `postgres.<ref>`).

### 3. zsh does not word-split unquoted variables

A loop pushing 11 env vars to Vercel reported a single failure named
`NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY …` —
the entire list treated as one variable name.

**Cause:** `for v in $VARS` splits on whitespace in bash but not in zsh.

**Fix:** used a proper array, `VARS=(…)` with `"${VARS[@]}"`.

### 4. Vercel rejected `NEXT_PUBLIC_*` env vars

```
{
  "status": "error",
  "reason": "invalid_visibility",
  "message": "Environment variables with a public framework prefix (NEXT_PUBLIC) cannot
              use secret visibility on Production or Preview."
}
```

**Cause:** the Vercel CLI defaults new env vars to *sensitive* visibility. `NEXT_PUBLIC_`
values get inlined into the browser bundle, so they cannot be secret — Vercel refused a
genuine contradiction rather than letting it through.

**Fix:** added those two with `--no-sensitive`. The nine real secrets stayed sensitive.

### 5. Mailgun API key could not create a route

```
API key does not have sufficient permissions to perform this action
```

**Cause:** Mailgun scopes API keys by role. The key in use was a sending key; route
management needs admin scope. Reads worked, writes did not — which made it look like a
malformed request at first.

**Fix:** created the route in the dashboard instead of minting an admin key for one call.

### 6. `curl -F` swallowed the Message-Id

A local test of the webhook returned `HTTP 000` with curl exit code 26, but only for the
requests carrying a `Message-Id`.

**Cause:** `curl -F` treats a leading `<` in a value as "read this value from a file", and
every Message-Id begins with `<`.

**Fix:** `--form-string`, which disables that interpretation. A test-harness bug, not an
application bug — but it cost time because it looked like the endpoint was crashing.

### 7. Diagnosed a delivery failure that was just latency

After the first real test email, the table was empty and Mailgun reported zero events. I
concluded the sending server had cached a negative DNS result from before the MX records
existed, and asked for a bounce message to confirm.

**Cause:** none. The email arrived roughly a minute later and stored correctly. I had
polled twice before it landed and read two empty results as evidence of failure.

**Lesson worth keeping:** "no data yet" and "no data ever" look identical at a single
point in time. The fix was to check the authoritative log (Mailgun's event stream, which
showed `accepted → accepted → delivered 200 OK`) rather than infer from an absence.

## Known limitations

- **Supabase free-tier projects pause after inactivity.** A paused project means the
  webhook's insert fails and Mailgun retries. A keep-alive is planned.
- **The webhook is a public endpoint that will trigger paid Claude calls** once enrichment
  lands. HMAC signature verification is already in place, so only Mailgun can invoke it;
  a hard daily cap is build-order step 9, before this is considered deployable.
- **Deploys are manual** (`vercel deploy --prod`). The GitHub repo is not yet connected
  to the Vercel project for automatic deploys on push.

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
