-- Mark which messages are genuinely real, and gate sending on it.
--
-- The seed data reads convincingly and sits at real domains — grabtaxi.com,
-- hubspot.com. With the CRM now able to send actual mail, one careless click
-- on a fixture puts real email into a real company's mail servers from our
-- domain. The record has to know the difference.
--
-- This is a hidden operational flag, not a UI feature. Nothing renders it; it
-- exists to refuse a send.

alter table public.enquiries
  add column if not exists verified_real boolean not null default false;

comment on column public.enquiries.verified_real is
  'True only for messages that genuinely passed through Mailgun (HMAC-verified inbound, or sent by us via the API). Seed and hand-entered rows stay false, and a contact with no true row cannot be replied to.';

-- Backfill from evidence rather than by name. A message that actually came
-- through Mailgun's inbound route carries X-Mailgun-Incoming plus the original
-- transport headers; the fixtures were inserted with five hand-written fields
-- and have none of them. That is a checkable fact, not a judgement call.
update public.enquiries
   set verified_real = true
 where raw_payload ? 'X-Mailgun-Incoming'
    or raw_payload ? 'message-headers';

create index if not exists enquiries_verified_real_idx
  on public.enquiries (contact_id) where verified_real;
