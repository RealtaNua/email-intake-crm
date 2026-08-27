-- Replace the whole-thread summary paragraph with a dated timeline.
--
-- A paragraph forces you to read all of it to find the one line you need, and
-- it gets regenerated in full every time anything changes. A one-sentence
-- summary per message is written once, never rewritten, and reads as a
-- timeline — which is what a conversation actually is.

alter table public.enquiries
  add column if not exists summary text;

comment on column public.enquiries.summary is
  'One sentence describing this message. Written once when the message is processed.';

alter table public.contacts
  add column if not exists next_step text;

comment on column public.contacts.next_step is
  'The single next action, if any. Replaces the old conversation_summary blob.';

-- The paragraph is gone. Leaving it would guarantee it drifts out of sync
-- with the per-message summaries that replaced it.
alter table public.contacts
  drop column if exists conversation_summary;
