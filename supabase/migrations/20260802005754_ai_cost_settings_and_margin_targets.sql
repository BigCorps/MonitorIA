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
insert into public.ai_cost_settings (id) values (1) on conflict (id) do nothing;

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
  on public.plan_margin_target_versions(plan_code) where valid_to is null;
create index if not exists plan_margin_target_history_idx
  on public.plan_margin_target_versions(plan_code, valid_from desc);

insert into public.plan_margin_target_versions (plan_code, target_max_cogs_cents, notes)
select candidate.plan_code, candidate.target_max_cogs_cents, candidate.notes
from (values
  ('basic'::text, 1500, 'Teto comercial de COGS por câmera/mês aprovado para o plano Essencial.'::text),
  ('standard'::text, 2800, 'Teto comercial de COGS por câmera/mês aprovado para o plano Atenta.'::text),
  ('intensive'::text, 6500, 'Teto comercial de COGS por câmera/mês aprovado para o plano Detalhada.'::text)
) as candidate(plan_code, target_max_cogs_cents, notes)
where not exists (
  select 1 from public.plan_margin_target_versions current_target
  where current_target.plan_code = candidate.plan_code and current_target.valid_to is null
);

alter table public.ai_cost_settings enable row level security;
alter table public.plan_margin_target_versions enable row level security;
revoke all on public.ai_cost_settings from public, anon, authenticated;
revoke all on public.plan_margin_target_versions from public, anon, authenticated;
grant all on public.ai_cost_settings to service_role;
grant all on public.plan_margin_target_versions to service_role;
