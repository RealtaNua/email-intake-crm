-- Per-call cost log.
--
-- claude_usage holds a daily counter, which is all the cap needs and nothing
-- more. When asked why five emails had cost twenty calls, the honest answer
-- was "I can't tell you exactly" — the data to answer it was never kept.
--
-- The counter stays: the cap claim has to be one atomic statement, and
-- counting rows in a growing table is the wrong thing to put in that path.
-- This table is the detail behind it.

create table if not exists public.claude_calls (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  purpose       text not null,
  model         text not null,

  -- What the call was about. All nullable: a call may relate to a company but
  -- no contact, and future callers may relate to neither.
  contact_id    uuid references public.contacts (id)  on delete set null,
  company_id    uuid references public.companies (id) on delete set null,
  enquiry_id    uuid references public.enquiries (id) on delete set null,

  input_tokens         integer not null default 0,
  output_tokens        integer not null default 0,
  cache_read_tokens    integer not null default 0,
  web_search_requests  integer not null default 0,

  -- Priced at the rates in force when the call was made, so historical rows
  -- stay accurate after a price change.
  cost_usd      numeric(10,6) not null default 0,

  error         text
);

comment on column public.claude_calls.purpose is
  'enrich_company | classify_inbound | classify_reply | chat_update';

create index if not exists claude_calls_created_idx on public.claude_calls (created_at desc);
create index if not exists claude_calls_contact_idx on public.claude_calls (contact_id);
create index if not exists claude_calls_purpose_idx on public.claude_calls (purpose);

alter table public.claude_calls enable row level security;

create policy "authenticated read claude_calls"
  on public.claude_calls for select to authenticated using (true);
