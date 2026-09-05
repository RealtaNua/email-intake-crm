-- Replies can now originate from two places, and the record has to say which.
--
-- 1. The CRM sends the mail itself, via the Mailgun API.
-- 2. You reply from your own mail client and BCC the intake address, and the
--    inbound webhook attaches the copy to the contact.
--
-- Both are legitimate and both show in the same thread. Without a marker they
-- are indistinguishable, and "did I send that from my phone or from here?" is
-- exactly the question the timeline should answer.

alter table public.enquiries
  add column if not exists origin text;

comment on column public.enquiries.origin is
  'Outbound only: crm (sent by this app) | email_client (BCC captured) | manual (typed into the log form). Null on inbound.';

-- Existing outbound rows were all typed into the log form by hand — that was
-- the only way to record a reply before this migration. Backfilled rather than
-- left null so the timeline has no unlabelled gap.
update public.enquiries
  set origin = 'manual'
  where direction = 'outbound' and origin is null;

-- ── Realtime ─────────────────────────────────────────────────────────────
-- The contact record subscribes to these two tables so a reply captured from
-- the mail client appears without a manual refresh. Realtime respects RLS, so
-- this exposes nothing the dashboard could not already read.
--
-- `add table` throws if the table is already a member of the publication, and
-- there is no `if not exists` form, hence the guard.
do $$
begin
  alter publication supabase_realtime add table public.enquiries;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.contacts;
exception
  when duplicate_object then null;
end $$;
