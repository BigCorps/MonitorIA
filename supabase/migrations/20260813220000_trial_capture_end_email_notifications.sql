create table if not exists public.trial_email_notifications (
  id uuid primary key default gen_random_uuid(),
  trial_run_id uuid not null references public.trial_runs(id) on delete cascade,
  notification_type text not null default 'capture_ended',
  status text not null default 'pending',
  attempts integer not null default 0,
  recipient_email text,
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trial_email_notifications_kind_check check (notification_type in ('capture_ended')),
  constraint trial_email_notifications_status_check check (status in ('pending','sending','sent','failed')),
  constraint trial_email_notifications_attempts_check check (attempts >= 0),
  constraint trial_email_notifications_unique unique (trial_run_id, notification_type)
);
create index if not exists trial_email_notifications_pending_idx
  on public.trial_email_notifications (status, updated_at)
  where status <> 'sent';
alter table public.trial_email_notifications enable row level security;
