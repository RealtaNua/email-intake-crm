-- Replies, conversation state, and remarks.
--
-- A CRM has to show both sides of the conversation. Until now only inbound
-- mail existed, so the record showed what people asked and never what was
-- said back — which makes "what is the state of this?" unanswerable.

-- ── enquiries become messages with a direction ───────────────────────────
alter table public.enquiries
  add column if not exists direction text not null default 'inbound';

comment on column public.enquiries.direction is 'inbound | outbound';

create index if not exists enquiries_direction_idx on public.enquiries (contact_id, direction);

-- Outbound rows are replies, so several enquiries columns do not apply to
-- them. message_id stays unique across both, which keeps webhook dedupe
-- working when an outbound copy is BCC'd back to the intake address.

-- ── conversation state and remarks live on the contact ───────────────────
alter table public.contacts
  add column if not exists remarks              text,
  add column if not exists conversation_summary text,
  add column if not exists conversation_status  text,
  add column if not exists summary_updated_at   timestamptz;

comment on column public.contacts.remarks is
  'Free-text, human-written. Never overwritten by the model.';
comment on column public.contacts.conversation_status is
  'awaiting_our_reply | awaiting_their_reply | scheduled | closed_won | closed_lost | no_action_needed';
