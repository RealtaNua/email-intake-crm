-- Restructure from an email log into an actual CRM.
--
-- Before: enquiries was the primary entity and the company profile hung off
-- each individual email. Two emails from the same person produced two
-- unrelated records and two paid research runs.
--
-- After:  companies (one per domain) <- contacts (one per sender) <- enquiries
--
-- Durable facts live on the contact. Company research lives on the domain and
-- is therefore done once. Priority stays on the enquiry, because it is a
-- judgement about a specific message, not a standing property of a person.

-- ── companies ────────────────────────────────────────────────────────────
create table if not exists public.companies (
  id                uuid primary key default gen_random_uuid(),
  domain            text unique not null,
  profile           jsonb,
  enrichment_status text not null default 'pending',
  enrichment_error  text,
  enriched_at       timestamptz,
  created_at        timestamptz not null default now()
);

comment on column public.companies.enrichment_status is
  'pending | enriched | capped | failed';

-- ── contacts ─────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  name          text,
  company_id    uuid references public.companies (id) on delete set null,
  -- Null for personal domains (gmail.com etc). There is no company to attach,
  -- and inventing one would be worse than leaving it empty.
  domain        text,

  -- Structured fields the chat interface will write to in step 8. Deliberately
  -- typed columns rather than a free-text blob: "received $500 last week"
  -- should become data, not a paragraph.
  status        text not null default 'new',
  notes         jsonb not null default '[]'::jsonb,
  total_received numeric(12,2) not null default 0,

  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on column public.contacts.status is 'new | active | client | archived';
comment on column public.contacts.notes is
  'Append-only array of {text, created_at, source}. Written by the chat interface.';

create index if not exists contacts_company_id_idx on public.contacts (company_id);
create index if not exists contacts_last_seen_idx  on public.contacts (last_seen_at desc);

-- ── link enquiries to contacts ───────────────────────────────────────────
alter table public.enquiries
  add column if not exists contact_id uuid references public.contacts (id) on delete cascade;

create index if not exists enquiries_contact_id_idx on public.enquiries (contact_id);

-- ── backfill from existing rows ──────────────────────────────────────────
-- Companies first: only where we already have a researched profile, so we do
-- not create empty company rows for personal domains.
insert into public.companies (domain, profile, enrichment_status, enriched_at)
select distinct on (e.sender_domain)
       e.sender_domain,
       e.company_profile,
       e.enrichment_status,
       e.enriched_at
  from public.enquiries e
 where e.sender_domain is not null
   and e.enrichment_status = 'enriched'
 order by e.sender_domain, e.received_at desc
on conflict (domain) do nothing;

insert into public.contacts (email, name, company_id, domain, first_seen_at, last_seen_at)
select e.sender_email,
       (array_agg(e.sender_name order by e.received_at desc)
          filter (where e.sender_name is not null))[1],
       c.id,
       e.sender_domain,
       min(e.received_at),
       max(e.received_at)
  from public.enquiries e
  left join public.companies c on c.domain = e.sender_domain
 group by e.sender_email, c.id, e.sender_domain
on conflict (email) do nothing;

update public.enquiries e
   set contact_id = c.id
  from public.contacts c
 where c.email = e.sender_email
   and e.contact_id is null;

-- ── retire the per-enquiry company columns ───────────────────────────────
-- These moved to companies. Leaving them would guarantee they drift out of
-- sync with the real profile the moment anything updates one and not the other.
alter table public.enquiries
  drop column if exists company_profile,
  drop column if exists enrichment_status,
  drop column if exists enrichment_error,
  drop column if exists enriched_at;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.companies enable row level security;
alter table public.contacts  enable row level security;

create policy "authenticated read companies"
  on public.companies for select to authenticated using (true);
create policy "authenticated update companies"
  on public.companies for update to authenticated using (true) with check (true);

create policy "authenticated read contacts"
  on public.contacts for select to authenticated using (true);
create policy "authenticated update contacts"
  on public.contacts for update to authenticated using (true) with check (true);

-- As with enquiries: no insert or delete for authenticated. Contacts and
-- companies are created by the inbound pipeline via service_role only.
