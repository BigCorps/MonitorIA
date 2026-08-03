-- MonitorIA — Fase 3
-- Sessões e capítulos operacionais.
-- Requer a Fase 1 (estados visuais) e a Fase 2 (memória curta) aplicadas.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'events'
      and column_name = 'interaction_group_id'
  ) then
    raise exception 'monitoria_etapa_2_required';
  end if;
end
$$;

alter table public.cameras
  add column if not exists operational_sessions_enabled boolean not null default false,
  add column if not exists session_idle_close_minutes integer not null default 12,
  add column if not exists session_max_duration_minutes integer not null default 240,
  add column if not exists session_min_confidence numeric(4,3) not null default 0.650;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_session_idle_close_check'
  ) then
    alter table public.cameras
      add constraint cameras_session_idle_close_check
      check (session_idle_close_minutes between 2 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_session_max_duration_check'
  ) then
    alter table public.cameras
      add constraint cameras_session_max_duration_check
      check (session_max_duration_minutes between 5 and 1440);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_session_min_confidence_check'
  ) then
    alter table public.cameras
      add constraint cameras_session_min_confidence_check
      check (session_min_confidence between 0.4 and 1);
  end if;
end
$$;

comment on column public.cameras.operational_sessions_enabled is
  'Ativa a consolidação de grupos de continuidade em sessões operacionais com capítulos e resultado visual.';

create table if not exists public.operational_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  session_type text not null,
  status text not null default 'open',
  closure_reason text null,
  started_at timestamptz not null,
  last_event_at timestamptz not null,
  ended_at timestamptz null,
  duration_seconds numeric not null default 0,
  title text not null default '',
  summary text not null default '',
  chapter_count integer not null default 0,
  probable_people_count integer not null default 0,
  probable_customer_count integer not null default 0,
  probable_staff_count integer not null default 0,
  confidence numeric(5,4) not null default 0,
  outcome_code text not null default 'in_progress',
  outcome_confidence numeric(5,4) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_sessions_type_check check (
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
  constraint operational_sessions_status_check check (
    status in ('open', 'completed', 'closed_by_inactivity', 'uncertain')
  ),
  constraint operational_sessions_confidence_check check (
    confidence between 0 and 1
    and outcome_confidence between 0 and 1
  ),
  constraint operational_sessions_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint operational_sessions_time_check check (
    last_event_at >= started_at
    and (ended_at is null or ended_at >= started_at)
    and duration_seconds >= 0
  )
);

create index if not exists operational_sessions_camera_time_idx
  on public.operational_sessions(camera_id, started_at desc);

create index if not exists operational_sessions_org_time_idx
  on public.operational_sessions(organization_id, started_at desc);

create index if not exists operational_sessions_status_idx
  on public.operational_sessions(camera_id, status, last_event_at desc);

create table if not exists public.operational_session_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.operational_sessions(id) on delete cascade,
  interaction_group_id uuid not null references public.interaction_groups(id) on delete cascade,
  linked_at timestamptz not null default now(),
  link_confidence numeric(5,4) not null default 0,
  reasons jsonb not null default '{}'::jsonb,
  constraint operational_session_groups_confidence_check check (
    link_confidence between 0 and 1
  ),
  constraint operational_session_groups_reasons_check check (
    jsonb_typeof(reasons) = 'object'
  )
);

create unique index if not exists operational_session_groups_group_uidx
  on public.operational_session_groups(interaction_group_id);

create index if not exists operational_session_groups_session_idx
  on public.operational_session_groups(session_id, linked_at);

create table if not exists public.operational_session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.operational_sessions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  interaction_group_id uuid not null references public.interaction_groups(id) on delete cascade,
  chapter_order integer not null,
  chapter_type text not null,
  is_key_chapter boolean not null default false,
  confidence numeric(5,4) not null default 0,
  signal_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_session_events_chapter_check check (
    chapter_type in (
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
    )
  ),
  constraint operational_session_events_confidence_check check (
    confidence between 0 and 1
  ),
  constraint operational_session_events_signal_check check (
    jsonb_typeof(signal_summary) = 'object'
  ),
  constraint operational_session_events_order_check check (
    chapter_order >= 1
  )
);

create unique index if not exists operational_session_events_event_uidx
  on public.operational_session_events(event_id);

create unique index if not exists operational_session_events_order_uidx
  on public.operational_session_events(session_id, chapter_order);

create index if not exists operational_session_events_session_idx
  on public.operational_session_events(session_id, chapter_order);

create table if not exists public.operational_session_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.operational_sessions(id) on delete cascade,
  person_instance_id uuid not null references public.person_memory_instances(id) on delete cascade,
  staff_profile_id uuid null references public.camera_staff_profiles(id) on delete set null,
  participant_role text not null default 'unknown',
  first_event_id uuid not null references public.events(id) on delete cascade,
  last_event_id uuid not null references public.events(id) on delete cascade,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  confidence numeric(5,4) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_session_participants_role_check check (
    participant_role in ('staff', 'customer', 'delivery_person', 'visitor', 'unknown')
  ),
  constraint operational_session_participants_confidence_check check (
    confidence between 0 and 1
  ),
  constraint operational_session_participants_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint operational_session_participants_time_check check (
    last_seen_at >= first_seen_at
  )
);

create unique index if not exists operational_session_participants_instance_uidx
  on public.operational_session_participants(session_id, person_instance_id);

create index if not exists operational_session_participants_session_idx
  on public.operational_session_participants(session_id, participant_role);

create table if not exists public.operational_session_outcomes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  session_id uuid not null references public.operational_sessions(id) on delete cascade,
  outcome_code text not null,
  description text not null,
  confidence numeric(5,4) not null default 0,
  evidence_event_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_session_outcomes_confidence_check check (
    confidence between 0 and 1
  ),
  constraint operational_session_outcomes_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists operational_session_outcomes_code_uidx
  on public.operational_session_outcomes(session_id, outcome_code);

alter table public.interaction_groups
  add column if not exists operational_session_id uuid null;

alter table public.events
  add column if not exists operational_session_id uuid null,
  add column if not exists session_type text null,
  add column if not exists session_status text null,
  add column if not exists session_chapter_type text null,
  add column if not exists session_chapter_order integer null,
  add column if not exists session_chapter_count integer not null default 0,
  add column if not exists session_duration_seconds numeric not null default 0,
  add column if not exists session_confidence numeric(5,4) not null default 0,
  add column if not exists session_summary jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'interaction_groups_operational_session_id_fkey'
  ) then
    alter table public.interaction_groups
      add constraint interaction_groups_operational_session_id_fkey
      foreign key (operational_session_id)
      references public.operational_sessions(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_operational_session_id_fkey'
  ) then
    alter table public.events
      add constraint events_operational_session_id_fkey
      foreign key (operational_session_id)
      references public.operational_sessions(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_session_confidence_check'
  ) then
    alter table public.events
      add constraint events_session_confidence_check
      check (session_confidence between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_session_summary_check'
  ) then
    alter table public.events
      add constraint events_session_summary_check
      check (jsonb_typeof(session_summary) = 'object');
  end if;
end
$$;

create index if not exists events_operational_session_idx
  on public.events(operational_session_id, started_at)
  where operational_session_id is not null;

alter table public.operational_sessions enable row level security;
alter table public.operational_session_groups enable row level security;
alter table public.operational_session_events enable row level security;
alter table public.operational_session_participants enable row level security;
alter table public.operational_session_outcomes enable row level security;

drop policy if exists operational_sessions_select on public.operational_sessions;
create policy operational_sessions_select
on public.operational_sessions
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_session_groups_select on public.operational_session_groups;
create policy operational_session_groups_select
on public.operational_session_groups
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_session_events_select on public.operational_session_events;
create policy operational_session_events_select
on public.operational_session_events
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_session_participants_select on public.operational_session_participants;
create policy operational_session_participants_select
on public.operational_session_participants
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists operational_session_outcomes_select on public.operational_session_outcomes;
create policy operational_session_outcomes_select
on public.operational_session_outcomes
for select
to authenticated
using (private.is_org_member(organization_id));

grant select on public.operational_sessions to authenticated;
grant select on public.operational_session_groups to authenticated;
grant select on public.operational_session_events to authenticated;
grant select on public.operational_session_participants to authenticated;
grant select on public.operational_session_outcomes to authenticated;

grant all on public.operational_sessions to service_role;
grant all on public.operational_session_groups to service_role;
grant all on public.operational_session_events to service_role;
grant all on public.operational_session_participants to service_role;
grant all on public.operational_session_outcomes to service_role;

create or replace function private.monitoria_session_type_rank(
  p_session_type text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_session_type
    when 'opening_procedure' then 90
    when 'closing_procedure' then 90
    when 'restricted_area_access' then 80
    when 'delivery_or_pickup' then 70
    when 'customer_service' then 60
    when 'equipment_operation' then 50
    when 'visitor_stay' then 40
    when 'staff_activity' then 30
    else 10
  end;
$$;

create or replace function public.process_operational_session_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_group public.interaction_groups%rowtype;
  v_camera public.cameras%rowtype;
  v_session public.operational_sessions%rowtype;
  v_session_id uuid;
  v_signals jsonb := '[]'::jsonb;
  v_session_type text := 'other';
  v_chapter_type text := 'other';
  v_chapter_order integer := 1;
  v_is_key boolean := false;
  v_signal_confidence numeric := 0;
  v_confidence numeric := 0;
  v_status text := 'open';
  v_closure_reason text := null;
  v_outcome_code text := 'in_progress';
  v_outcome_description text := 'Sessão em andamento.';
  v_outcome_confidence numeric := 0;
  v_title text := 'Atividade observada';
  v_summary text := '';
  v_chapter_count integer := 0;
  v_people_count integer := 0;
  v_customer_count integer := 0;
  v_staff_count integer := 0;
  v_duration_seconds numeric := 0;
  v_arrival boolean := false;
  v_waiting boolean := false;
  v_service_started boolean := false;
  v_service_continued boolean := false;
  v_terminal boolean := false;
  v_object_to_staff boolean := false;
  v_object_to_customer boolean := false;
  v_departure boolean := false;
  v_customer_departure boolean := false;
  v_opening_step boolean := false;
  v_closing_step boolean := false;
  v_equipment_signal boolean := false;
  v_restricted_signal boolean := false;
  v_state_signal boolean := false;
  v_open_transition boolean := false;
  v_close_transition boolean := false;
  v_equipment_observation boolean := false;
  v_group_linked boolean := false;
  v_has_customer boolean := false;
  v_has_staff boolean := false;
  v_max_duration_reached boolean := false;
begin
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found';
  end if;

  if v_event.interaction_group_id is null then
    return jsonb_build_object(
      'enabled', false,
      'reason', 'interaction_group_missing',
      'eventId', v_event.id
    );
  end if;

  select * into v_group
  from public.interaction_groups
  where id = v_event.interaction_group_id;

  if not found then
    raise exception 'interaction_group_not_found';
  end if;

  select * into v_camera
  from public.cameras
  where id = v_event.camera_id;

  if not found then
    raise exception 'camera_not_found';
  end if;

  if not v_camera.operational_sessions_enabled then
    return jsonb_build_object(
      'enabled', false,
      'reason', 'camera_disabled',
      'eventId', v_event.id
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event.camera_id::text || ':operational-session', 0)
  );

  update public.operational_sessions stale
  set status = 'closed_by_inactivity',
      closure_reason = 'inactivity',
      ended_at = stale.last_event_at,
      duration_seconds = greatest(
        0,
        pg_catalog.date_part(
          'epoch',
          stale.last_event_at - stale.started_at
        )
      ),
      outcome_code = case
        when stale.outcome_code = 'in_progress'
          then 'no_visible_outcome'
        else stale.outcome_code
      end,
      outcome_confidence = greatest(stale.outcome_confidence, 0.55),
      updated_at = now()
  where stale.camera_id = v_event.camera_id
    and stale.status = 'open'
    and stale.last_event_at < v_event.started_at
      - pg_catalog.make_interval(
          mins => greatest(2, v_camera.session_idle_close_minutes)
        );

  update public.events event_row
  set session_status = session_row.status,
      session_duration_seconds = session_row.duration_seconds,
      session_summary = event_row.session_summary
        || jsonb_build_object(
          'status', session_row.status,
          'closureReason', session_row.closure_reason,
          'durationSeconds', session_row.duration_seconds,
          'outcomeCode', session_row.outcome_code
        ),
      updated_at = now()
  from public.operational_sessions session_row
  where event_row.operational_session_id = session_row.id
    and session_row.camera_id = v_event.camera_id
    and session_row.status <> 'open'
    and event_row.session_status is distinct from session_row.status;

  v_signals := case
    when jsonb_typeof(v_event.analyzed_payload->'sessionSignals') = 'array'
      then v_event.analyzed_payload->'sessionSignals'
    else '[]'::jsonb
  end;

  select
    coalesce(bool_or(signal->>'type' = 'arrival'), false),
    coalesce(bool_or(signal->>'type' = 'waiting'), false),
    coalesce(bool_or(signal->>'type' = 'service_started'), false),
    coalesce(bool_or(signal->>'type' = 'service_continued'), false),
    coalesce(bool_or(signal->>'type' = 'terminal_activity'), false),
    coalesce(bool_or(signal->>'type' = 'object_handoff_to_staff'), false),
    coalesce(bool_or(signal->>'type' = 'object_handoff_to_customer'), false),
    coalesce(bool_or(signal->>'type' = 'departure'), false),
    coalesce(bool_or(
      signal->>'type' = 'departure'
      and signal->>'actorRole' in ('customer', 'delivery_person', 'visitor')
    ), false),
    coalesce(bool_or(signal->>'type' = 'opening_step'), false),
    coalesce(bool_or(signal->>'type' = 'closing_step'), false),
    coalesce(bool_or(signal->>'type' = 'equipment_activity'), false),
    coalesce(bool_or(signal->>'type' = 'restricted_access'), false),
    coalesce(bool_or(signal->>'type' = 'state_change'), false),
    coalesce(max(
      case
        when coalesce(signal->>'confidence', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (signal->>'confidence')::numeric
        else 0
      end
    ), 0)
  into
    v_arrival,
    v_waiting,
    v_service_started,
    v_service_continued,
    v_terminal,
    v_object_to_staff,
    v_object_to_customer,
    v_departure,
    v_customer_departure,
    v_opening_step,
    v_closing_step,
    v_equipment_signal,
    v_restricted_signal,
    v_state_signal,
    v_signal_confidence
  from jsonb_array_elements(v_signals) as item(signal);

  select exists (
    select 1
    from public.visual_state_transitions transition
    join public.camera_visual_entities entity
      on entity.id = transition.entity_id
    where transition.event_id = v_event.id
      and entity.primary_operational_marker
      and transition.to_state in ('opening', 'open')
  ) into v_open_transition;

  select exists (
    select 1
    from public.visual_state_transitions transition
    join public.camera_visual_entities entity
      on entity.id = transition.entity_id
    where transition.event_id = v_event.id
      and entity.primary_operational_marker
      and transition.to_state in ('closing', 'closed')
  ) into v_close_transition;

  select exists (
    select 1
    from public.visual_state_observations observation
    join public.camera_visual_entities entity
      on entity.id = observation.entity_id
    where observation.event_id = v_event.id
      and entity.entity_type = 'equipment'
      and observation.observed_state in ('on', 'in_use', 'idle', 'stopped', 'off')
  ) into v_equipment_observation;

  select exists (
    select 1
    from public.event_person_memory_links link
    join public.person_memory_instances instance
      on instance.id = link.person_instance_id
    where link.event_id = v_event.id
      and instance.probable_role in ('customer', 'delivery_person', 'visitor')
  ) into v_has_customer;

  select exists (
    select 1
    from public.event_person_memory_links link
    join public.person_memory_instances instance
      on instance.id = link.person_instance_id
    where link.event_id = v_event.id
      and (
        instance.staff_profile_id is not null
        or instance.probable_role = 'staff'
      )
  ) into v_has_staff;

  if v_open_transition or v_opening_step then
    v_session_type := 'opening_procedure';
  elsif v_close_transition or v_closing_step then
    v_session_type := 'closing_procedure';
  elsif v_restricted_signal or v_event.primary_event_type = 'zone_intrusion' then
    v_session_type := 'restricted_area_access';
  elsif v_object_to_staff or v_object_to_customer then
    v_session_type := 'delivery_or_pickup';
  elsif (v_equipment_signal or v_equipment_observation)
        and v_group.kind not in ('service', 'visit') then
    v_session_type := 'equipment_operation';
  elsif v_group.kind = 'service' then
    v_session_type := 'customer_service';
  elsif v_group.kind = 'visit' then
    v_session_type := 'visitor_stay';
  elsif v_group.kind = 'staff_presence' then
    v_session_type := 'staff_activity';
  else
    v_session_type := 'other';
  end if;

  if v_open_transition or v_opening_step then
    v_chapter_type := 'opening_step';
    v_is_key := true;
  elsif v_close_transition or v_closing_step then
    v_chapter_type := 'closing_step';
    v_is_key := true;
  elsif v_object_to_staff or v_object_to_customer then
    v_chapter_type := 'object_handoff';
    v_is_key := true;
  elsif v_customer_departure or v_departure then
    v_chapter_type := 'departure';
    v_is_key := true;
  elsif v_arrival then
    v_chapter_type := 'arrival';
    v_is_key := true;
  elsif v_waiting then
    v_chapter_type := 'waiting';
  elsif v_service_started then
    v_chapter_type := 'service_started';
    v_is_key := true;
  elsif v_terminal then
    v_chapter_type := 'terminal_activity';
  elsif v_service_continued then
    v_chapter_type := 'service_continued';
  elsif v_equipment_signal or v_equipment_observation then
    v_chapter_type := 'equipment_activity';
  elsif v_restricted_signal or v_event.primary_event_type = 'zone_intrusion' then
    v_chapter_type := 'restricted_access';
    v_is_key := true;
  elsif v_state_signal or jsonb_array_length(
          coalesce(v_event.analyzed_payload->'stateObservations', '[]'::jsonb)
        ) > 0 then
    v_chapter_type := 'state_change';
  elsif v_event.primary_event_type in ('person_present', 'vehicle_present') then
    v_chapter_type := 'presence';
  else
    v_chapter_type := 'other';
  end if;

  select session_row.*
    into v_session
  from public.operational_session_groups group_link
  join public.operational_sessions session_row
    on session_row.id = group_link.session_id
  where group_link.interaction_group_id = v_group.id
  limit 1;

  if found then
    v_session_id := v_session.id;
    v_group_linked := true;
  else
    if v_group.primary_customer_instance_id is not null then
      select session_row.*
        into v_session
      from public.operational_sessions session_row
      where session_row.camera_id = v_event.camera_id
        and session_row.status = 'open'
        and session_row.last_event_at >= v_event.started_at
          - pg_catalog.make_interval(
              mins => greatest(2, v_camera.session_idle_close_minutes)
            )
        and exists (
          select 1
          from public.operational_session_participants participant
          where participant.session_id = session_row.id
            and participant.person_instance_id = v_group.primary_customer_instance_id
        )
      order by session_row.last_event_at desc
      limit 1;
    end if;

    if found then
      v_session_id := v_session.id;
    else
      insert into public.operational_sessions (
        organization_id,
        site_id,
        camera_id,
        session_type,
        status,
        started_at,
        last_event_at,
        duration_seconds,
        title,
        summary,
        confidence,
        metadata
      ) values (
        v_event.organization_id,
        v_event.site_id,
        v_event.camera_id,
        v_session_type,
        'open',
        v_event.started_at,
        v_event.ended_at,
        greatest(
          0,
          pg_catalog.date_part('epoch', v_event.ended_at - v_event.started_at)
        ),
        'Atividade observada',
        'Sessão iniciada a partir da continuidade entre eventos.',
        greatest(v_camera.session_min_confidence, v_event.continuity_confidence),
        jsonb_build_object(
          'method', 'deterministic_session_reconstruction_v1',
          'firstEventId', v_event.id,
          'privacy', 'temporary_non_biometric_context'
        )
      )
      returning * into v_session;

      v_session_id := v_session.id;
    end if;

    insert into public.operational_session_groups (
      organization_id,
      session_id,
      interaction_group_id,
      link_confidence,
      reasons
    ) values (
      v_event.organization_id,
      v_session_id,
      v_group.id,
      greatest(v_group.confidence, v_event.continuity_confidence),
      jsonb_build_object(
        'primaryCustomerInstanceId', v_group.primary_customer_instance_id,
        'groupKind', v_group.kind
      )
    )
    on conflict (interaction_group_id) do update
    set session_id = excluded.session_id,
        link_confidence = greatest(
          public.operational_session_groups.link_confidence,
          excluded.link_confidence
        ),
        reasons = excluded.reasons;
  end if;

  select * into v_session
  from public.operational_sessions
  where id = v_session_id
  for update;

  v_status := v_session.status;
  v_closure_reason := v_session.closure_reason;
  v_outcome_code := coalesce(nullif(v_session.outcome_code, ''), 'in_progress');
  v_outcome_confidence := coalesce(v_session.outcome_confidence, 0);

  if private.monitoria_session_type_rank(v_session_type)
     > private.monitoria_session_type_rank(v_session.session_type) then
    v_session.session_type := v_session_type;
  end if;

  select coalesce(max(chapter_order), 0) + 1
    into v_chapter_order
  from public.operational_session_events
  where session_id = v_session_id;

  insert into public.operational_session_events (
    organization_id,
    session_id,
    event_id,
    interaction_group_id,
    chapter_order,
    chapter_type,
    is_key_chapter,
    confidence,
    signal_summary
  ) values (
    v_event.organization_id,
    v_session_id,
    v_event.id,
    v_group.id,
    v_chapter_order,
    v_chapter_type,
    v_is_key,
    greatest(
      v_camera.session_min_confidence,
      v_event.continuity_confidence,
      v_signal_confidence,
      v_event.confidence
    ),
    jsonb_build_object(
      'signals', v_signals,
      'primaryEventType', v_event.primary_event_type,
      'headline', v_event.headline,
      'openTransition', v_open_transition,
      'closeTransition', v_close_transition,
      'equipmentObservation', v_equipment_observation
    )
  )
  on conflict (event_id) do update
  set session_id = excluded.session_id,
      interaction_group_id = excluded.interaction_group_id,
      chapter_type = excluded.chapter_type,
      is_key_chapter = excluded.is_key_chapter,
      confidence = excluded.confidence,
      signal_summary = excluded.signal_summary
  returning chapter_order into v_chapter_order;

  insert into public.operational_session_participants (
    organization_id,
    session_id,
    person_instance_id,
    staff_profile_id,
    participant_role,
    first_event_id,
    last_event_id,
    first_seen_at,
    last_seen_at,
    confidence,
    metadata
  )
  select distinct
    v_event.organization_id,
    v_session_id,
    instance.id,
    instance.staff_profile_id,
    case
      when instance.staff_profile_id is not null then 'staff'
      else instance.probable_role
    end,
    v_event.id,
    v_event.id,
    v_event.started_at,
    v_event.ended_at,
    greatest(link.continuity_score, instance.appearance_confidence),
    jsonb_build_object(
      'source', 'short_memory_v1',
      'linkKind', link.link_kind
    )
  from public.event_person_memory_links link
  join public.person_memory_instances instance
    on instance.id = link.person_instance_id
  where link.event_id = v_event.id
  on conflict (session_id, person_instance_id) do update
  set staff_profile_id = coalesce(
        public.operational_session_participants.staff_profile_id,
        excluded.staff_profile_id
      ),
      participant_role = case
        when excluded.staff_profile_id is not null then 'staff'
        when public.operational_session_participants.participant_role = 'unknown'
          then excluded.participant_role
        else public.operational_session_participants.participant_role
      end,
      last_event_id = excluded.last_event_id,
      last_seen_at = greatest(
        public.operational_session_participants.last_seen_at,
        excluded.last_seen_at
      ),
      confidence = greatest(
        public.operational_session_participants.confidence,
        excluded.confidence
      ),
      updated_at = now();

  select count(*)::integer,
         count(*) filter (
           where participant_role in ('customer', 'delivery_person', 'visitor')
         )::integer,
         count(*) filter (
           where participant_role = 'staff'
         )::integer
    into v_people_count, v_customer_count, v_staff_count
  from public.operational_session_participants
  where session_id = v_session_id;

  select count(*)::integer,
         coalesce(avg(confidence), 0)
    into v_chapter_count, v_confidence
  from public.operational_session_events
  where session_id = v_session_id;

  v_duration_seconds := greatest(
    0,
    pg_catalog.date_part(
      'epoch',
      greatest(v_session.last_event_at, v_event.ended_at) - v_session.started_at
    )
  );

  v_max_duration_reached :=
    v_duration_seconds >= greatest(5, v_camera.session_max_duration_minutes) * 60;

  if v_open_transition and v_session.session_type = 'opening_procedure' then
    v_status := 'completed';
    v_closure_reason := 'operating_state_confirmed';
    v_outcome_code := 'establishment_opened';
    v_outcome_description := 'A abertura visual do estabelecimento foi confirmada.';
    v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
  elsif v_close_transition and v_session.session_type = 'closing_procedure' then
    v_status := 'completed';
    v_closure_reason := 'operating_state_confirmed';
    v_outcome_code := 'establishment_closed';
    v_outcome_description := 'O fechamento visual do estabelecimento foi confirmado.';
    v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
  elsif v_customer_departure
        and v_session.session_type in (
          'customer_service',
          'delivery_or_pickup',
          'visitor_stay'
        ) then
    v_status := 'completed';
    v_closure_reason := 'explicit_departure';
    v_outcome_code := case
      when v_session.session_type = 'visitor_stay'
        then 'visitor_departed'
      when v_session.session_type = 'delivery_or_pickup'
        then 'interaction_ended_after_handoff'
      else 'service_ended_with_departure'
    end;
    v_outcome_description := 'A pessoa atendida deixou a área observada.';
    v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
  elsif v_max_duration_reached and v_session.status = 'open' then
    v_status := 'uncertain';
    v_closure_reason := 'maximum_duration';
    v_outcome_code := 'duration_limit_reached';
    v_outcome_description := 'A sessão atingiu o limite configurado sem encerramento visual claro.';
    v_outcome_confidence := 0.5;
  elsif v_session.status <> 'open' then
    v_status := v_session.status;
    v_closure_reason := v_session.closure_reason;
    v_outcome_code := v_session.outcome_code;
    v_outcome_description := 'Sessão já encerrada por evidência anterior.';
    v_outcome_confidence := v_session.outcome_confidence;
  else
    v_status := 'open';
    v_closure_reason := null;

    if v_object_to_staff then
      v_outcome_code := 'item_delivered_to_staff';
      v_outcome_description := 'Um objeto passou visualmente para o lado do funcionário.';
      v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
    elsif v_object_to_customer then
      v_outcome_code := 'item_collected_by_customer';
      v_outcome_description := 'Um objeto passou visualmente para o lado do cliente ou visitante.';
      v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
    elsif v_restricted_signal or v_event.primary_event_type = 'zone_intrusion' then
      v_outcome_code := 'restricted_access_observed';
      v_outcome_description := 'Foi observada atividade em uma área configurada como restrita.';
      v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
    elsif v_equipment_signal or v_equipment_observation then
      v_outcome_code := 'equipment_activity_observed';
      v_outcome_description := 'Foi observada atividade em equipamento configurado.';
      v_outcome_confidence := greatest(v_signal_confidence, v_event.confidence);
    else
      v_outcome_code := coalesce(nullif(v_session.outcome_code, ''), 'in_progress');
      v_outcome_description := 'Sessão em andamento.';
      v_outcome_confidence := greatest(v_session.outcome_confidence, 0);
    end if;
  end if;

  v_title := case v_session.session_type
    when 'customer_service' then 'Atendimento no balcão'
    when 'delivery_or_pickup' then 'Entrega ou retirada no atendimento'
    when 'visitor_stay' then 'Permanência de visitante'
    when 'staff_activity' then 'Atividade operacional de funcionário'
    when 'equipment_operation' then 'Operação de equipamento'
    when 'restricted_area_access' then 'Acesso a área restrita'
    when 'opening_procedure' then 'Procedimento de abertura'
    when 'closing_procedure' then 'Procedimento de fechamento'
    else 'Atividade observada'
  end;

  v_summary := format(
    '%s capítulo(s), %s pessoa(s) provável(is), %s cliente(s) ou visitante(s) provável(is) e %s funcionário(s) provável(is). Duração observada: %s segundo(s).',
    v_chapter_count,
    coalesce(v_people_count, 0),
    coalesce(v_customer_count, 0),
    coalesce(v_staff_count, 0),
    round(v_duration_seconds)
  );

  update public.operational_sessions
  set session_type = v_session.session_type,
      status = v_status,
      closure_reason = v_closure_reason,
      last_event_at = greatest(last_event_at, v_event.ended_at),
      ended_at = case
        when v_status = 'open' then null
        else greatest(last_event_at, v_event.ended_at)
      end,
      duration_seconds = v_duration_seconds,
      title = v_title,
      summary = v_summary,
      chapter_count = v_chapter_count,
      probable_people_count = coalesce(v_people_count, 0),
      probable_customer_count = coalesce(v_customer_count, 0),
      probable_staff_count = coalesce(v_staff_count, 0),
      confidence = greatest(
        v_camera.session_min_confidence,
        least(1, coalesce(v_confidence, 0))
      ),
      outcome_code = v_outcome_code,
      outcome_confidence = greatest(
        0,
        least(1, coalesce(v_outcome_confidence, 0))
      ),
      metadata = metadata || jsonb_build_object(
        'lastEventId', v_event.id,
        'lastChapterType', v_chapter_type,
        'lastSignalCount', jsonb_array_length(v_signals),
        'updatedBy', 'process_operational_session_v1'
      ),
      updated_at = now()
  where id = v_session_id
  returning * into v_session;

  if v_outcome_code <> 'in_progress' then
    insert into public.operational_session_outcomes (
      organization_id,
      session_id,
      outcome_code,
      description,
      confidence,
      evidence_event_ids,
      metadata
    ) values (
      v_event.organization_id,
      v_session_id,
      v_outcome_code,
      v_outcome_description,
      greatest(0, least(1, v_outcome_confidence)),
      array[v_event.id],
      jsonb_build_object(
        'chapterType', v_chapter_type,
        'source', 'deterministic_session_reconstruction_v1'
      )
    )
    on conflict (session_id, outcome_code) do update
    set description = excluded.description,
        confidence = greatest(
          public.operational_session_outcomes.confidence,
          excluded.confidence
        ),
        evidence_event_ids = (
          select coalesce(array_agg(distinct item), '{}')
          from unnest(
            public.operational_session_outcomes.evidence_event_ids
            || excluded.evidence_event_ids
          ) item
        ),
        metadata = public.operational_session_outcomes.metadata
          || excluded.metadata,
        updated_at = now();
  end if;

  update public.interaction_groups
  set operational_session_id = v_session_id,
      updated_at = now()
  where id in (
    select interaction_group_id
    from public.operational_session_groups
    where session_id = v_session_id
  );

  update public.events event_row
  set operational_session_id = v_session_id,
      session_type = v_session.session_type,
      session_status = v_session.status,
      session_chapter_type = chapter.chapter_type,
      session_chapter_order = chapter.chapter_order,
      session_chapter_count = v_session.chapter_count,
      session_duration_seconds = v_session.duration_seconds,
      session_confidence = v_session.confidence,
      session_summary = jsonb_build_object(
        'operationalSessionId', v_session_id,
        'sessionType', v_session.session_type,
        'status', v_session.status,
        'chapterType', chapter.chapter_type,
        'chapterOrder', chapter.chapter_order,
        'chapterCount', v_session.chapter_count,
        'durationSeconds', v_session.duration_seconds,
        'probablePeopleCount', v_session.probable_people_count,
        'probableCustomerCount', v_session.probable_customer_count,
        'probableStaffCount', v_session.probable_staff_count,
        'outcomeCode', v_session.outcome_code,
        'method', 'deterministic_session_reconstruction_v1'
      ),
      updated_at = now()
  from public.operational_session_events chapter
  where chapter.session_id = v_session_id
    and chapter.event_id = event_row.id;

  return jsonb_build_object(
    'enabled', true,
    'eventId', v_event.id,
    'operationalSessionId', v_session_id,
    'sessionType', v_session.session_type,
    'status', v_session.status,
    'chapterType', v_chapter_type,
    'chapterOrder', v_chapter_order,
    'chapterCount', v_session.chapter_count,
    'durationSeconds', v_session.duration_seconds,
    'probablePeopleCount', v_session.probable_people_count,
    'probableCustomerCount', v_session.probable_customer_count,
    'probableStaffCount', v_session.probable_staff_count,
    'outcomeCode', v_session.outcome_code,
    'confidence', v_session.confidence
  );
end;
$$;

revoke all on function public.process_operational_session_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.process_operational_session_v1(uuid)
  to service_role;

create or replace function private.process_monitoria_operational_session_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.interaction_group_id is not null
     and old.interaction_group_id is distinct from new.interaction_group_id then
    perform public.process_operational_session_v1(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_process_monitoria_operational_session_event
  on public.events;

create trigger trg_process_monitoria_operational_session_event
after update of interaction_group_id
on public.events
for each row
when (
  new.interaction_group_id is not null
  and old.interaction_group_id is distinct from new.interaction_group_id
)
execute function private.process_monitoria_operational_session_event();

create or replace function public.finalize_stale_operational_sessions_v1(
  p_organization_id uuid,
  p_camera_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  update public.operational_sessions session_row
  set status = 'closed_by_inactivity',
      closure_reason = 'inactivity',
      ended_at = session_row.last_event_at,
      duration_seconds = greatest(
        0,
        pg_catalog.date_part(
          'epoch',
          session_row.last_event_at - session_row.started_at
        )
      ),
      outcome_code = case
        when session_row.outcome_code = 'in_progress'
          then 'no_visible_outcome'
        else session_row.outcome_code
      end,
      outcome_confidence = greatest(session_row.outcome_confidence, 0.55),
      updated_at = now()
  from public.cameras camera
  where session_row.organization_id = p_organization_id
    and session_row.camera_id = camera.id
    and session_row.status = 'open'
    and (p_camera_id is null or session_row.camera_id = p_camera_id)
    and session_row.last_event_at < now()
      - pg_catalog.make_interval(
          mins => greatest(2, camera.session_idle_close_minutes)
        );

  get diagnostics v_count = row_count;

  update public.events event_row
  set session_status = session_row.status,
      session_duration_seconds = session_row.duration_seconds,
      session_summary = event_row.session_summary
        || jsonb_build_object(
          'status', session_row.status,
          'closureReason', session_row.closure_reason,
          'durationSeconds', session_row.duration_seconds,
          'outcomeCode', session_row.outcome_code
        ),
      updated_at = now()
  from public.operational_sessions session_row
  where event_row.operational_session_id = session_row.id
    and session_row.organization_id = p_organization_id
    and session_row.status <> 'open'
    and event_row.session_status is distinct from session_row.status;

  return v_count;
end;
$$;

revoke all on function public.finalize_stale_operational_sessions_v1(uuid, uuid)
  from public, anon;
grant execute on function public.finalize_stale_operational_sessions_v1(uuid, uuid)
  to authenticated, service_role;

create or replace function public.search_operational_sessions(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_camera_id uuid default null,
  p_site_id uuid default null,
  p_session_type text default null,
  p_status text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  camera_id uuid,
  camera_name text,
  site_id uuid,
  site_name text,
  session_type text,
  status text,
  title text,
  summary text,
  chapter_count integer,
  probable_people_count integer,
  probable_customer_count integer,
  probable_staff_count integer,
  outcome_code text,
  confidence numeric,
  thumbnail_asset_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      session_row.id,
      session_row.started_at,
      coalesce(session_row.ended_at, session_row.last_event_at) as ended_at,
      case
        when session_row.status = 'open'
          then greatest(
            session_row.duration_seconds,
            pg_catalog.date_part(
              'epoch',
              session_row.last_event_at - session_row.started_at
            )
          )
        else session_row.duration_seconds
      end::numeric as duration_seconds,
      session_row.camera_id,
      camera.name as camera_name,
      session_row.site_id,
      site.name as site_name,
      session_row.session_type,
      case
        when session_row.status = 'open'
          and session_row.last_event_at < now()
            - pg_catalog.make_interval(
                mins => greatest(2, camera.session_idle_close_minutes)
              )
          then 'closed_by_inactivity'
        else session_row.status
      end as status,
      session_row.title,
      session_row.summary,
      session_row.chapter_count,
      session_row.probable_people_count,
      session_row.probable_customer_count,
      session_row.probable_staff_count,
      session_row.outcome_code,
      session_row.confidence,
      (
        select asset.id
        from public.operational_session_events chapter
        join public.storage_assets asset
          on asset.event_id = chapter.event_id
        where chapter.session_id = session_row.id
          and asset.status = 'ready'::public.asset_status
          and asset.deleted_at is null
        order by chapter.is_key_chapter desc,
                 chapter.chapter_order desc,
                 case
                   when asset.storage_path like '%/peak.jpg' then 0
                   when asset.storage_path like '%/end.jpg' then 1
                   else 2
                 end,
                 asset.captured_at desc
        limit 1
      ) as thumbnail_asset_id
    from public.operational_sessions session_row
    join public.cameras camera
      on camera.id = session_row.camera_id
    join public.sites site
      on site.id = session_row.site_id
    where session_row.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and (p_from is null or session_row.started_at >= p_from)
      and (p_to is null or session_row.started_at < p_to)
      and (p_camera_id is null or session_row.camera_id = p_camera_id)
      and (p_site_id is null or session_row.site_id = p_site_id)
      and (
        nullif(pg_catalog.btrim(coalesce(p_session_type, '')), '') is null
        or session_row.session_type = p_session_type
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_status, '')), '') is null
        or p_status = 'all'
        or session_row.status = p_status
        or (
          p_status = 'closed_by_inactivity'
          and session_row.status = 'open'
          and session_row.last_event_at < now()
            - pg_catalog.make_interval(
                mins => greatest(2, camera.session_idle_close_minutes)
              )
        )
      )
  )
  select filtered.*,
         pg_catalog.count(*) over() as total_count
  from filtered
  order by filtered.started_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_operational_sessions(
  uuid, timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) from public, anon;
grant execute on function public.search_operational_sessions(
  uuid, timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) to authenticated, service_role;

create or replace function public.assistant_operational_sessions_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  perform public.finalize_stale_operational_sessions_v1(
    p_organization_id,
    p_camera_id
  );

  with filtered as (
    select session_row.*
    from public.operational_sessions session_row
    where session_row.organization_id = p_organization_id
      and session_row.started_at >= p_from
      and session_row.started_at < p_to
      and (p_camera_id is null or session_row.camera_id = p_camera_id)
      and (p_site_id is null or session_row.site_id = p_site_id)
  ),
  by_type as (
    select session_type, count(*)::integer as count
    from filtered
    group by session_type
  ),
  evidence as (
    select
      session_row.id,
      session_row.started_at,
      session_row.ended_at,
      session_row.session_type,
      session_row.status,
      session_row.title,
      session_row.summary,
      session_row.chapter_count,
      session_row.probable_customer_count,
      session_row.probable_staff_count,
      session_row.duration_seconds,
      session_row.outcome_code,
      session_row.confidence,
      coalesce(
        (
          select jsonb_agg(chapter.event_id order by chapter.chapter_order)
          from (
            select chapter.event_id, chapter.chapter_order
            from public.operational_session_events chapter
            where chapter.session_id = session_row.id
            order by chapter.is_key_chapter desc, chapter.chapter_order desc
            limit 8
          ) chapter
        ),
        '[]'::jsonb
      ) as evidence_event_ids
    from filtered session_row
    order by session_row.started_at desc
    limit 20
  )
  select jsonb_build_object(
    'totalSessions', (select count(*) from filtered),
    'completedSessions', (
      select count(*) from filtered where status = 'completed'
    ),
    'openSessions', (
      select count(*) from filtered where status = 'open'
    ),
    'uncertainSessions', (
      select count(*) from filtered where status = 'uncertain'
    ),
    'probableCustomerParticipations', (
      select coalesce(sum(probable_customer_count), 0) from filtered
    ),
    'averageDurationSeconds', (
      select coalesce(avg(duration_seconds), 0) from filtered
    ),
    'medianDurationSeconds', (
      select coalesce(
        percentile_cont(0.5) within group (order by duration_seconds),
        0
      ) from filtered
    ),
    'byType', coalesce(
      (
        select jsonb_object_agg(session_type, count)
        from by_type
      ),
      '{}'::jsonb
    ),
    'sessions', coalesce(
      (
        select jsonb_agg(to_jsonb(evidence))
        from evidence
      ),
      '[]'::jsonb
    ),
    'definitions', jsonb_build_object(
      'session', 'História operacional composta por capítulos visualmente relacionados.',
      'customerCount', 'Participações prováveis; não representa identidade civil nem contagem exata.',
      'outcome', 'Resultado visual observado; não confirma venda, pagamento ou intenção.'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.assistant_operational_sessions_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;
grant execute on function public.assistant_operational_sessions_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

-- Atualiza a pesquisa de eventos para expor a sessão operacional.
drop function if exists public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
);

create function public.search_monitoria_events(
  p_organization_id uuid,
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_camera_id uuid default null,
  p_site_id uuid default null,
  p_event_type text default null,
  p_min_confidence numeric default null,
  p_review_filter text default 'all',
  p_has_people boolean default null,
  p_has_vehicles boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  camera_id uuid,
  camera_name text,
  site_id uuid,
  site_name text,
  headline text,
  event_type text,
  original_event_type text,
  summary text,
  confidence numeric,
  requires_review boolean,
  review_status public.review_status,
  human_verdict text,
  human_reviewed_at timestamptz,
  tags text[],
  people_count bigint,
  vehicle_count bigint,
  interaction_group_id uuid,
  is_continuation boolean,
  interaction_event_count integer,
  probable_people_count integer,
  probable_customer_count integer,
  probable_staff_count integer,
  continuity_confidence numeric,
  operational_session_id uuid,
  session_type text,
  session_status text,
  session_chapter_type text,
  session_chapter_order integer,
  session_chapter_count integer,
  session_duration_seconds numeric,
  session_confidence numeric,
  thumbnail_asset_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      event.id,
      event.started_at,
      event.ended_at,
      pg_catalog.date_part(
        'epoch',
        event.ended_at - event.started_at
      )::numeric as duration_seconds,
      event.camera_id,
      camera.name as camera_name,
      event.site_id,
      site.name as site_name,
      event.headline,
      coalesce(
        event.corrected_event_type,
        event.primary_event_type
      ) as event_type,
      event.primary_event_type as original_event_type,
      event.summary,
      event.confidence,
      event.requires_review,
      event.review_status,
      event.human_verdict,
      event.human_reviewed_at,
      event.tags,
      (
        select pg_catalog.count(*)
        from public.event_people person
        where person.event_id = event.id
      ) as people_count,
      (
        select pg_catalog.count(*)
        from public.event_vehicles vehicle
        where vehicle.event_id = event.id
      ) as vehicle_count,
      event.interaction_group_id,
      event.is_continuation,
      event.interaction_event_count,
      event.probable_people_count,
      event.probable_customer_count,
      event.probable_staff_count,
      event.continuity_confidence,
      event.operational_session_id,
      event.session_type,
      event.session_status,
      event.session_chapter_type,
      event.session_chapter_order,
      event.session_chapter_count,
      event.session_duration_seconds,
      event.session_confidence,
      (
        select asset.id
        from public.storage_assets asset
        where asset.event_id = event.id
          and asset.status = 'ready'::public.asset_status
          and asset.deleted_at is null
        order by
          case
            when asset.storage_path like '%/peak.jpg' then 0
            when asset.storage_path like '%/start.jpg' then 1
            when asset.storage_path like '%/end.jpg' then 2
            else 3
          end,
          asset.captured_at
        limit 1
      ) as thumbnail_asset_id
    from public.events event
    join public.cameras camera
      on camera.id = event.camera_id
    join public.sites site
      on site.id = event.site_id
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and private.is_org_member(p_organization_id)
      and (p_from is null or event.started_at >= p_from)
      and (p_to is null or event.started_at < p_to)
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
      and (
        nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
        or coalesce(event.corrected_event_type, event.primary_event_type) = p_event_type
      )
      and (p_min_confidence is null or event.confidence >= p_min_confidence)
      and (
        coalesce(p_review_filter, 'all') = 'all'
        or (p_review_filter = 'pending' and event.review_status = 'pending'::public.review_status)
        or (p_review_filter = 'required' and event.requires_review)
        or (p_review_filter = 'reviewed' and event.human_reviewed_at is not null)
        or event.human_verdict = p_review_filter
      )
      and (
        p_has_people is null
        or p_has_people = exists (
          select 1 from public.event_people person where person.event_id = event.id
        )
      )
      and (
        p_has_vehicles is null
        or p_has_vehicles = exists (
          select 1 from public.event_vehicles vehicle where vehicle.event_id = event.id
        )
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_query, '')), '') is null
        or event.search_document @@ pg_catalog.websearch_to_tsquery(
          'portuguese'::regconfig,
          pg_catalog.btrim(p_query)
        )
        or event.headline ilike '%' || pg_catalog.btrim(p_query) || '%'
        or event.summary ilike '%' || pg_catalog.btrim(p_query) || '%'
      )
  )
  select filtered.*,
         pg_catalog.count(*) over() as total_count
  from filtered
  order by filtered.started_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
) from public, anon;
grant execute on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
) to authenticated, service_role;

-- Mantém o projeto declarativo alinhado ao Realtime.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_sessions'
  ) then
    alter publication supabase_realtime
      add table public.operational_sessions;
  end if;
end
$$;

-- Ativa a Fase 3 nas câmeras que já usam a memória curta.
update public.cameras
set operational_sessions_enabled = true,
    session_idle_close_minutes = 12,
    session_max_duration_minutes = 240,
    session_min_confidence = 0.650,
    updated_at = now()
where short_memory_enabled;

commit;
