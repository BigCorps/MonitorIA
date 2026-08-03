-- MonitorIA — Fase 3.5
-- Cenas complexas, memória temporária de veículos, modos de câmera,
-- roteamento visual por complexidade e governança central de inferência.
-- Requer as Fases 1, 2 e 3 aplicadas.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'operational_sessions'
  ) then
    raise exception 'monitoria_phase_3_required';
  end if;
end
$$;

alter table public.cameras
  add column if not exists intelligence_mode text not null default 'auto',
  add column if not exists scene_density text not null default 'normal',
  add column if not exists multi_entity_enabled boolean not null default true,
  add column if not exists vehicle_memory_enabled boolean not null default true,
  add column if not exists complexity_routing_enabled boolean not null default true,
  add column if not exists verification_enabled boolean not null default true,
  add column if not exists complexity_strong_threshold integer not null default 65,
  add column if not exists verification_threshold integer not null default 78,
  add column if not exists vehicle_memory_window_minutes integer not null default 60,
  add column if not exists vehicle_similarity_threshold numeric(4,3) not null default 0.760;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_intelligence_mode_check'
  ) then
    alter table public.cameras
      add constraint cameras_intelligence_mode_check
      check (intelligence_mode in (
        'auto', 'general', 'entrance', 'service_counter', 'checkout',
        'parking', 'warehouse', 'corridor', 'production',
        'restricted_area', 'crowd'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_scene_density_check'
  ) then
    alter table public.cameras
      add constraint cameras_scene_density_check
      check (scene_density in ('low', 'normal', 'high'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_complexity_strong_threshold_check'
  ) then
    alter table public.cameras
      add constraint cameras_complexity_strong_threshold_check
      check (complexity_strong_threshold between 35 and 95);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_verification_threshold_check'
  ) then
    alter table public.cameras
      add constraint cameras_verification_threshold_check
      check (verification_threshold between 45 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_vehicle_memory_window_check'
  ) then
    alter table public.cameras
      add constraint cameras_vehicle_memory_window_check
      check (vehicle_memory_window_minutes between 5 and 720);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_vehicle_similarity_threshold_check'
  ) then
    alter table public.cameras
      add constraint cameras_vehicle_similarity_threshold_check
      check (vehicle_similarity_threshold between 0.5 and 1);
  end if;
end
$$;

comment on column public.cameras.intelligence_mode is
  'Modo genérico da câmera usado pelo roteador de complexidade. auto preserva adaptação sem configuração manual.';
comment on column public.cameras.multi_entity_enabled is
  'Permite relações entre várias pessoas, veículos, objetos e ações no mesmo evento, sem reconhecimento facial.';
comment on column public.cameras.vehicle_memory_enabled is
  'Ativa memória temporária e probabilística de veículos por aparência ampla e contexto temporal.';

alter table public.event_vehicles
  add column if not exists appearance jsonb not null default '{}'::jsonb,
  add column if not exists appearance_confidence numeric(5,4) not null default 0,
  add column if not exists vehicle_instance_id uuid null,
  add column if not exists vehicle_similarity numeric(5,4) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_vehicles_appearance_object_check'
  ) then
    alter table public.event_vehicles
      add constraint event_vehicles_appearance_object_check
      check (jsonb_typeof(appearance) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_vehicles_appearance_confidence_check'
  ) then
    alter table public.event_vehicles
      add constraint event_vehicles_appearance_confidence_check
      check (
        appearance_confidence between 0 and 1
        and vehicle_similarity between 0 and 1
      );
  end if;
end
$$;

alter table public.events
  add column if not exists scene_complexity jsonb not null default '{}'::jsonb,
  add column if not exists routing_summary jsonb not null default '{}'::jsonb,
  add column if not exists entity_relation_count integer not null default 0,
  add column if not exists probable_distinct_vehicle_count integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_scene_complexity_object_check'
  ) then
    alter table public.events
      add constraint events_scene_complexity_object_check
      check (jsonb_typeof(scene_complexity) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_routing_summary_object_check'
  ) then
    alter table public.events
      add constraint events_routing_summary_object_check
      check (jsonb_typeof(routing_summary) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_multiscene_counts_check'
  ) then
    alter table public.events
      add constraint events_multiscene_counts_check
      check (
        entity_relation_count >= 0
        and probable_distinct_vehicle_count >= 0
      );
  end if;
end
$$;

create table if not exists public.analysis_routing_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  event_id uuid null references public.events(id) on delete set null,
  plan_code text not null,
  camera_mode text not null,
  scene_density text not null,
  preflight_score integer not null,
  postflight_score integer null,
  initial_route text not null,
  selected_route text not null,
  capped_by_plan boolean not null default false,
  verification_requested boolean not null default false,
  verified boolean not null default false,
  critical boolean not null default false,
  provider text not null,
  model text not null,
  reasons jsonb not null default '[]'::jsonb,
  attempts jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint analysis_routing_decisions_score_check check (
    preflight_score between 0 and 100
    and (postflight_score is null or postflight_score between 0 and 100)
  ),
  constraint analysis_routing_decisions_route_check check (
    initial_route in ('deterministic', 'economic', 'balanced', 'strong')
    and selected_route in ('deterministic', 'economic', 'balanced', 'strong')
  ),
  constraint analysis_routing_decisions_json_check check (
    jsonb_typeof(reasons) = 'array'
    and jsonb_typeof(attempts) = 'array'
  )
);

create unique index if not exists analysis_routing_decisions_job_uidx
  on public.analysis_routing_decisions(analysis_job_id);
create index if not exists analysis_routing_decisions_camera_time_idx
  on public.analysis_routing_decisions(camera_id, created_at desc);
create index if not exists analysis_routing_decisions_route_idx
  on public.analysis_routing_decisions(organization_id, selected_route, created_at desc);

alter table public.analysis_jobs
  add column if not exists routing_decision_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_jobs_routing_decision_id_fkey'
  ) then
    alter table public.analysis_jobs
      add constraint analysis_jobs_routing_decision_id_fkey
      foreign key (routing_decision_id)
      references public.analysis_routing_decisions(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.vehicle_memory_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  scope text not null default 'camera_window',
  vehicle_type text not null default 'unknown',
  first_event_id uuid not null references public.events(id) on delete cascade,
  last_event_id uuid not null references public.events(id) on delete cascade,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  canonical_appearance jsonb not null default '{}'::jsonb,
  appearance_confidence numeric(5,4) not null default 0,
  last_zone_ids uuid[] not null default '{}',
  observation_count integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_memory_instances_scope_check check (
    scope in ('visit', 'parking_stay', 'camera_window')
  ),
  constraint vehicle_memory_instances_appearance_check check (
    jsonb_typeof(canonical_appearance) = 'object'
  ),
  constraint vehicle_memory_instances_confidence_check check (
    appearance_confidence between 0 and 1
  ),
  constraint vehicle_memory_instances_time_check check (
    last_seen_at >= first_seen_at
    and expires_at >= last_seen_at
  )
);

create index if not exists vehicle_memory_instances_camera_active_idx
  on public.vehicle_memory_instances(camera_id, active, last_seen_at desc);
create index if not exists vehicle_memory_instances_expiry_idx
  on public.vehicle_memory_instances(expires_at)
  where active;

create table if not exists public.event_vehicle_memory_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_vehicle_id uuid not null references public.event_vehicles(id) on delete cascade,
  vehicle_instance_id uuid not null references public.vehicle_memory_instances(id) on delete cascade,
  link_kind text not null,
  similarity_score numeric(5,4) not null default 0,
  gap_seconds numeric not null default 0,
  reasoning jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint event_vehicle_memory_links_kind_check check (
    link_kind in ('new_instance', 'appearance_continuation', 'parking_continuation')
  ),
  constraint event_vehicle_memory_links_similarity_check check (
    similarity_score between 0 and 1
  ),
  constraint event_vehicle_memory_links_reasoning_check check (
    jsonb_typeof(reasoning) = 'object'
  )
);

create unique index if not exists event_vehicle_memory_links_vehicle_uidx
  on public.event_vehicle_memory_links(event_vehicle_id);
create index if not exists event_vehicle_memory_links_instance_idx
  on public.event_vehicle_memory_links(vehicle_instance_id, created_at desc);
create index if not exists event_vehicle_memory_links_event_idx
  on public.event_vehicle_memory_links(event_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_vehicles_vehicle_instance_id_fkey'
  ) then
    alter table public.event_vehicles
      add constraint event_vehicles_vehicle_instance_id_fkey
      foreign key (vehicle_instance_id)
      references public.vehicle_memory_instances(id)
      on delete set null;
  end if;
end
$$;

create index if not exists event_vehicles_vehicle_instance_idx
  on public.event_vehicles(vehicle_instance_id, created_at desc)
  where vehicle_instance_id is not null;

alter table public.analysis_routing_decisions enable row level security;
alter table public.vehicle_memory_instances enable row level security;
alter table public.event_vehicle_memory_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'analysis_routing_decisions'
      and policyname = 'analysis_routing_decisions_select_member'
  ) then
    create policy analysis_routing_decisions_select_member
      on public.analysis_routing_decisions
      for select to authenticated
      using (private.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'vehicle_memory_instances'
      and policyname = 'vehicle_memory_instances_select_member'
  ) then
    create policy vehicle_memory_instances_select_member
      on public.vehicle_memory_instances
      for select to authenticated
      using (private.is_org_member(organization_id));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_vehicle_memory_links'
      and policyname = 'event_vehicle_memory_links_select_member'
  ) then
    create policy event_vehicle_memory_links_select_member
      on public.event_vehicle_memory_links
      for select to authenticated
      using (private.is_org_member(organization_id));
  end if;
end
$$;

create or replace function private.jsonb_text_array_overlap(
  p_left jsonb,
  p_right jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements_text(
      case when jsonb_typeof(p_left) = 'array' then p_left else '[]'::jsonb end
    ) left_item
    join jsonb_array_elements_text(
      case when jsonb_typeof(p_right) = 'array' then p_right else '[]'::jsonb end
    ) right_item
      on lower(trim(left_item.value)) = lower(trim(right_item.value))
  );
$$;

create or replace function public.process_event_vehicle_memory_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event record;
  v_vehicle record;
  v_instance_id uuid;
  v_best_score numeric;
  v_gap_seconds numeric;
  v_threshold numeric;
  v_window_minutes integer;
  v_links integer := 0;
  v_distinct integer := 0;
  v_color text;
  v_body text;
  v_size text;
  v_orientation text;
begin
  select
    e.id,
    e.organization_id,
    e.site_id,
    e.camera_id,
    e.started_at,
    c.vehicle_memory_enabled,
    c.vehicle_memory_window_minutes,
    c.vehicle_similarity_threshold
  into v_event
  from public.events e
  join public.cameras c on c.id = e.camera_id
  where e.id = p_event_id
    and e.deleted_at is null;

  if not found then
    raise exception 'event_not_found';
  end if;

  if not v_event.vehicle_memory_enabled then
    return jsonb_build_object(
      'enabled', false,
      'eventId', p_event_id,
      'probableDistinctVehicleCount', 0,
      'linksCreated', 0
    );
  end if;

  v_threshold := v_event.vehicle_similarity_threshold;
  v_window_minutes := v_event.vehicle_memory_window_minutes;

  update public.vehicle_memory_instances
  set active = false,
      updated_at = now()
  where camera_id = v_event.camera_id
    and active
    and expires_at < v_event.started_at;

  for v_vehicle in
    select *
    from public.event_vehicles
    where event_id = p_event_id
      and organization_id = v_event.organization_id
    order by created_at, id
  loop
    v_instance_id := null;
    v_best_score := 0;
    v_gap_seconds := 0;

    v_color := coalesce(
      nullif(v_vehicle.appearance->>'colorFamily', ''),
      nullif(lower(trim(coalesce(v_vehicle.color, ''))), ''),
      'unknown'
    );
    v_body := coalesce(nullif(v_vehicle.appearance->>'bodyStyle', ''), 'unknown');
    v_size := coalesce(nullif(v_vehicle.appearance->>'sizeClass', ''), 'unknown');
    v_orientation := coalesce(nullif(v_vehicle.appearance->>'orientation', ''), 'unknown');

    select candidate.id, candidate.score, candidate.gap_seconds
      into v_instance_id, v_best_score, v_gap_seconds
    from (
      select
        instance.id,
        greatest(
          0,
          least(
            1,
            (case
              when instance.vehicle_type = v_vehicle.vehicle_type then 0.20
              when instance.vehicle_type = 'unknown' or v_vehicle.vehicle_type = 'unknown' then 0.08
              else 0
            end)
            + (case
              when coalesce(instance.canonical_appearance->>'colorFamily', 'unknown') = v_color
                and v_color <> 'unknown' then 0.22
              else 0
            end)
            + (case
              when coalesce(instance.canonical_appearance->>'bodyStyle', 'unknown') = v_body
                and v_body <> 'unknown' then 0.18
              else 0
            end)
            + (case
              when coalesce(instance.canonical_appearance->>'sizeClass', 'unknown') = v_size
                and v_size <> 'unknown' then 0.12
              else 0
            end)
            + (case
              when private.jsonb_text_array_overlap(
                instance.canonical_appearance->'distinctiveVisibleFeatures',
                v_vehicle.appearance->'distinctiveVisibleFeatures'
              ) then 0.15
              else 0
            end)
            + (case
              when private.jsonb_text_array_overlap(
                instance.canonical_appearance->'visibleAccessories',
                v_vehicle.appearance->'visibleAccessories'
              ) then 0.06
              else 0
            end)
            + (case
              when instance.last_zone_ids && v_vehicle.zone_ids then 0.04
              else 0
            end)
            + (case
              when extract(epoch from (v_event.started_at - instance.last_seen_at)) <= 300 then 0.10
              when extract(epoch from (v_event.started_at - instance.last_seen_at)) <= 1200 then 0.06
              else 0.02
            end)
            + (case
              when coalesce(instance.canonical_appearance->>'orientation', 'unknown') = v_orientation
                and v_orientation <> 'unknown' then 0.03
              else 0
            end)
          )
        )::numeric as score,
        extract(epoch from (v_event.started_at - instance.last_seen_at))::numeric as gap_seconds
      from public.vehicle_memory_instances instance
      where instance.organization_id = v_event.organization_id
        and instance.camera_id = v_event.camera_id
        and instance.active
        and instance.last_seen_at <= v_event.started_at
        and instance.last_seen_at >=
          v_event.started_at - make_interval(mins => v_window_minutes)
      order by score desc, instance.last_seen_at desc
      limit 1
    ) candidate;

    if v_instance_id is not null and v_best_score >= v_threshold then
      update public.vehicle_memory_instances
      set last_event_id = p_event_id,
          last_seen_at = v_event.started_at,
          expires_at = v_event.started_at + make_interval(mins => v_window_minutes),
          vehicle_type = case
            when vehicle_type = 'unknown' then v_vehicle.vehicle_type
            else vehicle_type
          end,
          canonical_appearance = case
            when v_vehicle.appearance_confidence >= appearance_confidence
              then v_vehicle.appearance
            else canonical_appearance
          end,
          appearance_confidence = greatest(
            appearance_confidence,
            v_vehicle.appearance_confidence
          ),
          last_zone_ids = v_vehicle.zone_ids,
          observation_count = observation_count + 1,
          active = true,
          updated_at = now()
      where id = v_instance_id;

      insert into public.event_vehicle_memory_links (
        organization_id,
        event_id,
        event_vehicle_id,
        vehicle_instance_id,
        link_kind,
        similarity_score,
        gap_seconds,
        reasoning
      ) values (
        v_event.organization_id,
        p_event_id,
        v_vehicle.id,
        v_instance_id,
        case
          when coalesce(v_gap_seconds, 0) <= 600
            then 'parking_continuation'
          else 'appearance_continuation'
        end,
        v_best_score,
        coalesce(v_gap_seconds, 0),
        jsonb_build_object(
          'vehicleType', v_vehicle.vehicle_type,
          'colorFamily', v_color,
          'bodyStyle', v_body,
          'sizeClass', v_size,
          'orientation', v_orientation,
          'threshold', v_threshold
        )
      )
      on conflict (event_vehicle_id) do update
      set vehicle_instance_id = excluded.vehicle_instance_id,
          link_kind = excluded.link_kind,
          similarity_score = excluded.similarity_score,
          gap_seconds = excluded.gap_seconds,
          reasoning = excluded.reasoning;
    else
      insert into public.vehicle_memory_instances (
        organization_id,
        site_id,
        camera_id,
        scope,
        vehicle_type,
        first_event_id,
        last_event_id,
        first_seen_at,
        last_seen_at,
        expires_at,
        canonical_appearance,
        appearance_confidence,
        last_zone_ids
      ) values (
        v_event.organization_id,
        v_event.site_id,
        v_event.camera_id,
        case
          when v_vehicle.vehicle_type in ('car', 'motorcycle', 'truck', 'van', 'bus')
            then 'camera_window'
          else 'visit'
        end,
        v_vehicle.vehicle_type,
        p_event_id,
        p_event_id,
        v_event.started_at,
        v_event.started_at,
        v_event.started_at + make_interval(mins => v_window_minutes),
        v_vehicle.appearance,
        v_vehicle.appearance_confidence,
        v_vehicle.zone_ids
      )
      returning id into v_instance_id;

      v_best_score := 1;
      v_gap_seconds := 0;

      insert into public.event_vehicle_memory_links (
        organization_id,
        event_id,
        event_vehicle_id,
        vehicle_instance_id,
        link_kind,
        similarity_score,
        gap_seconds,
        reasoning
      ) values (
        v_event.organization_id,
        p_event_id,
        v_vehicle.id,
        v_instance_id,
        'new_instance',
        1,
        0,
        jsonb_build_object(
          'vehicleType', v_vehicle.vehicle_type,
          'colorFamily', v_color,
          'bodyStyle', v_body,
          'sizeClass', v_size,
          'threshold', v_threshold
        )
      )
      on conflict (event_vehicle_id) do nothing;
    end if;

    update public.event_vehicles
    set vehicle_instance_id = v_instance_id,
        vehicle_similarity = coalesce(v_best_score, 0)
    where id = v_vehicle.id;

    v_links := v_links + 1;
  end loop;

  select count(distinct vehicle_instance_id)
    into v_distinct
  from public.event_vehicle_memory_links
  where event_id = p_event_id;

  update public.events
  set probable_distinct_vehicle_count = coalesce(v_distinct, 0),
      updated_at = now()
  where id = p_event_id;

  return jsonb_build_object(
    'enabled', true,
    'eventId', p_event_id,
    'probableDistinctVehicleCount', coalesce(v_distinct, 0),
    'linksCreated', v_links
  );
end;
$$;

create or replace function public.assistant_vehicle_continuity_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with filtered_events as (
    select e.id, e.camera_id, e.site_id, e.started_at
    from public.events e
    where e.organization_id = p_organization_id
      and e.deleted_at is null
      and e.started_at >= p_from
      and e.started_at < p_to
      and (p_camera_id is null or e.camera_id = p_camera_id)
      and (p_site_id is null or e.site_id = p_site_id)
      and private.is_org_member(p_organization_id)
  ),
  links as (
    select distinct
      l.vehicle_instance_id,
      l.event_id
    from public.event_vehicle_memory_links l
    join filtered_events e on e.id = l.event_id
  ),
  instance_rows as (
    select
      i.id,
      i.vehicle_type,
      i.first_seen_at,
      i.last_seen_at,
      i.observation_count,
      i.appearance_confidence,
      i.canonical_appearance,
      array_agg(distinct l.event_id) as evidence_event_ids
    from public.vehicle_memory_instances i
    join links l on l.vehicle_instance_id = i.id
    group by i.id
    order by i.last_seen_at desc
    limit 50
  )
  select jsonb_build_object(
    'rawVehicleObservations', (
      select count(*)
      from public.event_vehicles v
      join filtered_events e on e.id = v.event_id
    ),
    'probableDistinctVehicles', (
      select count(distinct vehicle_instance_id) from links
    ),
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'instanceId', row.id,
        'vehicleType', row.vehicle_type,
        'firstSeenAt', row.first_seen_at,
        'lastSeenAt', row.last_seen_at,
        'observationCount', row.observation_count,
        'appearanceConfidence', row.appearance_confidence,
        'appearance', row.canonical_appearance,
        'evidenceEventIds', row.evidence_event_ids
      ))
      from instance_rows row
    ), '[]'::jsonb),
    'limitations', jsonb_build_array(
      'Veículos visualmente semelhantes podem ser indistinguíveis.',
      'A estimativa não usa placa, proprietário ou modelo exato.',
      'Os identificadores são temporários e limitados ao contexto da câmera.'
    )
  );
$$;

revoke all on function public.process_event_vehicle_memory_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.process_event_vehicle_memory_v1(uuid)
  to service_role;

revoke all on function public.assistant_vehicle_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;
grant execute on function public.assistant_vehicle_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

commit;
