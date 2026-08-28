-- Flag suspected phishing/scam messages so they surface as an alert instead
-- of being triaged like an ordinary enquiry.
--
-- Lives on the enquiry, not the contact: it is a judgement about one specific
-- message's authenticity, the same reasoning as priority.

alter table public.enquiries
  add column if not exists suspected_phishing boolean not null default false,
  add column if not exists phishing_reasoning  text;

comment on column public.enquiries.suspected_phishing is
  'True when classification found a concrete, checkable red flag (e.g. claimed institutional authority contradicted by the sending domain) — not just a low-quality or irrelevant enquiry.';
comment on column public.enquiries.phishing_reasoning is
  'The specific mismatch that triggered suspected_phishing. Null when false.';

-- Sparse by design — most rows will never be true.
create index if not exists enquiries_suspected_phishing_idx
  on public.enquiries (suspected_phishing) where suspected_phishing;
