alter table public.organization_usage_monthly
  add column if not exists total_model_calls bigint not null default 0,
  add column if not exists production_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists experimental_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists projected_30d_ai_cost_usd numeric(20,10) not null default 0,
  add column if not exists known_ai_cost_brl_cents bigint not null default 0,
  add column if not exists projected_30d_ai_cost_brl_cents bigint not null default 0;
