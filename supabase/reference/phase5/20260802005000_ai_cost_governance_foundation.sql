-- PROD-5 — Controle de IA e margem.
-- Este pacote não decide rotas, prompts, complexidade ou modelos.
-- Ele mede custos, compara limites comerciais e produz alertas operacionais.

create table if not exists public.ai_cost_settings (
  id smallint primary key default 1,
  usd_to_brl numeric(10,4) not null default 6.0000,
  warning_target_percent smallint not null default 80,
  critical_target_percent smallint not null default 100,
  projection_min_jobs integer not null default 10,
  projection_min_hours numeric(10,2) not null default 2.00,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  constraint ai_cost_settings_singleton check (id = 1),
  constraint ai_cost_settings_usd_to_brl_check check (usd_to_brl > 0 and usd_to_brl <= 100),
  constraint ai_cost_settings_warning_check check (warning_target_percent between 1 and 100),
  constraint ai_cost_settings_critical_check check (critical_target_percent between warning_target_percent and 500),
  constraint ai_cost_settings_min_jobs_check check (projection_min_jobs between 1 and 1000000),
  constraint ai_cost_settings_min_hours_check check (projection_min_hours > 0 and projection_min_hours <= 744)
);

insert into public.ai_cost_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.plan_margin_target_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.camera_plan_catalog(code) on update cascade on delete restrict,
  currency text not null default 'BRL',
  target_max_cogs_cents integer not null,
  valid_from timestamptz not null default now(),
  valid_to timestamptz null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint plan_margin_target_currency_check check (currency = 'BRL'),
  constraint plan_margin_target_amount_check check (target_max_cogs_cents > 0),
  constraint plan_margin_target_window_check check (valid_to is null or valid_to > valid_from)
);

create unique index if not exists plan_margin_target_current_idx
  on public.plan_margin_target_versions(plan_code)
  where valid_to is null;

create index if not exists plan_margin_target_history_idx
  on public.plan_margin_target_versions(plan_code, valid_from desc);

insert into public.plan_margin_target_versions (
  plan_code,
  target_max_cogs_cents,
  notes
)
select values_to_insert.plan_code,
       values_to_insert.target_max_cogs_cents,
       values_to_insert.notes
from (
  values
    ('basic'::text, 1500, 'Teto comercial de COGS por câmera/mês aprovado para o plano Essencial.'::text),
    ('standard'::text, 2800, 'Teto comercial de COGS por câmera/mês aprovado para o plano Atenta.'::text),
    ('intensive'::text, 6500, 'Teto comercial de COGS por câmera/mês aprovado para o plano Detalhada.'::text)
) as values_to_insert(plan_code, target_max_cogs_cents, notes)
where not exists (
  select 1
  from public.plan_margin_target_versions current_target
  where current_target.plan_code = values_to_insert.plan_code
    and current_target.valid_to is null
);

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
  constraint ai_cost_alerts_type_check check (alert_type in (
    'projected_ai_cost',
    'escalation_rate',
    'usage_data_quality'
  )),
  constraint ai_cost_alerts_severity_check check (severity in ('warning', 'critical')),
  constraint ai_cost_alerts_status_check check (status in ('open', 'acknowledged', 'resolved')),
  constraint ai_cost_alerts_unit_check check (length(unit) <= 40)
);

create unique index if not exists ai_cost_alerts_identity_idx
  on public.ai_cost_alerts(organization_id, camera_id, usage_month, alert_type);

create index if not exists ai_cost_alerts_open_idx
  on public.ai_cost_alerts(status, severity, last_seen_at desc)
  where status <> 'resolved';

alter table public.camera_usage_daily
  add column if not exists plan_code text null,
  add column if not exists jobs_count integer not null default 0,
  add column if not exists completed_jobs integer not null default 0,
  add column if not exists failed_jobs integer not null default 0,
  add column if not exists relevant_events integer not null default 0,
  add column if not exists review_required_events integer not null default 0,
  add column if not exists total_model_calls integer not null default 0,
  add column if not exists primary_calls integer not null default 0,
  add column if not exists verifier_calls integer not null default 0,
  add column if not exists experimental_calls integer not null default 0,
  add column if not exists production_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists experimental_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists avg_latency_ms numeric(14,2) null,
  add column if not exists p95_latency_ms numeric(14,2) null,
  add column if not exists avg_confidence numeric(8,6) null,
  add column if not exists review_rate_basis_points integer not null default 0,
  add column if not exists escalation_rate_basis_points integer not null default 0,
  add column if not exists observed_from timestamptz null,
  add column if not exists observed_to timestamptz null;

alter table public.camera_usage_monthly
  add column if not exists plan_code text null,
  add column if not exists jobs_count bigint not null default 0,
  add column if not exists completed_jobs bigint not null default 0,
  add column if not exists failed_jobs bigint not null default 0,
  add column if not exists relevant_events bigint not null default 0,
  add column if not exists review_required_events bigint not null default 0,
  add column if not exists total_model_calls bigint not null default 0,
  add column if not exists primary_calls bigint not null default 0,
  add column if not exists verifier_calls bigint not null default 0,
  add column if not exists experimental_calls bigint not null default 0,
  add column if not exists production_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists experimental_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists avg_latency_ms numeric(14,2) null,
  add column if not exists p95_latency_ms numeric(14,2) null,
  add column if not exists avg_confidence numeric(8,6) null,
  add column if not exists review_rate_basis_points integer not null default 0,
  add column if not exists escalation_rate_basis_points integer not null default 0,
  add column if not exists observed_from timestamptz null,
  add column if not exists observed_to timestamptz null,
  add column if not exists observation_hours numeric(14,4) not null default 0,
  add column if not exists known_ai_cost_brl_cents integer not null default 0,
  add column if not exists projected_30d_ai_cost_usd numeric(20,10) null,
  add column if not exists projected_30d_ai_cost_brl_cents integer null,
  add column if not exists routing_telemetry_available boolean not null default false;

alter table public.organization_usage_monthly
  add column if not exists total_model_calls bigint not null default 0,
  add column if not exists production_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists experimental_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists projected_30d_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists known_ai_cost_brl_cents bigint not null default 0,
  add column if not exists projected_30d_ai_cost_brl_cents bigint not null default 0;

create index if not exists camera_usage_daily_org_date_ai_idx
  on public.camera_usage_daily(organization_id, usage_date desc);

create index if not exists camera_usage_monthly_org_month_ai_idx
  on public.camera_usage_monthly(organization_id, usage_month desc);

alter table public.ai_cost_settings enable row level security;
alter table public.plan_margin_target_versions enable row level security;
alter table public.ai_cost_alerts enable row level security;

revoke all on public.ai_cost_settings from public, anon, authenticated;
revoke all on public.plan_margin_target_versions from public, anon, authenticated;
revoke all on public.ai_cost_alerts from public, anon, authenticated;

grant all on public.ai_cost_settings to service_role;
grant all on public.plan_margin_target_versions to service_role;
grant all on public.ai_cost_alerts to service_role;
