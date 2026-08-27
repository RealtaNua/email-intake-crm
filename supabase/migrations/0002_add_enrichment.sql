-- Step 4: company enrichment, plus the cost cap that has to exist before we
-- let a public endpoint trigger paid Claude calls.

alter table public.enquiries
  add column if not exists company_profile   jsonb,
  add column if not exists enrichment_status text not null default 'pending',
  add column if not exists enrichment_error  text,
  add column if not exists enriched_at       timestamptz;

comment on column public.enquiries.enrichment_status is
  'pending | enriched | skipped_personal_domain | capped | failed';

create index if not exists enquiries_enrichment_status_idx
  on public.enquiries (enrichment_status)
  where enrichment_status = 'pending';

-- Daily spend ledger. One row per UTC day.
create table if not exists public.claude_usage (
  day           date primary key default (now() at time zone 'utc')::date,
  calls         integer not null default 0,
  input_tokens  bigint  not null default 0,
  output_tokens bigint  not null default 0
);

alter table public.claude_usage enable row level security;

-- Atomically reserve one Claude call against the daily cap.
--
-- Returns true if the call may proceed, false if the cap is already reached.
-- The increment and the check happen in a single statement so two concurrent
-- webhooks cannot both read "99 of 100" and both proceed. Doing this as
-- SELECT-then-UPDATE in application code would be a real race under retry
-- storms, which is exactly when a cap matters most.
create or replace function public.claim_claude_call(p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calls integer;
begin
  insert into public.claude_usage (day, calls)
  values ((now() at time zone 'utc')::date, 1)
  on conflict (day) do update
    set calls = public.claude_usage.calls + 1
  returning calls into v_calls;

  if v_calls > p_cap then
    -- Over cap: give the slot back so the counter reflects allowed calls only.
    update public.claude_usage
      set calls = calls - 1
      where day = (now() at time zone 'utc')::date;
    return false;
  end if;

  return true;
end;
$$;

-- Record token spend after a call completes, for visibility.
create or replace function public.record_claude_tokens(p_input bigint, p_output bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.claude_usage
     set input_tokens  = input_tokens  + p_input,
         output_tokens = output_tokens + p_output
   where day = (now() at time zone 'utc')::date;
$$;
