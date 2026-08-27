-- Step 2 of the build order: the raw inbound landing table.
-- Deliberately minimal. Enrichment (step 4) and classification (step 5)
-- columns are added in their own later migrations, so the schema history
-- matches the actual build order.

create table if not exists public.enquiries (
  id           uuid primary key default gen_random_uuid(),
  received_at  timestamptz not null default now(),

  -- Mailgun's Message-Id header. Unique so that a webhook retry
  -- (Mailgun retries on any non-2xx) cannot create a duplicate row.
  message_id   text unique,

  sender_email text not null,
  sender_name  text,
  recipient    text,
  subject      text,
  body_plain   text,
  body_html    text,

  -- Full parsed payload, kept verbatim. Cheap insurance: if we later
  -- discover we need a header we didn't map, it's already here.
  raw_payload  jsonb,

  -- Lifecycle. Driven by the dashboard and, later, the chat interface.
  status       text not null default 'new'
);

-- The domain half of the sender address, lowercased. Generated rather than
-- written by the app so it can never drift from sender_email. Drives both
-- company enrichment (step 4) and sender history lookup (step 7).
alter table public.enquiries
  add column if not exists sender_domain text
  generated always as (lower(split_part(sender_email, '@', 2))) stored;

create index if not exists enquiries_received_at_idx
  on public.enquiries (received_at desc);

create index if not exists enquiries_sender_email_idx
  on public.enquiries (lower(sender_email));

create index if not exists enquiries_sender_domain_idx
  on public.enquiries (sender_domain);

-- RLS on from the start, with no policies yet.
--
-- This means: the anon key can read NOTHING from this table. That is
-- intentional. The webhook writes with the service_role key (which bypasses
-- RLS by design), and the step-3 dashboard reads server-side with the same
-- key. Real per-user policies arrive with Supabase Auth at step 6.
--
-- Enabling RLS without policies is the safe default. A table left with RLS
-- off is readable by anyone holding the anon key, and the anon key ships to
-- the browser.
alter table public.enquiries enable row level security;
