-- MonitorIA — INT-5
-- Inteligência de processos e ações operacionais v1.
-- Requer INT-3 (operational_sessions), INT-3.8 (operational_insights)
-- e INT-4 (camera_behavior_baselines / operational_deviations).

begin;

do $$
begin
  if to_regclass('public.operational_sessions') is null then
    raise exception 'monitoria_int_3_required';
  end if;
  if to_regclass('public.operational_session_events') is null then
    raise exception 'monitoria_int_3_session_events_required';
  end if;
  if to_regclass('public.operational_insights') is null then
    raise exception 'monitoria_int_3_8_required';
  end if;
  if to_regclass('public.camera_behavior_baselines') is null then
    raise exception 'monitoria_int_4_required';
  end if;
end
$$;

alter table public.cameras
  add column if not exists process_intelligence_enabled boolean not null default false,
  add column if not exists process_min_confidence numeric(4,3) not null default 0.650,
  add column if not exists process_stall_minutes integer not null default 20,
  add column if not exists process_max_unexpected_steps integer not null default 4;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_process_min_confidence_check'
  ) then
    alter table public.cameras
      add constraint cameras_process_min_confidence_check
      check (process_min_confidence between 0.4 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_process_stall_minutes_check'
  ) then
    alter table public.cameras
      add constraint cameras_process_stall_minutes_check
      check (process_stall_minutes between 2 and 1440);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_process_max_unexpected_steps_check'
  ) then
    alter table public.cameras
      add constraint cameras_process_max_unexpected_steps_check
      check (process_max_unexpected_steps between 0 and 50);
  end if;
end
$$;

comment on column public.cameras.process_intelligence_enabled is
  'Ativa reconstrução determinística de processos a partir das sessões e capítulos operacionais.';

create table if not exists public.operational_process_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete cascade,
  camera_id uuid null references public.cameras(id) on delete cascade,
  scope_key text not null,
  process_code text not null,
  version integer not null default 1,
  name text not null,
  description text not null default '',
  session_type text not null,
  source text not null default 'system',
  status text not null default 'active',
  strictness text not null default 'balanced',
  expected_duration_min_seconds integer null,
  expected_duration_max_seconds integer null,
  result_policy text not null default 'visual_only',
  created_by uuid null references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_process_definitions_code_check check (
    process_code ~ '^[a-z0-9][a-z0-9_.-]{2,79}$'
  ),
  constraint operational_process_definitions_version_check check (version >= 1),
  constraint operational_process_definitions_source_check check (
    source in ('system', 'organization', 'site', 'camera')
  ),
  constraint operational_process_definitions_session_type_check check (
    session_type in (
      'customer_service',
      'delivery_or_pickup',
      'visitor_stay',
      'staff_activity',
      'equipment_operation',
      'restricted_area_access',
      'opening_procedure',
      'closing_procedure',
      'other'
    )
  ),
  constraint operational_process_definitions_status_check check (
    status in ('draft', 'active', 'paused', 'archived')
  ),
  constraint operational_process_definitions_strictness_check check (
    strictness in ('flexible', 'balanced', 'strict')
  ),
  constraint operational_process_definitions_result_check check (
    result_policy in ('visual_only', 'session_outcome', 'required_final_step')
  ),
  constraint operational_process_definitions_duration_check check (
    (expected_duration_min_seconds is null or expected_duration_min_seconds >= 0)
    and (expected_duration_max_seconds is null or expected_duration_max_seconds >= 0)
    and (
      expected_duration_min_seconds is null
      or expected_duration_max_seconds is null
      or expected_duration_max_seconds >= expected_duration_min_seconds
    )
  ),
  constraint operational_process_definitions_scope_check check (
    (source = 'system' and organization_id is null and site_id is null and camera_id is null and scope_key = 'system')
    or
    (source = 'organization' and organization_id is not null and site_id is null and camera_id is null and scope_key = 'org:' || organization_id::text)
    or
    (source = 'site' and organization_id is not null and site_id is not null and camera_id is null and scope_key = 'site:' || site_id::text)
    or
    (source = 'camera' and organization_id is not null and camera_id is not null and scope_key = 'camera:' || camera_id::text)
  ),
  constraint operational_process_definitions_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists operational_process_definitions_scope_code_uidx
  on public.operational_process_definitions(scope_key, process_code, version);
create index if not exists operational_process_definitions_match_idx
  on public.operational_process_definitions(session_type, status, source);
create index if not exists operational_process_definitions_org_idx
  on public.operational_process_definitions(organization_id, updated_at desc)
  where organization_id is not null;

create table if not exists public.operational_process_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  process_definition_id uuid not null references public.operational_process_definitions(id) on delete cascade,
  step_code text not null,
  name text not null,
  description text not null default '',
  sort_order integer not null,
  required boolean not null default true,
  repeatable boolean not null default false,
  terminal boolean not null default false,
  accepted_chapter_types text[] not null default '{}',
  minimum_confidence numeric(4,3) not null default 0.500,
  maximum_gap_seconds integer null,
  evidence_required boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_process_steps_code_check check (
    step_code ~ '^[a-z0-9][a-z0-9_.-]{1,79}$'
  ),
  constraint operational_process_steps_order_check check (sort_order >= 1),
  constraint operational_process_steps_confidence_check check (
    minimum_confidence between 0 and 1
  ),
  constraint operational_process_steps_gap_check check (
    maximum_gap_seconds is null or maximum_gap_seconds between 1 and 86400
  ),
  constraint operational_process_steps_chapters_check check (
    cardinality(accepted_chapter_types) >= 1
    and accepted_chapter_types <@ array[
      'arrival',
      'waiting',
      'service_started',
      'service_continued',
      'terminal_activity',
      'object_handoff',
      'departure',
      'opening_step',
      'closing_step',
      'equipment_activity',
      'restricted_access',
      'state_change',
      'presence',
      'other'
    ]::text[]
  ),
  constraint operational_process_steps_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists operational_process_steps_code_uidx
  on public.operational_process_steps(process_definition_id, step_code);
create unique index if not exists operational_process_steps_order_uidx
  on public.operational_process_steps(process_definition_id, sort_order);
create index if not exists operational_process_steps_definition_idx
  on public.operational_process_steps(process_definition_id, sort_order);

create table if not exists public.operational_process_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  process_definition_id uuid not null references public.operational_process_definitions(id) on delete restrict,
  operational_session_id uuid not null references public.operational_sessions(id) on delete cascade,
  process_code text not null,
  process_name text not null,
  status text not null default 'open',
  result_code text not null default 'in_progress',
  started_at timestamptz not null,
  last_observed_at timestamptz not null,
  ended_at timestamptz null,
  duration_seconds numeric not null default 0,
  required_steps_total integer not null default 0,
  required_steps_completed integer not null default 0,
  observed_steps_count integer not null default 0,
  unexpected_steps_count integer not null default 0,
  progress_ratio numeric(5,4) not null default 0,
  next_expected_step_code text null,
  confidence numeric(5,4) not null default 0,
  title text not null default '',
  summary text not null default '',
  insight_id uuid null references public.operational_insights(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_process_instances_status_check check (
    status in ('open', 'completed', 'incomplete', 'uncertain', 'aborted')
  ),
  constraint operational_process_instances_confidence_check check (
    confidence between 0 and 1 and progress_ratio between 0 and 1
  ),
  constraint operational_process_instances_count_check check (
    required_steps_total >= 0
    and required_steps_completed >= 0
    and required_steps_completed <= required_steps_total
    and observed_steps_count >= 0
    and unexpected_steps_count >= 0
  ),
  constraint operational_process_instances_time_check check (
    last_observed_at >= started_at
    and (ended_at is null or ended_at >= started_at)
    and duration_seconds >= 0
  ),
  constraint operational_process_instances_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists operational_process_instances_session_uidx
  on public.operational_process_instances(operational_session_id);
create index if not exists operational_process_instances_org_time_idx
  on public.operational_process_instances(organization_id, started_at desc);
create index if not exists operational_process_instances_camera_status_idx
  on public.operational_process_instances(camera_id, status, last_observed_at desc);
create index if not exists operational_process_instances_code_idx
  on public.operational_process_instances(organization_id, process_code, started_at desc);

create table if not exists public.operational_process_instance_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  process_instance_id uuid not null references public.operational_process_instances(id) on delete cascade,
  process_step_id uuid null references public.operational_process_steps(id) on delete set null,
  operational_session_event_id uuid null references public.operational_session_events(id) on delete set null,
  event_id uuid null references public.events(id) on delete set null,
  step_code text not null,
  step_name text not null,
  expected_order integer not null,
  observed_order integer null,
  status text not null,
  observed_at timestamptz null,
  confidence numeric(5,4) not null default 0,
  evidence_event_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_process_instance_steps_status_check check (
    status in ('pending', 'observed', 'missing', 'skipped', 'ambiguous', 'out_of_order', 'unexpected')
  ),
  constraint operational_process_instance_steps_order_check check (
    expected_order >= 0 and (observed_order is null or observed_order >= 1)
  ),
  constraint operational_process_instance_steps_confidence_check check (
    confidence between 0 and 1
  ),
  constraint operational_process_instance_steps_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists operational_process_instance_steps_expected_uidx
  on public.operational_process_instance_steps(process_instance_id, process_step_id)
  where process_step_id is not null;
create unique index if not exists operational_process_instance_steps_event_uidx
  on public.operational_process_instance_steps(process_instance_id, operational_session_event_id)
  where operational_session_event_id is not null;
create index if not exists operational_process_instance_steps_instance_idx
  on public.operational_process_instance_steps(process_instance_id, expected_order, observed_order);

create table if not exists public.operational_process_deviations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  process_instance_id uuid not null references public.operational_process_instances(id) on delete cascade,
  process_step_id uuid null references public.operational_process_steps(id) on delete set null,
  deviation_key text not null,
  deviation_code text not null,
  status text not null default 'active',
  severity text not null default 'low',
  title text not null,
  summary text not null,
  confidence numeric(5,4) not null default 0,
  observed_at timestamptz not null,
  resolved_at timestamptz null,
  evidence_event_ids uuid[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_process_deviations_code_check check (
    deviation_code in (
      'missing_required_step',
      'out_of_order_step',
      'unexpected_step',
      'duration_high',
      'duration_low',
      'stalled',
      'ambiguous_result'
    )
  ),
  constraint operational_process_deviations_status_check check (
    status in ('active', 'resolved', 'dismissed', 'informational')
  ),
  constraint operational_process_deviations_severity_check check (
    severity in ('info', 'low', 'medium', 'high', 'critical')
  ),
  constraint operational_process_deviations_confidence_check check (
    confidence between 0 and 1
  ),
  constraint operational_process_deviations_data_check check (
    jsonb_typeof(data) = 'object'
  )
);

create unique index if not exists operational_process_deviations_key_uidx
  on public.operational_process_deviations(process_instance_id, deviation_key);
create index if not exists operational_process_deviations_org_time_idx
  on public.operational_process_deviations(organization_id, observed_at desc);
create index if not exists operational_process_deviations_camera_status_idx
  on public.operational_process_deviations(camera_id, status, observed_at desc);

create table if not exists public.operational_process_refresh_queue (
  operational_session_id uuid primary key references public.operational_sessions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  reason text not null default 'session_changed',
  requested_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  locked_at timestamptz null,
  last_error text null,
  constraint operational_process_refresh_queue_attempt_check check (attempt_count >= 0)
);

create index if not exists operational_process_refresh_queue_pending_idx
  on public.operational_process_refresh_queue(next_attempt_at, requested_at)
  where locked_at is null;

create table if not exists public.operational_process_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  camera_id uuid null references public.cameras(id) on delete cascade,
  mode text not null,
  status text not null default 'running',
  sessions_scanned integer not null default 0,
  instances_written integer not null default 0,
  deviations_written integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint operational_process_refresh_runs_mode_check check (
    mode in ('queue', 'full', 'single')
  ),
  constraint operational_process_refresh_runs_status_check check (
    status in ('running', 'completed', 'failed')
  ),
  constraint operational_process_refresh_runs_count_check check (
    sessions_scanned >= 0 and instances_written >= 0 and deviations_written >= 0
  ),
  constraint operational_process_refresh_runs_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

-- Templates genéricos de sistema. Não identificam empresa, pessoa ou câmera específica.
insert into public.operational_process_definitions (
  scope_key, process_code, version, name, description, session_type,
  source, status, strictness, result_policy, metadata
)
values
  ('system', 'customer_service', 1, 'Atendimento ao cliente',
   'Sequência visual genérica de chegada, atendimento e encerramento.',
   'customer_service', 'system', 'active', 'flexible', 'session_outcome',
   '{"generic":true}'::jsonb),
  ('system', 'delivery_or_pickup', 1, 'Entrega ou retirada',
   'Sequência visual genérica de chegada, transferência de objeto e saída.',
   'delivery_or_pickup', 'system', 'active', 'balanced', 'session_outcome',
   '{"generic":true}'::jsonb),
  ('system', 'visitor_stay', 1, 'Permanência de visitante',
   'Sequência visual genérica de chegada, permanência e saída.',
   'visitor_stay', 'system', 'active', 'flexible', 'session_outcome',
   '{"generic":true}'::jsonb),
  ('system', 'opening_procedure', 1, 'Procedimento de abertura',
   'Etapas visuais de abertura e confirmação do estado operacional.',
   'opening_procedure', 'system', 'active', 'balanced', 'required_final_step',
   '{"generic":true}'::jsonb),
  ('system', 'closing_procedure', 1, 'Procedimento de fechamento',
   'Etapas visuais de fechamento e confirmação do estado operacional.',
   'closing_procedure', 'system', 'active', 'balanced', 'required_final_step',
   '{"generic":true}'::jsonb),
  ('system', 'equipment_operation', 1, 'Operação de equipamento',
   'Sequência visual genérica de atividade e mudança observável de estado.',
   'equipment_operation', 'system', 'active', 'flexible', 'visual_only',
   '{"generic":true}'::jsonb),
  ('system', 'restricted_area_access', 1, 'Acesso a área restrita',
   'Sequência visual genérica de acesso, permanência e saída.',
   'restricted_area_access', 'system', 'active', 'balanced', 'visual_only',
   '{"generic":true}'::jsonb),
  ('system', 'staff_activity', 1, 'Atividade de funcionário',
   'Sequência visual genérica de atividade operacional de funcionário provável.',
   'staff_activity', 'system', 'active', 'flexible', 'visual_only',
   '{"generic":true}'::jsonb)
on conflict (scope_key, process_code, version) do update set
  name = excluded.name,
  description = excluded.description,
  session_type = excluded.session_type,
  status = excluded.status,
  strictness = excluded.strictness,
  result_policy = excluded.result_policy,
  updated_at = now();

with steps(process_code, step_code, name, sort_order, required, repeatable, terminal, chapters) as (
  values
    ('customer_service','arrival','Chegada',1,true,false,false,array['arrival']::text[]),
    ('customer_service','waiting','Espera',2,false,false,false,array['waiting','presence']::text[]),
    ('customer_service','service','Atendimento iniciado',3,true,false,false,array['service_started','service_continued']::text[]),
    ('customer_service','transaction','Interação operacional',4,false,true,false,array['terminal_activity','object_handoff']::text[]),
    ('customer_service','departure','Encerramento e saída',5,false,false,true,array['departure']::text[]),

    ('delivery_or_pickup','arrival','Chegada',1,true,false,false,array['arrival']::text[]),
    ('delivery_or_pickup','handoff','Transferência de objeto',2,true,true,false,array['object_handoff']::text[]),
    ('delivery_or_pickup','departure','Saída',3,false,false,true,array['departure']::text[]),

    ('visitor_stay','arrival','Chegada',1,true,false,false,array['arrival']::text[]),
    ('visitor_stay','presence','Permanência',2,false,true,false,array['presence','waiting']::text[]),
    ('visitor_stay','departure','Saída',3,false,false,true,array['departure']::text[]),

    ('opening_procedure','opening_actions','Ações de abertura',1,true,true,false,array['opening_step']::text[]),
    ('opening_procedure','open_state','Estado aberto confirmado',2,true,false,true,array['state_change']::text[]),

    ('closing_procedure','closing_actions','Ações de fechamento',1,true,true,false,array['closing_step']::text[]),
    ('closing_procedure','closed_state','Estado fechado confirmado',2,true,false,true,array['state_change']::text[]),

    ('equipment_operation','operation','Atividade no equipamento',1,true,true,false,array['equipment_activity']::text[]),
    ('equipment_operation','state_change','Mudança de estado',2,false,true,true,array['state_change']::text[]),

    ('restricted_area_access','access','Acesso observado',1,true,false,false,array['restricted_access']::text[]),
    ('restricted_area_access','presence','Permanência',2,false,true,false,array['presence']::text[]),
    ('restricted_area_access','departure','Saída',3,false,false,true,array['departure']::text[]),

    ('staff_activity','activity','Atividade operacional',1,true,true,false,array['presence','terminal_activity','equipment_activity','object_handoff','state_change']::text[])
)
insert into public.operational_process_steps (
  organization_id,
  process_definition_id,
  step_code,
  name,
  sort_order,
  required,
  repeatable,
  terminal,
  accepted_chapter_types,
  metadata
)
select
  null,
  definition.id,
  steps.step_code,
  steps.name,
  steps.sort_order,
  steps.required,
  steps.repeatable,
  steps.terminal,
  steps.chapters,
  '{"system_template":true}'::jsonb
from steps
join public.operational_process_definitions definition
  on definition.scope_key = 'system'
 and definition.process_code = steps.process_code
 and definition.version = 1
on conflict (process_definition_id, step_code) do update set
  name = excluded.name,
  sort_order = excluded.sort_order,
  required = excluded.required,
  repeatable = excluded.repeatable,
  terminal = excluded.terminal,
  accepted_chapter_types = excluded.accepted_chapter_types,
  updated_at = now();

alter table public.operational_process_definitions enable row level security;
alter table public.operational_process_steps enable row level security;
alter table public.operational_process_instances enable row level security;
alter table public.operational_process_instance_steps enable row level security;
alter table public.operational_process_deviations enable row level security;
alter table public.operational_process_refresh_queue enable row level security;
alter table public.operational_process_refresh_runs enable row level security;

drop policy if exists operational_process_definitions_select on public.operational_process_definitions;
create policy operational_process_definitions_select
on public.operational_process_definitions
for select
to authenticated
using (
  organization_id is null
  or private.is_org_member(organization_id)
);

drop policy if exists operational_process_definitions_insert_admin on public.operational_process_definitions;
create policy operational_process_definitions_insert_admin
on public.operational_process_definitions
for insert
to authenticated
with check (
  operational_process_definitions.organization_id is not null
  and private.has_org_role(
    operational_process_definitions.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
  and (operational_process_definitions.site_id is null or exists (
    select 1 from public.sites site
    where site.id = operational_process_definitions.site_id
      and site.organization_id = operational_process_definitions.organization_id
  ))
  and (operational_process_definitions.camera_id is null or exists (
    select 1 from public.cameras camera
    where camera.id = operational_process_definitions.camera_id
      and camera.organization_id = operational_process_definitions.organization_id
  ))
);

drop policy if exists operational_process_definitions_update_admin on public.operational_process_definitions;
create policy operational_process_definitions_update_admin
on public.operational_process_definitions
for update
to authenticated
using (
  operational_process_definitions.organization_id is not null
  and private.has_org_role(
    operational_process_definitions.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
)
with check (
  operational_process_definitions.organization_id is not null
  and private.has_org_role(
    operational_process_definitions.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
  and (operational_process_definitions.site_id is null or exists (
    select 1 from public.sites site
    where site.id = operational_process_definitions.site_id
      and site.organization_id = operational_process_definitions.organization_id
  ))
  and (operational_process_definitions.camera_id is null or exists (
    select 1 from public.cameras camera
    where camera.id = operational_process_definitions.camera_id
      and camera.organization_id = operational_process_definitions.organization_id
  ))
);

drop policy if exists operational_process_definitions_delete_admin on public.operational_process_definitions;
create policy operational_process_definitions_delete_admin
on public.operational_process_definitions
for delete
to authenticated
using (
  operational_process_definitions.organization_id is not null
  and private.has_org_role(
    operational_process_definitions.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists operational_process_steps_select on public.operational_process_steps;
create policy operational_process_steps_select
on public.operational_process_steps
for select
to authenticated
using (
  organization_id is null
  or private.is_org_member(organization_id)
);

drop policy if exists operational_process_steps_write_admin on public.operational_process_steps;
create policy operational_process_steps_write_admin
on public.operational_process_steps
for all
to authenticated
using (
  operational_process_steps.organization_id is not null
  and private.has_org_role(
    operational_process_steps.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
  and exists (
    select 1
    from public.operational_process_definitions definition
    where definition.id = operational_process_steps.process_definition_id
      and definition.organization_id = operational_process_steps.organization_id
      and definition.organization_id is not null
  )
)
with check (
  operational_process_steps.organization_id is not null
  and private.has_org_role(
    operational_process_steps.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
  and exists (
    select 1
    from public.operational_process_definitions definition
    where definition.id = operational_process_steps.process_definition_id
      and definition.organization_id = operational_process_steps.organization_id
      and definition.organization_id is not null
  )
);

drop policy if exists operational_process_instances_select on public.operational_process_instances;
create policy operational_process_instances_select
on public.operational_process_instances
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_process_instance_steps_select on public.operational_process_instance_steps;
create policy operational_process_instance_steps_select
on public.operational_process_instance_steps
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_process_deviations_select on public.operational_process_deviations;
create policy operational_process_deviations_select
on public.operational_process_deviations
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_process_refresh_runs_select on public.operational_process_refresh_runs;
create policy operational_process_refresh_runs_select
on public.operational_process_refresh_runs
for select
to authenticated
using (
  organization_id is null
  or private.is_org_member(organization_id)
);

-- A fila é interna. Nenhuma policy de cliente é criada.

create or replace function private.process_definition_scope_priority_v1(
  p_source text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_source
    when 'camera' then 1
    when 'site' then 2
    when 'organization' then 3
    else 4
  end;
$$;

create or replace function private.enqueue_operational_process_session_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_organization_id uuid;
  v_camera_id uuid;
begin
  if tg_table_name = 'operational_sessions' then
    if tg_op = 'DELETE' then
      v_session_id := old.id;
    else
      v_session_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      v_session_id := old.session_id;
    else
      v_session_id := new.session_id;
    end if;
  end if;

  select session.organization_id, session.camera_id
    into v_organization_id, v_camera_id
  from public.operational_sessions session
  join public.cameras camera on camera.id = session.camera_id
  where session.id = v_session_id
    and camera.process_intelligence_enabled = true;

  if v_organization_id is not null then
    insert into public.operational_process_refresh_queue (
      operational_session_id,
      organization_id,
      camera_id,
      reason,
      requested_at,
      next_attempt_at,
      locked_at,
      last_error
    ) values (
      v_session_id,
      v_organization_id,
      v_camera_id,
      tg_table_name || ':' || lower(tg_op),
      now(),
      now(),
      null,
      null
    )
    on conflict (operational_session_id) do update set
      reason = excluded.reason,
      requested_at = excluded.requested_at,
      next_attempt_at = least(
        public.operational_process_refresh_queue.next_attempt_at,
        excluded.next_attempt_at
      ),
      locked_at = null,
      last_error = null;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists operational_sessions_enqueue_process_refresh on public.operational_sessions;
create trigger operational_sessions_enqueue_process_refresh
after insert or update of status, last_event_at, ended_at, duration_seconds, chapter_count, outcome_code, confidence
on public.operational_sessions
for each row
execute function private.enqueue_operational_process_session_v1();

drop trigger if exists operational_session_events_enqueue_process_refresh on public.operational_session_events;
create trigger operational_session_events_enqueue_process_refresh
after insert or update or delete
on public.operational_session_events
for each row
execute function private.enqueue_operational_process_session_v1();

create or replace function private.upsert_process_deviation_v1(
  p_instance public.operational_process_instances,
  p_step_id uuid,
  p_key text,
  p_code text,
  p_severity text,
  p_title text,
  p_summary text,
  p_confidence numeric,
  p_observed_at timestamptz,
  p_evidence_event_ids uuid[],
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.operational_process_deviations (
    organization_id,
    site_id,
    camera_id,
    process_instance_id,
    process_step_id,
    deviation_key,
    deviation_code,
    status,
    severity,
    title,
    summary,
    confidence,
    observed_at,
    resolved_at,
    evidence_event_ids,
    data
  ) values (
    p_instance.organization_id,
    p_instance.site_id,
    p_instance.camera_id,
    p_instance.id,
    p_step_id,
    p_key,
    p_code,
    'active',
    p_severity,
    p_title,
    p_summary,
    greatest(0, least(1, coalesce(p_confidence, 0))),
    p_observed_at,
    null,
    coalesce(p_evidence_event_ids, '{}'),
    coalesce(p_data, '{}'::jsonb)
  )
  on conflict (process_instance_id, deviation_key) do update set
    process_step_id = excluded.process_step_id,
    deviation_code = excluded.deviation_code,
    status = 'active',
    severity = excluded.severity,
    title = excluded.title,
    summary = excluded.summary,
    confidence = excluded.confidence,
    observed_at = excluded.observed_at,
    resolved_at = null,
    evidence_event_ids = excluded.evidence_event_ids,
    data = excluded.data,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function private.upsert_process_insight_v1(
  p_instance public.operational_process_instances,
  p_severity text,
  p_data jsonb,
  p_evidence_event_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select insight.id into v_id
  from public.operational_insights insight
  where insight.organization_id = p_instance.organization_id
    and insight.insight_type = 'process'
    and insight.source_entity_type = 'process_instance'
    and insight.source_entity_id = p_instance.id
  order by insight.created_at desc
  limit 1;

  if v_id is null then
    insert into public.operational_insights (
      organization_id,
      site_id,
      camera_id,
      insight_type,
      status,
      severity,
      title,
      summary,
      confidence,
      observed_at,
      valid_until,
      source_entity_type,
      source_entity_id,
      evidence_event_ids,
      phase_source,
      data
    ) values (
      p_instance.organization_id,
      p_instance.site_id,
      p_instance.camera_id,
      'process',
      case when p_instance.status in ('open', 'incomplete', 'uncertain') then 'active' else 'informational' end,
      p_severity,
      p_instance.title,
      p_instance.summary,
      p_instance.confidence,
      p_instance.last_observed_at,
      null,
      'process_instance',
      p_instance.id,
      coalesce(p_evidence_event_ids, '{}'),
      'INT-5',
      coalesce(p_data, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.operational_insights set
      status = case when p_instance.status in ('open', 'incomplete', 'uncertain') then 'active' else 'informational' end,
      severity = p_severity,
      title = p_instance.title,
      summary = p_instance.summary,
      confidence = p_instance.confidence,
      observed_at = p_instance.last_observed_at,
      evidence_event_ids = coalesce(p_evidence_event_ids, '{}'),
      phase_source = 'INT-5',
      data = coalesce(p_data, '{}'::jsonb),
      updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function public.refresh_operational_process_for_session_v1(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.operational_sessions%rowtype;
  v_camera record;
  v_definition public.operational_process_definitions%rowtype;
  v_instance public.operational_process_instances%rowtype;
  v_step public.operational_process_steps%rowtype;
  v_match record;
  v_early record;
  v_chapter record;
  v_repeat_session_event_ids uuid[];
  v_repeat_event_ids uuid[];
  v_repeat_max_order integer;
  v_repeat_avg_confidence numeric;
  v_repeat_count integer;
  v_last_order integer := 0;
  v_used_session_event_ids uuid[] := '{}';
  v_evidence_event_ids uuid[] := '{}';
  v_required_total integer := 0;
  v_required_completed integer := 0;
  v_observed_count integer := 0;
  v_unexpected_count integer := 0;
  v_missing_count integer := 0;
  v_out_of_order_count integer := 0;
  v_progress numeric := 0;
  v_average_confidence numeric := 0;
  v_status text;
  v_result_code text;
  v_next_step text;
  v_title text;
  v_summary text;
  v_severity text := 'info';
  v_insight_id uuid;
  v_baseline record;
  v_deviation_count integer := 0;
  v_deviation_id uuid;
  v_now timestamptz := now();
begin
  select * into v_session
  from public.operational_sessions
  where id = p_session_id;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  select
    camera.process_intelligence_enabled,
    camera.process_min_confidence,
    camera.process_stall_minutes,
    camera.process_max_unexpected_steps
  into v_camera
  from public.cameras camera
  where camera.id = v_session.camera_id;

  if coalesce(v_camera.process_intelligence_enabled, false) is false then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'disabled');
  end if;

  select definition.* into v_definition
  from public.operational_process_definitions definition
  where definition.status = 'active'
    and definition.session_type = v_session.session_type
    and (
      definition.source = 'system'
      or (definition.source = 'organization' and definition.organization_id = v_session.organization_id)
      or (definition.source = 'site' and definition.organization_id = v_session.organization_id and definition.site_id = v_session.site_id)
      or (definition.source = 'camera' and definition.organization_id = v_session.organization_id and definition.camera_id = v_session.camera_id)
    )
  order by
    private.process_definition_scope_priority_v1(definition.source),
    definition.version desc
  limit 1;

  if not found then
    return jsonb_build_object('ok', true, 'skipped', true, 'reason', 'no_definition');
  end if;

  insert into public.operational_process_instances (
    organization_id,
    site_id,
    camera_id,
    process_definition_id,
    operational_session_id,
    process_code,
    process_name,
    status,
    result_code,
    started_at,
    last_observed_at,
    ended_at,
    duration_seconds,
    confidence,
    title,
    summary,
    metadata
  ) values (
    v_session.organization_id,
    v_session.site_id,
    v_session.camera_id,
    v_definition.id,
    v_session.id,
    v_definition.process_code,
    v_definition.name,
    'open',
    'in_progress',
    v_session.started_at,
    v_session.last_event_at,
    v_session.ended_at,
    v_session.duration_seconds,
    v_session.confidence,
    v_definition.name,
    v_session.summary,
    jsonb_build_object(
      'definitionVersion', v_definition.version,
      'definitionSource', v_definition.source,
      'sessionType', v_session.session_type
    )
  )
  on conflict (operational_session_id) do update set
    process_definition_id = excluded.process_definition_id,
    process_code = excluded.process_code,
    process_name = excluded.process_name,
    started_at = excluded.started_at,
    last_observed_at = excluded.last_observed_at,
    ended_at = excluded.ended_at,
    duration_seconds = excluded.duration_seconds,
    metadata = excluded.metadata,
    updated_at = now()
  returning * into v_instance;

  delete from public.operational_process_instance_steps
  where process_instance_id = v_instance.id;

  update public.operational_process_deviations set
    status = 'resolved',
    resolved_at = v_now,
    updated_at = v_now
  where process_instance_id = v_instance.id
    and status = 'active';

  for v_step in
    select *
    from public.operational_process_steps
    where process_definition_id = v_definition.id
      and (
        (v_definition.organization_id is null and organization_id is null)
        or organization_id = v_definition.organization_id
      )
    order by sort_order
  loop
    if v_step.required then
      v_required_total := v_required_total + 1;
    end if;

    select
      session_event.id as session_event_id,
      session_event.event_id,
      session_event.chapter_order,
      session_event.chapter_type,
      session_event.confidence,
      event.started_at as observed_at
    into v_match
    from public.operational_session_events session_event
    join public.events event on event.id = session_event.event_id
    where session_event.session_id = v_session.id
      and session_event.chapter_type = any(v_step.accepted_chapter_types)
      and session_event.chapter_order > v_last_order
      and not (session_event.id = any(v_used_session_event_ids))
      and session_event.confidence >= v_step.minimum_confidence
    order by session_event.chapter_order
    limit 1;

    if found then
      insert into public.operational_process_instance_steps (
        organization_id,
        process_instance_id,
        process_step_id,
        operational_session_event_id,
        event_id,
        step_code,
        step_name,
        expected_order,
        observed_order,
        status,
        observed_at,
        confidence,
        evidence_event_ids,
        metadata
      ) values (
        v_session.organization_id,
        v_instance.id,
        v_step.id,
        v_match.session_event_id,
        v_match.event_id,
        v_step.step_code,
        v_step.name,
        v_step.sort_order,
        v_match.chapter_order,
        'observed',
        v_match.observed_at,
        v_match.confidence,
        array[v_match.event_id],
        jsonb_build_object('chapterType', v_match.chapter_type)
      );

      if v_step.repeatable then
        select
          array_agg(session_event.id order by session_event.chapter_order),
          array_agg(session_event.event_id order by session_event.chapter_order),
          max(session_event.chapter_order),
          avg(session_event.confidence),
          count(*)::integer
        into
          v_repeat_session_event_ids,
          v_repeat_event_ids,
          v_repeat_max_order,
          v_repeat_avg_confidence,
          v_repeat_count
        from public.operational_session_events session_event
        where session_event.session_id = v_session.id
          and session_event.chapter_type = any(v_step.accepted_chapter_types)
          and session_event.chapter_order > v_last_order
          and not (session_event.id = any(v_used_session_event_ids))
          and session_event.confidence >= v_step.minimum_confidence;

        update public.operational_process_instance_steps set
          confidence = coalesce(v_repeat_avg_confidence, v_match.confidence),
          evidence_event_ids = coalesce(v_repeat_event_ids, array[v_match.event_id]),
          metadata = metadata || jsonb_build_object(
            'repeatable', true,
            'observationCount', coalesce(v_repeat_count, 1)
          ),
          updated_at = now()
        where process_instance_id = v_instance.id
          and process_step_id = v_step.id;

        v_used_session_event_ids := v_used_session_event_ids || coalesce(
          v_repeat_session_event_ids,
          array[v_match.session_event_id]
        );
        v_evidence_event_ids := v_evidence_event_ids || coalesce(
          v_repeat_event_ids,
          array[v_match.event_id]
        );
        v_last_order := coalesce(v_repeat_max_order, v_match.chapter_order);
      else
        v_used_session_event_ids := array_append(v_used_session_event_ids, v_match.session_event_id);
        v_evidence_event_ids := array_append(v_evidence_event_ids, v_match.event_id);
        v_last_order := v_match.chapter_order;
      end if;

      v_observed_count := v_observed_count + 1;
      if v_step.required then
        v_required_completed := v_required_completed + 1;
      end if;
    else
      select
        session_event.id as session_event_id,
        session_event.event_id,
        session_event.chapter_order,
        session_event.chapter_type,
        session_event.confidence,
        event.started_at as observed_at
      into v_early
      from public.operational_session_events session_event
      join public.events event on event.id = session_event.event_id
      where session_event.session_id = v_session.id
        and session_event.chapter_type = any(v_step.accepted_chapter_types)
        and not (session_event.id = any(v_used_session_event_ids))
        and session_event.confidence >= v_step.minimum_confidence
      order by session_event.chapter_order
      limit 1;

      if found then
        insert into public.operational_process_instance_steps (
          organization_id,
          process_instance_id,
          process_step_id,
          operational_session_event_id,
          event_id,
          step_code,
          step_name,
          expected_order,
          observed_order,
          status,
          observed_at,
          confidence,
          evidence_event_ids,
          metadata
        ) values (
          v_session.organization_id,
          v_instance.id,
          v_step.id,
          v_early.session_event_id,
          v_early.event_id,
          v_step.step_code,
          v_step.name,
          v_step.sort_order,
          v_early.chapter_order,
          'out_of_order',
          v_early.observed_at,
          v_early.confidence,
          array[v_early.event_id],
          jsonb_build_object('chapterType', v_early.chapter_type)
        );

        v_used_session_event_ids := array_append(v_used_session_event_ids, v_early.session_event_id);
        v_evidence_event_ids := array_append(v_evidence_event_ids, v_early.event_id);
        v_observed_count := v_observed_count + 1;
        v_out_of_order_count := v_out_of_order_count + 1;
        if v_step.required then
          v_required_completed := v_required_completed + 1;
        end if;

        v_deviation_id := private.upsert_process_deviation_v1(
          v_instance,
          v_step.id,
          'out_of_order:' || v_step.step_code,
          'out_of_order_step',
          case when v_step.required then 'medium' else 'low' end,
          'Etapa observada fora da sequência',
          format('A etapa "%s" foi observada em ordem diferente da definição do processo.', v_step.name),
          v_early.confidence,
          v_early.observed_at,
          array[v_early.event_id],
          jsonb_build_object(
            'stepCode', v_step.step_code,
            'expectedOrder', v_step.sort_order,
            'observedOrder', v_early.chapter_order
          )
        );
        v_deviation_count := v_deviation_count + 1;
      else
        insert into public.operational_process_instance_steps (
          organization_id,
          process_instance_id,
          process_step_id,
          step_code,
          step_name,
          expected_order,
          status,
          confidence,
          metadata
        ) values (
          v_session.organization_id,
          v_instance.id,
          v_step.id,
          v_step.step_code,
          v_step.name,
          v_step.sort_order,
          case
            when v_session.status = 'open' then 'pending'
            when v_step.required then 'missing'
            else 'skipped'
          end,
          0,
          jsonb_build_object('required', v_step.required)
        );

        if v_session.status <> 'open' and v_step.required then
          v_missing_count := v_missing_count + 1;
          v_deviation_id := private.upsert_process_deviation_v1(
            v_instance,
            v_step.id,
            'missing:' || v_step.step_code,
            'missing_required_step',
            case when v_step.terminal then 'high' else 'medium' end,
            'Etapa obrigatória não confirmada',
            format('Não houve evidência visual suficiente da etapa "%s".', v_step.name),
            greatest(0.35, v_session.confidence),
            coalesce(v_session.ended_at, v_session.last_event_at),
            '{}',
            jsonb_build_object(
              'stepCode', v_step.step_code,
              'required', true,
              'absenceMeans', 'no_visual_confirmation'
            )
          );
          v_deviation_count := v_deviation_count + 1;
        end if;
      end if;
    end if;
  end loop;

  for v_chapter in
    select
      session_event.id as session_event_id,
      session_event.event_id,
      session_event.chapter_order,
      session_event.chapter_type,
      session_event.confidence,
      event.started_at as observed_at
    from public.operational_session_events session_event
    join public.events event on event.id = session_event.event_id
    where session_event.session_id = v_session.id
      and not (session_event.id = any(v_used_session_event_ids))
    order by session_event.chapter_order
  loop
    insert into public.operational_process_instance_steps (
      organization_id,
      process_instance_id,
      process_step_id,
      operational_session_event_id,
      event_id,
      step_code,
      step_name,
      expected_order,
      observed_order,
      status,
      observed_at,
      confidence,
      evidence_event_ids,
      metadata
    ) values (
      v_session.organization_id,
      v_instance.id,
      null,
      v_chapter.session_event_id,
      v_chapter.event_id,
      'unexpected.' || v_chapter.chapter_type,
      'Ação adicional: ' || replace(v_chapter.chapter_type, '_', ' '),
      0,
      v_chapter.chapter_order,
      'unexpected',
      v_chapter.observed_at,
      v_chapter.confidence,
      array[v_chapter.event_id],
      jsonb_build_object('chapterType', v_chapter.chapter_type)
    );

    v_unexpected_count := v_unexpected_count + 1;
    v_evidence_event_ids := array_append(v_evidence_event_ids, v_chapter.event_id);

    if v_unexpected_count <= coalesce(v_camera.process_max_unexpected_steps, 4) then
      v_deviation_id := private.upsert_process_deviation_v1(
        v_instance,
        null,
        'unexpected:' || v_chapter.session_event_id::text,
        'unexpected_step',
        'info',
        'Ação adicional observada',
        format('O capítulo "%s" não correspondeu a uma etapa definida do processo.', v_chapter.chapter_type),
        v_chapter.confidence,
        v_chapter.observed_at,
        array[v_chapter.event_id],
        jsonb_build_object(
          'chapterType', v_chapter.chapter_type,
          'observedOrder', v_chapter.chapter_order
        )
      );
      v_deviation_count := v_deviation_count + 1;
    end if;
  end loop;

  select coalesce(avg(step.confidence), 0)
    into v_average_confidence
  from public.operational_process_instance_steps step
  where step.process_instance_id = v_instance.id
    and step.status in ('observed', 'out_of_order');

  v_progress := case
    when v_required_total = 0 then case when v_observed_count > 0 then 1 else 0 end
    else v_required_completed::numeric / v_required_total::numeric
  end;

  select step.step_code into v_next_step
  from public.operational_process_instance_steps step
  where step.process_instance_id = v_instance.id
    and step.status = 'pending'
  order by step.expected_order
  limit 1;

  if v_session.status = 'open' then
    v_status := 'open';
    v_result_code := 'in_progress';
  elsif v_session.status = 'uncertain' then
    v_status := 'uncertain';
    v_result_code := 'uncertain';
  elsif v_missing_count > 0 then
    v_status := 'incomplete';
    v_result_code := 'required_steps_not_confirmed';
  else
    v_status := 'completed';
    v_result_code := case
      when v_session.outcome_code is not null and v_session.outcome_code <> 'in_progress'
        then v_session.outcome_code
      else 'visually_completed'
    end;
  end if;

  if v_status = 'open'
     and v_now - v_session.last_event_at > make_interval(mins => coalesce(v_camera.process_stall_minutes, 20)) then
    v_deviation_id := private.upsert_process_deviation_v1(
      v_instance,
      null,
      'stalled',
      'stalled',
      'medium',
      'Processo sem novo capítulo',
      format('Nenhum novo capítulo foi observado há mais de %s minutos.', coalesce(v_camera.process_stall_minutes, 20)),
      greatest(0.45, v_session.confidence),
      v_now,
      v_evidence_event_ids,
      jsonb_build_object('stallMinutes', coalesce(v_camera.process_stall_minutes, 20))
    );
    v_deviation_count := v_deviation_count + 1;
  end if;

  select baseline.* into v_baseline
  from public.camera_behavior_baselines baseline
  where baseline.camera_id = v_session.camera_id
    and baseline.baseline_code = 'session_duration_seconds'
    and baseline.session_type = v_session.session_type
    and baseline.status = 'active'
    and baseline.day_of_week = -1
    and baseline.bucket_hour = -1
  order by baseline.confidence desc, baseline.updated_at desc
  limit 1;

  if found and v_session.status <> 'open' then
    if v_session.duration_seconds > v_baseline.upper_value then
      v_deviation_id := private.upsert_process_deviation_v1(
        v_instance,
        null,
        'duration_high',
        'duration_high',
        'medium',
        'Processo mais longo que o habitual',
        format('Duração observada de %s segundos; faixa habitual até %s segundos.', round(v_session.duration_seconds), round(v_baseline.upper_value)),
        least(v_session.confidence, v_baseline.confidence),
        coalesce(v_session.ended_at, v_session.last_event_at),
        v_evidence_event_ids,
        jsonb_build_object(
          'observedSeconds', v_session.duration_seconds,
          'expectedUpperSeconds', v_baseline.upper_value,
          'baselineId', v_baseline.id
        )
      );
      v_deviation_count := v_deviation_count + 1;
    elsif v_session.duration_seconds < v_baseline.lower_value then
      v_deviation_id := private.upsert_process_deviation_v1(
        v_instance,
        null,
        'duration_low',
        'duration_low',
        'low',
        'Processo mais curto que o habitual',
        format('Duração observada de %s segundos; faixa habitual inicia em %s segundos.', round(v_session.duration_seconds), round(v_baseline.lower_value)),
        least(v_session.confidence, v_baseline.confidence),
        coalesce(v_session.ended_at, v_session.last_event_at),
        v_evidence_event_ids,
        jsonb_build_object(
          'observedSeconds', v_session.duration_seconds,
          'expectedLowerSeconds', v_baseline.lower_value,
          'baselineId', v_baseline.id
        )
      );
      v_deviation_count := v_deviation_count + 1;
    end if;
  end if;

  if v_status = 'uncertain' or v_session.confidence < coalesce(v_camera.process_min_confidence, 0.65) then
    v_deviation_id := private.upsert_process_deviation_v1(
      v_instance,
      null,
      'ambiguous_result',
      'ambiguous_result',
      'low',
      'Resultado visual incerto',
      'As evidências disponíveis não permitem confirmar o resultado completo do processo.',
      greatest(0.3, v_session.confidence),
      coalesce(v_session.ended_at, v_session.last_event_at),
      v_evidence_event_ids,
      jsonb_build_object('sessionConfidence', v_session.confidence)
    );
    v_deviation_count := v_deviation_count + 1;
  end if;

  v_title := v_definition.name;
  v_summary := format(
    '%s de %s etapas obrigatórias confirmadas; %s ações adicionais; estado %s.',
    v_required_completed,
    v_required_total,
    v_unexpected_count,
    v_status
  );

  update public.operational_process_instances set
    status = v_status,
    result_code = v_result_code,
    last_observed_at = v_session.last_event_at,
    ended_at = v_session.ended_at,
    duration_seconds = v_session.duration_seconds,
    required_steps_total = v_required_total,
    required_steps_completed = v_required_completed,
    observed_steps_count = v_observed_count,
    unexpected_steps_count = v_unexpected_count,
    progress_ratio = greatest(0, least(1, v_progress)),
    next_expected_step_code = v_next_step,
    confidence = greatest(
      0,
      least(
        1,
        coalesce(v_session.confidence, 0) * 0.45
        + coalesce(v_average_confidence, 0) * 0.30
        + v_progress * 0.25
      )
    ),
    title = v_title,
    summary = v_summary,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'missingRequiredSteps', v_missing_count,
      'outOfOrderSteps', v_out_of_order_count,
      'unexpectedSteps', v_unexpected_count,
      'definitionVersion', v_definition.version,
      'definitionSource', v_definition.source,
      'updatedBy', 'INT-5'
    ),
    updated_at = v_now
  where id = v_instance.id
  returning * into v_instance;

  if exists (
    select 1 from public.operational_process_deviations deviation
    where deviation.process_instance_id = v_instance.id
      and deviation.status = 'active'
      and deviation.severity in ('high', 'critical')
  ) then
    v_severity := 'high';
  elsif exists (
    select 1 from public.operational_process_deviations deviation
    where deviation.process_instance_id = v_instance.id
      and deviation.status = 'active'
      and deviation.severity = 'medium'
  ) then
    v_severity := 'medium';
  elsif v_deviation_count > 0 then
    v_severity := 'low';
  else
    v_severity := 'info';
  end if;

  v_insight_id := private.upsert_process_insight_v1(
    v_instance,
    v_severity,
    jsonb_build_object(
      'processCode', v_instance.process_code,
      'processName', v_instance.process_name,
      'status', v_instance.status,
      'resultCode', v_instance.result_code,
      'progressRatio', v_instance.progress_ratio,
      'requiredStepsTotal', v_instance.required_steps_total,
      'requiredStepsCompleted', v_instance.required_steps_completed,
      'observedStepsCount', v_instance.observed_steps_count,
      'unexpectedStepsCount', v_instance.unexpected_steps_count,
      'nextExpectedStepCode', v_instance.next_expected_step_code,
      'operationalSessionId', v_instance.operational_session_id,
      'deviationCount', v_deviation_count
    ),
    v_evidence_event_ids
  );

  update public.operational_process_instances
  set insight_id = v_insight_id, updated_at = now()
  where id = v_instance.id;

  return jsonb_build_object(
    'ok', true,
    'processInstanceId', v_instance.id,
    'processCode', v_instance.process_code,
    'status', v_instance.status,
    'resultCode', v_instance.result_code,
    'progressRatio', v_instance.progress_ratio,
    'requiredStepsTotal', v_required_total,
    'requiredStepsCompleted', v_required_completed,
    'missingRequiredSteps', v_missing_count,
    'outOfOrderSteps', v_out_of_order_count,
    'unexpectedSteps', v_unexpected_count,
    'deviations', v_deviation_count,
    'insightId', v_insight_id
  );
end;
$$;

create or replace function public.process_operational_process_refresh_queue_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_result jsonb;
begin
  for v_row in
    select queue.operational_session_id
    from public.operational_process_refresh_queue queue
    where queue.next_attempt_at <= now()
      and (queue.locked_at is null or queue.locked_at < now() - interval '10 minutes')
    order by queue.requested_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    update public.operational_process_refresh_queue
    set locked_at = now(), attempt_count = attempt_count + 1
    where operational_session_id = v_row.operational_session_id;

    begin
      v_result := public.refresh_operational_process_for_session_v1(v_row.operational_session_id);
      delete from public.operational_process_refresh_queue
      where operational_session_id = v_row.operational_session_id;
      v_processed := v_processed + 1;
    exception when others then
      update public.operational_process_refresh_queue set
        locked_at = null,
        next_attempt_at = now() + make_interval(mins => least(60, greatest(1, attempt_count * 2))),
        last_error = left(sqlerrm, 1000)
      where operational_session_id = v_row.operational_session_id;
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'processed', v_processed,
    'failed', v_failed,
    'remaining', (
      select count(*)
      from public.operational_process_refresh_queue
      where next_attempt_at <= now()
    )
  );
end;
$$;

create or replace function public.refresh_all_operational_processes_v1(
  p_organization_id uuid default null,
  p_camera_id uuid default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session record;
  v_scanned integer := 0;
  v_written integer := 0;
  v_failed integer := 0;
  v_result jsonb;
begin
  for v_session in
    select session.id
    from public.operational_sessions session
    join public.cameras camera on camera.id = session.camera_id
    where camera.process_intelligence_enabled = true
      and (p_organization_id is null or session.organization_id = p_organization_id)
      and (p_camera_id is null or session.camera_id = p_camera_id)
    order by session.started_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    v_scanned := v_scanned + 1;
    begin
      v_result := public.refresh_operational_process_for_session_v1(v_session.id);
      if coalesce((v_result ->> 'ok')::boolean, false) then
        v_written := v_written + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'sessionsScanned', v_scanned,
    'instancesWritten', v_written,
    'failed', v_failed
  );
end;
$$;


create or replace function public.save_operational_process_definition_v1(
  p_organization_id uuid,
  p_process_code text,
  p_name text,
  p_description text,
  p_session_type text,
  p_scope text default 'organization',
  p_scope_id uuid default null,
  p_strictness text default 'balanced',
  p_steps jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope_key text;
  v_site_id uuid;
  v_camera_id uuid;
  v_version integer;
  v_definition_id uuid;
  v_step jsonb;
  v_order bigint;
  v_chapters text[];
  v_step_code text;
  v_step_name text;
begin
  if not private.has_org_role(
    p_organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then
    raise exception 'organization_admin_required';
  end if;

  if p_process_code is null
     or p_process_code !~ '^[a-z0-9][a-z0-9_.-]{2,79}$' then
    raise exception 'invalid_process_code';
  end if;

  if length(trim(coalesce(p_name, ''))) < 3 then
    raise exception 'invalid_process_name';
  end if;

  if p_session_type not in (
    'customer_service',
    'delivery_or_pickup',
    'visitor_stay',
    'staff_activity',
    'equipment_operation',
    'restricted_area_access',
    'opening_procedure',
    'closing_procedure',
    'other'
  ) then
    raise exception 'invalid_session_type';
  end if;

  if p_scope not in ('organization', 'site', 'camera') then
    raise exception 'invalid_process_scope';
  end if;

  if p_strictness not in ('flexible', 'balanced', 'strict') then
    raise exception 'invalid_process_strictness';
  end if;

  if jsonb_typeof(p_steps) <> 'array'
     or jsonb_array_length(p_steps) < 1
     or jsonb_array_length(p_steps) > 30 then
    raise exception 'invalid_process_steps';
  end if;

  if p_scope = 'organization' then
    if p_scope_id is not null then
      raise exception 'scope_id_not_allowed';
    end if;
    v_scope_key := 'org:' || p_organization_id::text;
  elsif p_scope = 'site' then
    select site.id into v_site_id
    from public.sites site
    where site.id = p_scope_id
      and site.organization_id = p_organization_id;
    if v_site_id is null then
      raise exception 'invalid_site_scope';
    end if;
    v_scope_key := 'site:' || v_site_id::text;
  else
    select camera.id into v_camera_id
    from public.cameras camera
    where camera.id = p_scope_id
      and camera.organization_id = p_organization_id;
    if v_camera_id is null then
      raise exception 'invalid_camera_scope';
    end if;
    v_scope_key := 'camera:' || v_camera_id::text;
  end if;

  select coalesce(max(definition.version), 0) + 1
    into v_version
  from public.operational_process_definitions definition
  where definition.scope_key = v_scope_key
    and definition.process_code = p_process_code;

  update public.operational_process_definitions set
    status = 'archived',
    updated_at = now()
  where scope_key = v_scope_key
    and process_code = p_process_code
    and status in ('active', 'draft', 'paused');

  insert into public.operational_process_definitions (
    organization_id,
    site_id,
    camera_id,
    scope_key,
    process_code,
    version,
    name,
    description,
    session_type,
    source,
    status,
    strictness,
    result_policy,
    created_by,
    metadata
  ) values (
    p_organization_id,
    v_site_id,
    v_camera_id,
    v_scope_key,
    p_process_code,
    v_version,
    trim(p_name),
    trim(coalesce(p_description, '')),
    p_session_type,
    p_scope,
    'active',
    p_strictness,
    'visual_only',
    auth.uid(),
    jsonb_build_object('createdByRpc', 'save_operational_process_definition_v1')
  )
  returning id into v_definition_id;

  for v_step, v_order in
    select value, ordinality
    from jsonb_array_elements(p_steps) with ordinality
  loop
    v_step_code := nullif(trim(v_step ->> 'stepCode'), '');
    v_step_name := nullif(trim(v_step ->> 'name'), '');

    if v_step_code is null
       or v_step_code !~ '^[a-z0-9][a-z0-9_.-]{1,79}$'
       or v_step_name is null then
      raise exception 'invalid_process_step_at_%', v_order;
    end if;

    select coalesce(array_agg(chapter.value), '{}')
      into v_chapters
    from jsonb_array_elements_text(
      coalesce(v_step -> 'acceptedChapterTypes', '[]'::jsonb)
    ) as chapter(value);

    if cardinality(v_chapters) < 1 then
      raise exception 'missing_chapter_types_at_%', v_order;
    end if;

    insert into public.operational_process_steps (
      organization_id,
      process_definition_id,
      step_code,
      name,
      description,
      sort_order,
      required,
      repeatable,
      terminal,
      accepted_chapter_types,
      minimum_confidence,
      maximum_gap_seconds,
      evidence_required,
      metadata
    ) values (
      p_organization_id,
      v_definition_id,
      v_step_code,
      v_step_name,
      trim(coalesce(v_step ->> 'description', '')),
      v_order::integer,
      coalesce((v_step ->> 'required')::boolean, true),
      coalesce((v_step ->> 'repeatable')::boolean, false),
      coalesce((v_step ->> 'terminal')::boolean, false),
      v_chapters,
      greatest(0, least(1, coalesce((v_step ->> 'minimumConfidence')::numeric, 0.5))),
      case
        when nullif(v_step ->> 'maximumGapSeconds', '') is null then null
        else greatest(1, least(86400, (v_step ->> 'maximumGapSeconds')::integer))
      end,
      coalesce((v_step ->> 'evidenceRequired')::boolean, true),
      jsonb_build_object('configuredByUser', true)
    );
  end loop;

  insert into public.operational_process_refresh_queue (
    operational_session_id,
    organization_id,
    camera_id,
    reason
  )
  select
    session.id,
    session.organization_id,
    session.camera_id,
    'definition_changed'
  from public.operational_sessions session
  where session.organization_id = p_organization_id
    and session.session_type = p_session_type
    and (v_site_id is null or session.site_id = v_site_id)
    and (v_camera_id is null or session.camera_id = v_camera_id)
  on conflict (operational_session_id) do update set
    reason = excluded.reason,
    requested_at = now(),
    next_attempt_at = now(),
    locked_at = null,
    last_error = null;

  return jsonb_build_object(
    'ok', true,
    'processDefinitionId', v_definition_id,
    'processCode', p_process_code,
    'version', v_version,
    'scope', p_scope,
    'scopeKey', v_scope_key,
    'stepCount', jsonb_array_length(p_steps)
  );
end;
$$;

create or replace function public.assistant_operational_process_summary_v1(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_summary jsonb;
  v_instances jsonb;
  v_deviations jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  select jsonb_build_object(
    'total', count(*),
    'completed', count(*) filter (where instance.status = 'completed'),
    'incomplete', count(*) filter (where instance.status = 'incomplete'),
    'open', count(*) filter (where instance.status = 'open'),
    'uncertain', count(*) filter (where instance.status = 'uncertain'),
    'averageProgress', coalesce(round(avg(instance.progress_ratio)::numeric, 4), 0),
    'averageConfidence', coalesce(round(avg(instance.confidence)::numeric, 4), 0),
    'byProcess', coalesce((
      select jsonb_object_agg(grouped.process_code, grouped.total)
      from (
        select item.process_code, count(*) as total
        from public.operational_process_instances item
        where item.organization_id = p_organization_id
          and item.started_at >= p_from
          and item.started_at < p_to
          and (p_camera_id is null or item.camera_id = p_camera_id)
          and (p_site_id is null or item.site_id = p_site_id)
        group by item.process_code
      ) grouped
    ), '{}'::jsonb)
  ) into v_summary
  from public.operational_process_instances instance
  where instance.organization_id = p_organization_id
    and instance.started_at >= p_from
    and instance.started_at < p_to
    and (p_camera_id is null or instance.camera_id = p_camera_id)
    and (p_site_id is null or instance.site_id = p_site_id);

  select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.started_at desc), '[]'::jsonb)
  into v_instances
  from (
    select
      instance.id,
      instance.camera_id,
      camera.name as camera_name,
      instance.operational_session_id,
      instance.process_code,
      instance.process_name,
      instance.status,
      instance.result_code,
      instance.started_at,
      instance.ended_at,
      instance.duration_seconds,
      instance.required_steps_total,
      instance.required_steps_completed,
      instance.progress_ratio,
      instance.next_expected_step_code,
      instance.confidence,
      instance.summary,
      coalesce((
        select array_agg(distinct evidence_id)
        from public.operational_process_instance_steps process_step
        cross join lateral unnest(process_step.evidence_event_ids) evidence_id
        where process_step.process_instance_id = instance.id
      ), '{}'::uuid[]) as evidence_event_ids
    from public.operational_process_instances instance
    join public.cameras camera on camera.id = instance.camera_id
    where instance.organization_id = p_organization_id
      and instance.started_at >= p_from
      and instance.started_at < p_to
      and (p_camera_id is null or instance.camera_id = p_camera_id)
      and (p_site_id is null or instance.site_id = p_site_id)
    order by instance.started_at desc
    limit 100
  ) row_value;

  select coalesce(jsonb_agg(to_jsonb(row_value) order by row_value.observed_at desc), '[]'::jsonb)
  into v_deviations
  from (
    select
      deviation.id,
      deviation.camera_id,
      deviation.process_instance_id,
      deviation.deviation_code,
      deviation.status,
      deviation.severity,
      deviation.title,
      deviation.summary,
      deviation.confidence,
      deviation.observed_at,
      deviation.evidence_event_ids,
      deviation.data
    from public.operational_process_deviations deviation
    where deviation.organization_id = p_organization_id
      and deviation.observed_at >= p_from
      and deviation.observed_at < p_to
      and (p_camera_id is null or deviation.camera_id = p_camera_id)
      and (
        p_site_id is null
        or exists (
          select 1
          from public.operational_process_instances instance
          where instance.id = deviation.process_instance_id
            and instance.site_id = p_site_id
        )
      )
    order by deviation.observed_at desc
    limit 100
  ) row_value;

  return jsonb_build_object(
    'summary', coalesce(v_summary, '{}'::jsonb),
    'instances', v_instances,
    'deviations', v_deviations,
    'definitions', jsonb_build_object(
      'process', 'Sequência de etapas visuais observáveis associadas a uma sessão operacional.',
      'missing', 'Ausência de confirmação visual não prova que a etapa não aconteceu.',
      'outOfOrder', 'Ordem visual diferente da definição; não confirma falha humana ou intenção.',
      'unexpected', 'Ação adicional sem etapa correspondente na definição ativa.'
    )
  );
end;
$$;

-- Atualiza o registro de capacidades sem alterar o toolset MCP público.
insert into public.monitoria_capability_registry(
  module, status, introduced_phase, description
)
values (
  'processes',
  'available',
  '5',
  'Processos operacionais, etapas observadas e desvios de sequência'
)
on conflict (module) do update set
  status = excluded.status,
  introduced_phase = excluded.introduced_phase,
  description = excluded.description,
  updated_at = now();

-- Realtime para a nova página.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_process_instances'
  ) then
    alter publication supabase_realtime add table public.operational_process_instances;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_process_deviations'
  ) then
    alter publication supabase_realtime add table public.operational_process_deviations;
  end if;
end
$$;

-- Backfill assíncrono: apenas enfileira; não executa processamento pesado na migration.
insert into public.operational_process_refresh_queue (
  operational_session_id,
  organization_id,
  camera_id,
  reason
)
select
  session.id,
  session.organization_id,
  session.camera_id,
  'initial_backfill'
from public.operational_sessions session
join public.cameras camera on camera.id = session.camera_id
where camera.process_intelligence_enabled = true
on conflict (operational_session_id) do nothing;

revoke all on function public.refresh_operational_process_for_session_v1(uuid) from public, anon, authenticated;
revoke all on function public.process_operational_process_refresh_queue_v1(integer) from public, anon, authenticated;
revoke all on function public.refresh_all_operational_processes_v1(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.refresh_operational_process_for_session_v1(uuid) to service_role;
grant execute on function public.process_operational_process_refresh_queue_v1(integer) to service_role;
grant execute on function public.refresh_all_operational_processes_v1(uuid, uuid, integer) to service_role;

revoke all on function public.save_operational_process_definition_v1(uuid, text, text, text, text, text, uuid, text, jsonb) from public, anon, monitoria_mcp_readonly;
grant execute on function public.save_operational_process_definition_v1(uuid, text, text, text, text, text, uuid, text, jsonb) to authenticated, service_role;

revoke all on function public.assistant_operational_process_summary_v1(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.assistant_operational_process_summary_v1(uuid, timestamptz, timestamptz, uuid, uuid) to authenticated, service_role;

-- Políticas explícitas para o papel MCP somente leitura.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    execute 'drop policy if exists operational_process_definitions_mcp_select on public.operational_process_definitions';
    execute 'create policy operational_process_definitions_mcp_select on public.operational_process_definitions for select to monitoria_mcp_readonly using (organization_id is null or private.mcp_org_granted(organization_id))';

    execute 'drop policy if exists operational_process_steps_mcp_select on public.operational_process_steps';
    execute 'create policy operational_process_steps_mcp_select on public.operational_process_steps for select to monitoria_mcp_readonly using (organization_id is null or private.mcp_org_granted(organization_id))';

    execute 'drop policy if exists operational_process_instances_mcp_select on public.operational_process_instances';
    execute 'create policy operational_process_instances_mcp_select on public.operational_process_instances for select to monitoria_mcp_readonly using (private.mcp_org_granted(organization_id))';

    execute 'drop policy if exists operational_process_instance_steps_mcp_select on public.operational_process_instance_steps';
    execute 'create policy operational_process_instance_steps_mcp_select on public.operational_process_instance_steps for select to monitoria_mcp_readonly using (private.mcp_org_granted(organization_id))';

    execute 'drop policy if exists operational_process_deviations_mcp_select on public.operational_process_deviations';
    execute 'create policy operational_process_deviations_mcp_select on public.operational_process_deviations for select to monitoria_mcp_readonly using (private.mcp_org_granted(organization_id))';
  end if;
end
$$;

-- Leitura para o papel MCP dedicado criado na INT-3.8.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    grant select on
      public.operational_process_definitions,
      public.operational_process_steps,
      public.operational_process_instances,
      public.operational_process_instance_steps,
      public.operational_process_deviations
    to monitoria_mcp_readonly;

    grant execute on function public.assistant_operational_process_summary_v1(uuid, timestamptz, timestamptz, uuid, uuid)
      to monitoria_mcp_readonly;
  end if;
end
$$;

commit;
