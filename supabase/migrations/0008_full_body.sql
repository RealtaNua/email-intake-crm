-- Keep the unstripped message body for display.
--
-- body_plain holds Mailgun's stripped-text, which removes signature blocks and
-- quoted history. That is the right input for the model — it keeps the prompt
-- focused on what was actually said — but it is the wrong thing to show a
-- human, because the sign-off is part of the message.
--
-- So: stripped for the model, full for the reader.

alter table public.enquiries
  add column if not exists body_full text;

comment on column public.enquiries.body_full is
  'Unstripped body, including signature. Display only — the model reads body_plain.';

-- Backfill from the payload we already keep verbatim, which is exactly the
-- reason for keeping it.
update public.enquiries
   set body_full = raw_payload->>'body-plain'
 where body_full is null
   and raw_payload ? 'body-plain';
