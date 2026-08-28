-- Persist the exact tool-call decision Claude returned for a classification,
-- so a malformed field is checkable against the real model output afterwards
-- instead of guessed at.
--
-- console.log alone was not enough: Vercel's runtime log buffer here is
-- short-lived and got flushed by the dashboard's own polling traffic before
-- it could be queried, even for a call made minutes earlier.

alter table public.enquiries
  add column if not exists classification_raw jsonb;

comment on column public.enquiries.classification_raw is
  'The full tool-call input (record_priority or record_reply) from the most recent classification of this message. Overwritten on reprocess. Debug-only — not read by the app.';
