-- Step 5: priority classification with visible reasoning.

alter table public.enquiries
  add column if not exists priority              text,
  add column if not exists priority_reasoning    text,
  add column if not exists priority_signals      jsonb,
  add column if not exists respond_by            text,
  add column if not exists classification_status text not null default 'pending',
  add column if not exists classified_at         timestamptz;

comment on column public.enquiries.priority is 'urgent | high | normal | low';
comment on column public.enquiries.classification_status is
  'pending | classified | capped | failed';

create index if not exists enquiries_priority_idx on public.enquiries (priority);
