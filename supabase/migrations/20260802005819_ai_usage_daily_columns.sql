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
create index if not exists camera_usage_daily_org_date_ai_idx
  on public.camera_usage_daily(organization_id, usage_date desc);
