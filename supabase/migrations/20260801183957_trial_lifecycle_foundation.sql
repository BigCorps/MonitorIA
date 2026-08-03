-- MonitorIA v1.0 — Fase 3: fundação do teste gratuito.
-- Adiciona controle de elegibilidade, Agent vinculado, rastreamento dos
-- dados gerados durante o trial e ativação gradual do enforcement comercial.

alter table public.billing_accounts
  add column if not exists entitlement_enforcement_enabled boolean not null default true;

comment on column public.billing_accounts.entitlement_enforcement_enabled is
  'Quando true, ingestão e Agent obedecem trial/assinatura. Contas anteriores ao lançamento permanecem temporariamente em modo legado até iniciar trial ou pagar.';

-- As contas já existentes são ambientes internos/pré-lançamento. Elas não
-- devem ser interrompidas pela aplicação desta migration. Novas contas usam
-- o default true e já nascem sob o contrato comercial.
update public.billing_accounts
set entitlement_enforcement_enabled = false,
    updated_at = now()
where current_period_start is null
  and not exists (
    select 1
    from public.camera_subscriptions subscription
    where subscription.organization_id = billing_accounts.organization_id
  )
  and not exists (
    select 1
    from public.trial_runs trial
    where trial.organization_id = billing_accounts.organization_id
  );

alter table public.trial_runs
  add column if not exists agent_id uuid references public.agents(id) on delete set null,
  add column if not exists capture_completed_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists last_readiness_check_at timestamptz,
  add column if not exists readiness_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists status_reason text,
  add column if not exists trial_version smallint not null default 1
    check (trial_version between 1 and 1000);

create unique index if not exists trial_runs_camera_once_idx
  on public.trial_runs(camera_id)
  where camera_id is not null;

create unique index if not exists trial_runs_agent_once_idx
  on public.trial_runs(agent_id)
  where agent_id is not null;

create unique index if not exists trial_runs_user_once_idx
  on public.trial_runs(started_by)
  where started_by is not null;

create index if not exists trial_runs_purge_due_idx
  on public.trial_runs(status, purge_after)
  where status = 'expired';

alter table public.analysis_jobs
  add column if not exists trial_run_id uuid
    references public.trial_runs(id) on delete set null;

alter table public.events
  add column if not exists trial_run_id uuid
    references public.trial_runs(id) on delete set null;

alter table public.storage_assets
  add column if not exists trial_run_id uuid
    references public.trial_runs(id) on delete set null;

alter table public.usage_events
  add column if not exists trial_run_id uuid
    references public.trial_runs(id) on delete set null;

create index if not exists analysis_jobs_trial_idx
  on public.analysis_jobs(trial_run_id, created_at)
  where trial_run_id is not null;

create index if not exists events_trial_idx
  on public.events(trial_run_id, started_at)
  where trial_run_id is not null;

create index if not exists storage_assets_trial_idx
  on public.storage_assets(trial_run_id, expires_at)
  where trial_run_id is not null;

create index if not exists usage_events_trial_idx
  on public.usage_events(trial_run_id, created_at)
  where trial_run_id is not null;

comment on column public.analysis_jobs.trial_run_id is
  'Trial comercial que autorizou a análise. Nulo para assinatura ou modo legado interno.';
comment on column public.events.trial_run_id is
  'Trial comercial que originou o acontecimento.';
comment on column public.storage_assets.trial_run_id is
  'Trial comercial que originou o arquivo e controla seu expurgo sem contratação.';
comment on column public.usage_events.trial_run_id is
  'Trial comercial relacionado ao consumo medido.';
