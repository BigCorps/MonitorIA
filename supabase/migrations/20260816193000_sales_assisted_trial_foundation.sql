-- MonitorIA v1.0 — Fase B1: fundação do trial comercial assistido.
--
-- Objetivos:
-- 1. preservar integralmente o trial self-service atual (24h / 1 câmera);
-- 2. preparar trial assistido por vendas (60 min / até 6 câmeras);
-- 3. permitir múltiplas câmeras por trial sem remover trial_runs.camera_id;
-- 4. criar convites comerciais de uso único, armazenando somente SHA-256 do token;
-- 5. não alterar ainda os RPCs de prepare/start/entitlement. Isso fica para B2.
--
-- Esta migration é deliberadamente aditiva e retrocompatível.

create table if not exists public.sales_trial_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  lead_name text,
  lead_email text,
  company_name text,
  selected_plan_code text not null default 'intensive'
    references public.camera_plan_catalog(code) on delete restrict,
  duration_minutes integer not null default 60
    check (duration_minutes between 15 and 1440),
  max_cameras smallint not null default 6
    check (max_cameras between 1 and 12),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_organization_id uuid
    references public.organizations(id) on delete set null,
  trial_run_id uuid references public.trial_runs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    redeemed_at is null
    or revoked_at is null
    or redeemed_at <= revoked_at
  )
);

create unique index if not exists sales_trial_invites_trial_once_idx
  on public.sales_trial_invites(trial_run_id)
  where trial_run_id is not null;

create index if not exists sales_trial_invites_active_idx
  on public.sales_trial_invites(expires_at)
  where redeemed_at is null and revoked_at is null;

create index if not exists sales_trial_invites_lead_email_idx
  on public.sales_trial_invites(lower(lead_email))
  where lead_email is not null;

comment on table public.sales_trial_invites is
  'Convites comerciais de uso único para trial assistido. O token em texto puro nunca é persistido; apenas seu SHA-256 hexadecimal.';
comment on column public.sales_trial_invites.token_hash is
  'SHA-256 hexadecimal do token presente em /lead/<token>. Nunca armazenar o token em texto puro.';
comment on column public.sales_trial_invites.duration_minutes is
  'Duração comercial prevista para a captura compartilhada do trial assistido.';
comment on column public.sales_trial_invites.max_cameras is
  'Limite máximo de câmeras que poderão participar do trial assistido.';

alter table public.trial_runs
  add column if not exists trial_mode text not null default 'self_service'
    check (trial_mode = any (array['self_service'::text, 'sales_assisted'::text])),
  add column if not exists duration_minutes integer not null default 1440
    check (duration_minutes between 15 and 1440),
  add column if not exists max_cameras smallint not null default 1
    check (max_cameras between 1 and 12),
  add column if not exists sales_invite_id uuid
    references public.sales_trial_invites(id) on delete set null;

create unique index if not exists trial_runs_sales_invite_once_idx
  on public.trial_runs(sales_invite_id)
  where sales_invite_id is not null;

comment on column public.trial_runs.trial_mode is
  'self_service preserva o fluxo atual de 24h/1 câmera; sales_assisted identifica o fluxo comercial multi-câmera.';
comment on column public.trial_runs.duration_minutes is
  'Duração prevista da captura. B2 aplicará esse valor ao iniciar o trial.';
comment on column public.trial_runs.max_cameras is
  'Quantidade máxima de câmeras permitida no trial.';
comment on column public.trial_runs.sales_invite_id is
  'Convite comercial que originou o trial assistido, quando aplicável.';

create table if not exists public.trial_run_cameras (
  id uuid primary key default gen_random_uuid(),
  trial_run_id uuid not null
    references public.trial_runs(id) on delete cascade,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  camera_id uuid not null
    references public.cameras(id) on delete cascade,
  selected_plan_code text
    references public.camera_plan_catalog(code) on delete restrict,
  agent_id uuid references public.agents(id) on delete set null,
  status text not null default 'selected'
    check (
      status = any (
        array[
          'selected'::text,
          'ready'::text,
          'running'::text,
          'capture_completed'::text,
          'removed'::text
        ]
      )
    ),
  ready_at timestamptz,
  capture_started_at timestamptz,
  capture_ends_at timestamptz,
  capture_completed_at timestamptz,
  readiness_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(readiness_snapshot) = 'object'),
  status_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trial_run_id, camera_id),
  check (
    capture_ends_at is null
    or capture_started_at is null
    or capture_ends_at > capture_started_at
  )
);

-- A câmera continua elegível para apenas um trial gratuito.
-- O backfill abaixo traz para esta tabela todas as câmeras já usadas.
create unique index if not exists trial_run_cameras_camera_once_idx
  on public.trial_run_cameras(camera_id);

create index if not exists trial_run_cameras_trial_status_idx
  on public.trial_run_cameras(trial_run_id, status, created_at);

create index if not exists trial_run_cameras_org_idx
  on public.trial_run_cameras(organization_id, created_at desc);

comment on table public.trial_run_cameras is
  'Câmeras participantes de um trial. B1 faz o backfill do modelo legado; B2 usará esta tabela para seleção multi-câmera.';
comment on column public.trial_run_cameras.readiness_snapshot is
  'Fotografia da prontidão da câmera no trial, independente das demais câmeras participantes.';

-- Garante que trial, organização e câmera sempre pertençam ao mesmo tenant.
create or replace function private.enforce_trial_run_camera_organization()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_trial_organization_id uuid;
  v_camera_organization_id uuid;
begin
  select trial.organization_id
    into v_trial_organization_id
  from public.trial_runs trial
  where trial.id = new.trial_run_id;

  select camera.organization_id
    into v_camera_organization_id
  from public.cameras camera
  where camera.id = new.camera_id;

  if v_trial_organization_id is null
     or v_camera_organization_id is null
     or new.organization_id is distinct from v_trial_organization_id
     or new.organization_id is distinct from v_camera_organization_id then
    raise exception 'trial_camera_organization_mismatch';
  end if;

  return new;
end;
$function$;

revoke all on function private.enforce_trial_run_camera_organization()
  from public, anon, authenticated;

drop trigger if exists trial_run_cameras_org_guard
  on public.trial_run_cameras;

create trigger trial_run_cameras_org_guard
before insert or update of trial_run_id, organization_id, camera_id
on public.trial_run_cameras
for each row
execute function private.enforce_trial_run_camera_organization();

-- Backfill: espelha o modelo atual de 1 câmera em trial_run_cameras.
-- Nenhum campo legado é removido, portanto os RPCs existentes continuam intactos.
insert into public.trial_run_cameras (
  trial_run_id,
  organization_id,
  camera_id,
  selected_plan_code,
  agent_id,
  status,
  ready_at,
  capture_started_at,
  capture_ends_at,
  capture_completed_at,
  readiness_snapshot,
  status_reason,
  created_at,
  updated_at
)
select
  trial.id,
  trial.organization_id,
  trial.camera_id,
  trial.selected_plan_code,
  trial.agent_id,
  case
    when trial.status = 'ready' then 'ready'
    when trial.status = 'running' then 'running'
    when trial.status in (
      'capture_completed',
      'exploration',
      'converted',
      'expired',
      'purged'
    ) then 'capture_completed'
    else 'selected'
  end,
  trial.ready_at,
  trial.capture_started_at,
  trial.capture_ends_at,
  trial.capture_completed_at,
  trial.readiness_snapshot,
  trial.status_reason,
  trial.created_at,
  trial.updated_at
from public.trial_runs trial
where trial.camera_id is not null
on conflict (trial_run_id, camera_id) do nothing;

-- Segurança: convites comerciais nunca ficam disponíveis pelo Data API.
alter table public.sales_trial_invites enable row level security;
revoke all on table public.sales_trial_invites from anon, authenticated;
grant all on table public.sales_trial_invites to service_role;

-- A relação trial/câmera pode ser lida pelo membro da organização,
-- mas alterações ficam reservadas a RPCs/servidor nas próximas etapas.
alter table public.trial_run_cameras enable row level security;

drop policy if exists monitoria_require_mfa on public.trial_run_cameras;
create policy monitoria_require_mfa
on public.trial_run_cameras
as restrictive
for all
to authenticated
using ((select public.current_session_meets_mfa_policy()))
with check ((select public.current_session_meets_mfa_policy()));

drop policy if exists trial_run_cameras_select_member
  on public.trial_run_cameras;
create policy trial_run_cameras_select_member
on public.trial_run_cameras
for select
to authenticated
using (private.is_org_member(organization_id));

revoke all on table public.trial_run_cameras from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.trial_run_cameras from authenticated;
grant select on table public.trial_run_cameras to authenticated;
grant all on table public.trial_run_cameras to service_role;
