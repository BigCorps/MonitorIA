-- MonitorIA VIP — Gate 1: fundação comercial e Projetos VIP.
-- Aditiva e retrocompatível com MonitorIA self-service e sales_assisted existentes.

create table public.vip_plan_catalog (
  code text primary key check (code ~ '^vip[0-9]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 3 and 80),
  short_description text not null default '',
  included_cameras integer not null check (included_cameras >= 10 and included_cameras <= 10000),
  monthly_amount_cents integer not null check (monthly_amount_cents > 0),
  annual_amount_cents integer not null check (annual_amount_cents > 0),
  excess_camera_monthly_cents integer not null check (excess_camera_monthly_cents > 0),
  technical_plan_code text not null default 'intensive'
    references public.camera_plan_catalog(code) on delete restrict,
  trial_duration_minutes integer not null default 60 check (trial_duration_minutes = 60),
  trial_max_cameras smallint not null default 6 check (trial_max_cameras = 6),
  sort_order smallint not null default 0,
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_plan_catalog_intensive_only_check check (technical_plan_code = 'intensive'),
  constraint vip_plan_catalog_annual_discount_check
    check (annual_amount_cents <= monthly_amount_cents * 12)
);

insert into public.vip_plan_catalog (
  code, display_name, short_description, included_cameras,
  monthly_amount_cents, annual_amount_cents, excess_camera_monthly_cents,
  technical_plan_code, trial_duration_minutes, trial_max_cameras,
  sort_order, features
)
values
  ('vip10','MonitorIA VIP 10','Projeto VIP com 10 câmeras Intensive incluídas.',10,129900,1299000,12900,'intensive',60,6,10,
   '{"all_cameras_intensive":true,"assisted_onboarding":true,"research_ready":true,"vip_beta":true}'::jsonb),
  ('vip50','MonitorIA VIP 50','Projeto VIP com 50 câmeras Intensive incluídas.',50,499900,4999000,9900,'intensive',60,6,20,
   '{"all_cameras_intensive":true,"assisted_onboarding":true,"research_ready":true,"vip_beta":true}'::jsonb),
  ('vip150','MonitorIA VIP 150','Projeto VIP com 150 câmeras Intensive incluídas.',150,1199000,11990000,7900,'intensive',60,6,30,
   '{"all_cameras_intensive":true,"assisted_onboarding":true,"research_ready":true,"vip_beta":true}'::jsonb);

comment on table public.vip_plan_catalog is
  'Catálogo comercial do MonitorIA VIP. Não substitui camera_plan_catalog: todas as câmeras VIP continuam tecnicamente no plano intensive.';
comment on column public.vip_plan_catalog.excess_camera_monthly_cents is
  'Valor mensal por câmera ativa acima da quantidade incluída. No anual, excedentes continuam sendo apurados mensalmente.';
comment on column public.vip_plan_catalog.technical_plan_code is
  'Plano técnico aplicado às câmeras do contrato VIP; Gate 1 trava em intensive.';

alter table public.vip_plan_catalog enable row level security;
revoke all on table public.vip_plan_catalog from anon, authenticated;
grant select on table public.vip_plan_catalog to anon, authenticated;
grant all on table public.vip_plan_catalog to service_role;

create policy vip_plan_catalog_public_read
on public.vip_plan_catalog
for select
to anon, authenticated
using (is_active);

create table public.vip_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete set null,
  sales_operator_id uuid not null references public.sales_operators(id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 3 and 160),
  company_name text not null check (char_length(btrim(company_name)) between 2 and 160),
  lead_name text not null check (char_length(btrim(lead_name)) between 2 and 160),
  lead_email text not null check (
    lead_email = lower(btrim(lead_email))
    and lead_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  project_kind text not null default 'enterprise' check (project_kind = any (array[
    'enterprise'::text,'large_monitoring'::text,'scientific'::text,'other'::text
  ])),
  status text not null default 'lead' check (status = any (array[
    'lead'::text,'invited'::text,'project_setup'::text,'installing'::text,
    'calibrating'::text,'ready_for_trial'::text,'trial_running'::text,
    'trial_completed'::text,'proposal'::text,'payment_pending'::text,
    'active'::text,'cancelled'::text
  ])),
  selected_plan_code text not null references public.vip_plan_catalog(code) on delete restrict,
  billing_cycle text null check (
    billing_cycle is null or billing_cycle = any (array['monthly'::text,'annual'::text])
  ),
  expected_camera_count integer not null check (expected_camera_count between 10 and 100000),
  technical_plan_code text not null default 'intensive'
    references public.camera_plan_catalog(code) on delete restrict,
  trial_duration_minutes integer not null default 60 check (trial_duration_minutes = 60),
  trial_max_cameras smallint not null default 6 check (trial_max_cameras = 6),
  objective text null check (objective is null or char_length(objective) <= 4000),
  onboarding_started_at timestamptz null,
  trial_started_at timestamptz null,
  trial_completed_at timestamptz null,
  proposal_presented_at timestamptz null,
  payment_pending_at timestamptz null,
  activated_at timestamptz null,
  cancelled_at timestamptz null,
  created_by uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_projects_intensive_only_check check (technical_plan_code = 'intensive')
);

create index vip_projects_operator_status_idx
  on public.vip_projects(sales_operator_id, status, created_at desc);
create index vip_projects_organization_idx
  on public.vip_projects(organization_id, created_at desc)
  where organization_id is not null;
create index vip_projects_lead_email_idx
  on public.vip_projects(lead_email, created_at desc);
create index vip_projects_status_idx
  on public.vip_projects(status, updated_at desc);

comment on table public.vip_projects is
  'Funil e implantação do MonitorIA VIP. Pode nascer antes da organização e é vinculado ao tenant quando o convite comercial é resgatado.';
comment on column public.vip_projects.status is
  'Estado canônico: lead → invited → project_setup → installing → calibrating → ready_for_trial → trial_running → trial_completed → proposal → payment_pending → active.';
comment on column public.vip_projects.expected_camera_count is
  'Escopo comercial esperado. O pacote mínimo VIP é 10 câmeras, embora o piloto assistido use no máximo 6.';

alter table public.vip_projects enable row level security;
revoke all on table public.vip_projects from anon, authenticated;
grant all on table public.vip_projects to service_role;

create table public.vip_project_status_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.vip_projects(id) on delete cascade,
  from_status text null,
  to_status text not null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  actor_sales_operator_id uuid null references public.sales_operators(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index vip_project_status_events_project_idx
  on public.vip_project_status_events(project_id, created_at desc);

alter table public.vip_project_status_events enable row level security;
revoke all on table public.vip_project_status_events from anon, authenticated;
grant all on table public.vip_project_status_events to service_role;

comment on table public.vip_project_status_events is
  'Histórico append-only das transições do funil VIP.';

create or replace function private.vip_project_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_from = p_to
    or (p_from = 'lead' and p_to = any (array['invited','cancelled']))
    or (p_from = 'invited' and p_to = any (array['project_setup','cancelled']))
    or (p_from = 'project_setup' and p_to = any (array['installing','cancelled']))
    or (p_from = 'installing' and p_to = any (array['calibrating','project_setup','cancelled']))
    or (p_from = 'calibrating' and p_to = any (array['ready_for_trial','installing','cancelled']))
    or (p_from = 'ready_for_trial' and p_to = any (array['trial_running','calibrating','cancelled']))
    or (p_from = 'trial_running' and p_to = any (array['trial_completed','cancelled']))
    or (p_from = 'trial_completed' and p_to = any (array['proposal','cancelled']))
    or (p_from = 'proposal' and p_to = any (array['payment_pending','trial_completed','cancelled']))
    or (p_from = 'payment_pending' and p_to = any (array['active','proposal','cancelled']))
    or (p_from = 'active' and p_to = 'cancelled');
$$;

revoke all on function private.vip_project_transition_allowed(text, text)
  from public, anon, authenticated;
grant execute on function private.vip_project_transition_allowed(text, text)
  to service_role;

create or replace function private.vip_project_insert_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vip_project_status_events (
    project_id, from_status, to_status, actor_user_id, actor_sales_operator_id, metadata
  ) values (
    new.id, null, new.status, new.created_by, new.sales_operator_id,
    jsonb_build_object('source', 'project_created')
  );
  return new;
end;
$$;

revoke all on function private.vip_project_insert_history()
  from public, anon, authenticated;

create trigger vip_projects_insert_history
after insert on public.vip_projects
for each row
execute function private.vip_project_insert_history();

create or replace function public.transition_vip_project(
  p_project_id uuid,
  p_to_status text,
  p_actor_user_id uuid default null,
  p_actor_sales_operator_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
  v_now timestamptz := now();
begin
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'invalid_vip_transition_metadata';
  end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id = p_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if p_actor_sales_operator_id is not null
     and p_actor_sales_operator_id is distinct from v_project.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  if not private.vip_project_transition_allowed(v_project.status, p_to_status) then
    raise exception 'vip_project_transition_not_allowed';
  end if;

  if v_project.status = p_to_status then
    return jsonb_build_object(
      'success', true, 'duplicate', true,
      'projectId', v_project.id, 'status', v_project.status
    );
  end if;

  update public.vip_projects
  set status = p_to_status,
      onboarding_started_at = case
        when p_to_status = 'project_setup' then coalesce(onboarding_started_at, v_now)
        else onboarding_started_at end,
      trial_started_at = case
        when p_to_status = 'trial_running' then coalesce(trial_started_at, v_now)
        else trial_started_at end,
      trial_completed_at = case
        when p_to_status = 'trial_completed' then coalesce(trial_completed_at, v_now)
        else trial_completed_at end,
      proposal_presented_at = case
        when p_to_status = 'proposal' then coalesce(proposal_presented_at, v_now)
        else proposal_presented_at end,
      payment_pending_at = case
        when p_to_status = 'payment_pending' then coalesce(payment_pending_at, v_now)
        else payment_pending_at end,
      activated_at = case
        when p_to_status = 'active' then coalesce(activated_at, v_now)
        else activated_at end,
      cancelled_at = case
        when p_to_status = 'cancelled' then coalesce(cancelled_at, v_now)
        else cancelled_at end,
      updated_at = v_now
  where id = p_project_id
  returning * into v_project;

  insert into public.vip_project_status_events (
    project_id, from_status, to_status,
    actor_user_id, actor_sales_operator_id, metadata
  ) values (
    v_project.id,
    (select event.to_status
       from public.vip_project_status_events event
      where event.project_id = v_project.id
      order by event.created_at desc
      offset 0 limit 1),
    p_to_status,
    p_actor_user_id,
    p_actor_sales_operator_id,
    p_metadata
  );

  if v_project.organization_id is not null then
    insert into public.audit_logs (
      organization_id, actor_user_id, action, entity_type, entity_id, metadata
    ) values (
      v_project.organization_id,
      p_actor_user_id,
      'vip.project_status_changed',
      'vip_project',
      v_project.id::text,
      jsonb_build_object(
        'toStatus', p_to_status,
        'salesOperatorId', p_actor_sales_operator_id
      ) || p_metadata
    );
  end if;

  return jsonb_build_object(
    'success', true, 'duplicate', false,
    'projectId', v_project.id, 'status', v_project.status
  );
end;
$$;

revoke all on function public.transition_vip_project(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.transition_vip_project(uuid, text, uuid, uuid, jsonb)
  to service_role;

alter table public.sales_trial_invites
  add column vip_project_id uuid null
  references public.vip_projects(id) on delete set null;

create index sales_trial_invites_vip_project_idx
  on public.sales_trial_invites(vip_project_id, created_at desc)
  where vip_project_id is not null;

alter table public.sales_trial_invites
  add constraint sales_trial_invites_vip_contract_check
  check (
    vip_project_id is null
    or (
      selected_plan_code = 'intensive'
      and duration_minutes = 60
      and max_cameras between 1 and 6
      and sales_operator_id is not null
    )
  );

alter table public.trial_runs
  add column vip_project_id uuid null
  references public.vip_projects(id) on delete set null;

create unique index trial_runs_vip_project_once_idx
  on public.trial_runs(vip_project_id)
  where vip_project_id is not null;

alter table public.trial_runs
  add constraint trial_runs_vip_contract_check
  check (
    vip_project_id is null
    or (
      trial_mode = 'sales_assisted'
      and selected_plan_code = 'intensive'
      and duration_minutes = 60
      and max_cameras between 1 and 6
    )
  );

comment on column public.sales_trial_invites.vip_project_id is
  'Projeto MonitorIA VIP ao qual o convite assistido pertence. NULL preserva o fluxo comercial padrão.';
comment on column public.trial_runs.vip_project_id is
  'Projeto MonitorIA VIP que originou o trial assistido. NULL preserva os trials atuais.';

create or replace function private.validate_vip_sales_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
begin
  if new.vip_project_id is null then
    return new;
  end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id = new.vip_project_id;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if new.sales_operator_id is null
     or new.sales_operator_id is distinct from v_project.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  if new.selected_plan_code <> 'intensive'
     or new.duration_minutes <> 60
     or new.max_cameras < 1
     or new.max_cameras > 6 then
    raise exception 'vip_trial_contract_invalid';
  end if;

  if new.redeemed_at is null
     and v_project.status not in ('lead', 'invited') then
    raise exception 'vip_project_not_invitable';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_vip_sales_invite()
  from public, anon, authenticated;

create trigger sales_trial_invites_vip_contract_guard
before insert or update of vip_project_id, sales_operator_id, selected_plan_code,
  duration_minutes, max_cameras, redeemed_at
on public.sales_trial_invites
for each row
execute function private.validate_vip_sales_invite();

create or replace function private.sync_vip_project_from_sales_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
begin
  if new.vip_project_id is null
     or new.redeemed_at is null
     or old.redeemed_at is not null then
    return new;
  end if;

  if new.redeemed_organization_id is null or new.trial_run_id is null then
    raise exception 'vip_redeemed_invite_incomplete';
  end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id = new.vip_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if v_project.sales_operator_id is distinct from new.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  if v_project.organization_id is not null
     and v_project.organization_id is distinct from new.redeemed_organization_id then
    raise exception 'vip_project_organization_mismatch';
  end if;

  if v_project.status not in ('invited', 'project_setup') then
    raise exception 'vip_project_not_redeemable';
  end if;

  update public.vip_projects
  set organization_id = new.redeemed_organization_id,
      updated_at = now()
  where id = new.vip_project_id;

  update public.trial_runs
  set vip_project_id = new.vip_project_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'productFamily', 'monitoria_vip',
        'vipProjectId', new.vip_project_id,
        'vipPlanCode', v_project.selected_plan_code
      ),
      updated_at = now()
  where id = new.trial_run_id
    and organization_id = new.redeemed_organization_id;

  if not found then
    raise exception 'vip_trial_link_failed';
  end if;

  if v_project.status = 'invited' then
    perform public.transition_vip_project(
      new.vip_project_id,
      'project_setup',
      new.redeemed_by,
      null,
      jsonb_build_object(
        'source', 'sales_invite_redeemed',
        'salesInviteId', new.id,
        'trialRunId', new.trial_run_id
      )
    );
  end if;

  return new;
end;
$$;

revoke all on function private.sync_vip_project_from_sales_invite()
  from public, anon, authenticated;

create trigger sales_trial_invites_vip_redeemed_sync
after update of redeemed_at, redeemed_organization_id, trial_run_id
on public.sales_trial_invites
for each row
when (new.vip_project_id is not null)
execute function private.sync_vip_project_from_sales_invite();
