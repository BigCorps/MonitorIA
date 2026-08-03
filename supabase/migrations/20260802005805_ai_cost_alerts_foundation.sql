create table if not exists public.ai_cost_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  usage_month date not null,
  alert_type text not null,
  severity text not null,
  status text not null default 'open',
  observed_value numeric(24,8) null,
  threshold_value numeric(24,8) null,
  unit text not null default '',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  acknowledged_by uuid null references auth.users(id) on delete set null,
  resolved_at timestamptz null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_cost_alerts_month_check check (usage_month = date_trunc('month', usage_month)::date),
  constraint ai_cost_alerts_type_check check (alert_type in ('projected_ai_cost','escalation_rate','usage_data_quality')),
  constraint ai_cost_alerts_severity_check check (severity in ('warning','critical')),
  constraint ai_cost_alerts_status_check check (status in ('open','acknowledged','resolved')),
  constraint ai_cost_alerts_unit_check check (length(unit) <= 40)
);
create unique index if not exists ai_cost_alerts_identity_idx
  on public.ai_cost_alerts(organization_id, camera_id, usage_month, alert_type);
create index if not exists ai_cost_alerts_open_idx
  on public.ai_cost_alerts(status, severity, last_seen_at desc) where status <> 'resolved';
alter table public.ai_cost_alerts enable row level security;
revoke all on public.ai_cost_alerts from public, anon, authenticated;
grant all on public.ai_cost_alerts to service_role;
