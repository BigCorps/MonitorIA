-- MonitorIA — Fase 13
-- Calibração orientada pelas 108 revisões humanas de 08/08/2026.
-- Não usa reconhecimento facial, placa ou identidade civil.

begin;

alter table public.event_people
  add column if not exists model_role text not null default 'unknown',
  add column if not exists operational_role text not null default 'unknown',
  add column if not exists engaged_at_counter boolean not null default false,
  add column if not exists operational_role_reason text not null default '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_people_model_role_check'
  ) then
    alter table public.event_people
      add constraint event_people_model_role_check
      check (model_role in ('staff','customer','delivery_person','visitor','unknown'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_people_operational_role_check'
  ) then
    alter table public.event_people
      add constraint event_people_operational_role_check
      check (operational_role in ('staff','customer','delivery_person','visitor','unknown'));
  end if;
end
$$;

comment on column public.event_people.model_role is
  'Papel originalmente proposto pelo modelo, preservado para auditoria.';
comment on column public.event_people.operational_role is
  'Papel calibrado por zona e ação observada. Passagem externa não equivale a cliente.';
comment on column public.event_people.engaged_at_counter is
  'Verdadeiro somente quando a pessoa alcança o balcão e há indício visual de atendimento.';

create index if not exists event_people_operational_role_idx
  on public.event_people(event_id, operational_role, engaged_at_counter);

-- Mantém o diagnóstico do onboarding idempotente após as restrições do MCP.
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(
  uuid,
  public.organization_role[]
) to authenticated;

create or replace function private.monitoria_known_value_compatible(
  p_left text,
  p_right text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(nullif(lower(trim(p_left)), ''), 'unknown') = 'unknown'
    or coalesce(nullif(lower(trim(p_right)), ''), 'unknown') = 'unknown'
    or lower(trim(p_left)) = lower(trim(p_right));
$$;

create or replace function public.reconcile_event_people_memory_v2(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_camera public.cameras%rowtype;
  v_link record;
  v_candidate_id uuid;
  v_similarity numeric;
  v_merged integer := 0;
  v_group_id uuid;
  v_session_id uuid;
  v_people_count integer;
  v_customer_count integer;
  v_staff_count integer;
begin
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then raise exception 'event_not_found'; end if;

  select * into v_camera
  from public.cameras
  where id = v_event.camera_id;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event.camera_id::text || ':people-reconcile-v2', 0)
  );

  for v_link in
    select
      link.id as link_id,
      link.person_instance_id as old_instance_id,
      link.event_person_id,
      person.zone_ids,
      person.appearance,
      person.appearance_confidence
    from public.event_person_memory_links link
    join public.event_people person on person.id = link.event_person_id
    join public.person_memory_instances instance
      on instance.id = link.person_instance_id
    where link.event_id = p_event_id
      and person.operational_role = 'staff'
      and instance.scope = 'staff_shift'
      and link.link_kind = 'new_instance'
  loop
    v_candidate_id := null;
    v_similarity := 0;

    select candidate.id, candidate.similarity
      into v_candidate_id, v_similarity
    from (
      select
        instance.id,
        private.monitoria_appearance_similarity(
          v_link.appearance,
          instance.canonical_appearance
        ) as similarity,
        instance.last_seen_at,
        exists (
          select 1
          from public.event_person_memory_links prior_link
          join public.event_people prior_person
            on prior_person.id = prior_link.event_person_id
          where prior_link.person_instance_id = instance.id
            and prior_person.zone_ids && v_link.zone_ids
        ) as shares_zone
      from public.person_memory_instances instance
      where instance.organization_id = v_event.organization_id
        and instance.camera_id = v_event.camera_id
        and instance.scope = 'staff_shift'
        and instance.id <> v_link.old_instance_id
        and instance.first_seen_at < v_event.started_at
        and instance.last_seen_at >= v_event.started_at
          - pg_catalog.make_interval(
              hours => greatest(1, v_camera.staff_memory_hours)
            )
        and not exists (
          select 1
          from public.event_person_memory_links current_link
          where current_link.event_id = p_event_id
            and current_link.person_instance_id = instance.id
        )
    ) candidate
    where candidate.similarity >= greatest(
      0.54,
      v_camera.continuity_min_similarity - 0.16
    )
      and (candidate.shares_zone or candidate.similarity >= 0.68)
    order by
      (0.82 * candidate.similarity
        + 0.18 * greatest(
            0,
            1 - extract(epoch from (v_event.started_at - candidate.last_seen_at))
              / greatest(3600, v_camera.staff_memory_hours * 3600)
          )) desc,
      candidate.last_seen_at desc
    limit 1;

    if v_candidate_id is null then continue; end if;

    update public.event_person_memory_links
    set person_instance_id = v_candidate_id,
        link_kind = 'appearance_continuation',
        appearance_similarity = greatest(appearance_similarity, v_similarity),
        continuity_score = greatest(continuity_score, v_similarity),
        reasoning = reasoning || jsonb_build_object(
          'reconciledBy', 'phase13_staff_shift_v2',
          'nonBiometric', true,
          'sameOperationalShift', true
        )
    where person_instance_id = v_link.old_instance_id;

    update public.event_people
    set operational_role = 'staff',
        role = 'staff'
    where id in (
      select link.event_person_id
      from public.event_person_memory_links link
      where link.person_instance_id = v_candidate_id
    );

    insert into public.operational_session_participants (
      organization_id, session_id, person_instance_id, staff_profile_id,
      participant_role, first_event_id, last_event_id, first_seen_at,
      last_seen_at, confidence, metadata, created_at, updated_at
    )
    select
      participant.organization_id,
      participant.session_id,
      v_candidate_id,
      participant.staff_profile_id,
      'staff',
      participant.first_event_id,
      participant.last_event_id,
      participant.first_seen_at,
      participant.last_seen_at,
      participant.confidence,
      participant.metadata || jsonb_build_object(
        'reconciledBy', 'phase13_staff_shift_v2'
      ),
      participant.created_at,
      now()
    from public.operational_session_participants participant
    where participant.person_instance_id = v_link.old_instance_id
    on conflict (session_id, person_instance_id) do update
    set first_seen_at = least(
          public.operational_session_participants.first_seen_at,
          excluded.first_seen_at
        ),
        last_seen_at = greatest(
          public.operational_session_participants.last_seen_at,
          excluded.last_seen_at
        ),
        confidence = greatest(
          public.operational_session_participants.confidence,
          excluded.confidence
        ),
        updated_at = now();

    delete from public.operational_session_participants
    where person_instance_id = v_link.old_instance_id;

    update public.person_memory_instances target
    set first_seen_at = least(target.first_seen_at, source.first_seen_at),
        last_seen_at = greatest(target.last_seen_at, source.last_seen_at),
        expires_at = greatest(target.expires_at, source.expires_at),
        canonical_appearance = case
          when source.appearance_confidence > target.appearance_confidence
            then source.canonical_appearance
          else target.canonical_appearance
        end,
        appearance_confidence = greatest(
          target.appearance_confidence,
          source.appearance_confidence
        ),
        observation_count = target.observation_count + source.observation_count,
        active = target.active or source.active,
        updated_at = now()
    from public.person_memory_instances source
    where target.id = v_candidate_id
      and source.id = v_link.old_instance_id;

    delete from public.person_memory_instances
    where id = v_link.old_instance_id
      and not exists (
        select 1 from public.event_person_memory_links link
        where link.person_instance_id = v_link.old_instance_id
      );

    v_merged := v_merged + 1;
  end loop;

  v_group_id := v_event.interaction_group_id;
  if v_group_id is not null then
    select
      count(distinct link.person_instance_id)::integer,
      count(distinct link.person_instance_id) filter (
        where person.operational_role in ('customer','delivery_person')
          and person.engaged_at_counter
      )::integer,
      count(distinct link.person_instance_id) filter (
        where person.operational_role = 'staff'
      )::integer
      into v_people_count, v_customer_count, v_staff_count
    from public.interaction_group_events group_event
    join public.event_person_memory_links link
      on link.event_id = group_event.event_id
    join public.event_people person
      on person.id = link.event_person_id
    where group_event.interaction_group_id = v_group_id;

    update public.interaction_groups
    set probable_people_count = coalesce(v_people_count, 0),
        probable_customer_count = coalesce(v_customer_count, 0),
        probable_staff_count = coalesce(v_staff_count, 0),
        updated_at = now()
    where id = v_group_id;

    update public.events event_row
    set probable_people_count = coalesce(v_people_count, 0),
        probable_customer_count = coalesce(v_customer_count, 0),
        probable_staff_count = coalesce(v_staff_count, 0),
        updated_at = now()
    where event_row.interaction_group_id = v_group_id;
  end if;

  v_session_id := v_event.operational_session_id;
  if v_session_id is not null then
    select
      count(*)::integer,
      count(*) filter (
        where participant_role in ('customer','delivery_person')
      )::integer,
      count(*) filter (where participant_role = 'staff')::integer
      into v_people_count, v_customer_count, v_staff_count
    from public.operational_session_participants
    where session_id = v_session_id;

    update public.operational_sessions
    set probable_people_count = coalesce(v_people_count, 0),
        probable_customer_count = coalesce(v_customer_count, 0),
        probable_staff_count = coalesce(v_staff_count, 0),
        updated_at = now()
    where id = v_session_id;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(
      case
        when jsonb_typeof(v_event.analyzed_payload->'sessionSignals') = 'array'
          then v_event.analyzed_payload->'sessionSignals'
        else '[]'::jsonb
      end
    ) as item(signal)
    where signal->>'type' = 'departure'
      and signal->>'actorRole' in ('customer','delivery_person')
  ) then
    update public.interaction_groups
    set status = 'closed', ended_at = last_event_at, updated_at = now()
    where id = v_group_id;
  end if;

  return jsonb_build_object(
    'eventId', p_event_id,
    'staffInstancesMerged', v_merged
  );
end;
$$;

revoke all on function public.reconcile_event_people_memory_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_event_people_memory_v2(uuid)
  to service_role;

create or replace function public.reconcile_event_vehicle_memory_v2(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_camera public.cameras%rowtype;
  v_link record;
  v_candidate_id uuid;
  v_score numeric;
  v_merged integer := 0;
begin
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then raise exception 'event_not_found'; end if;
  select * into v_camera from public.cameras where id = v_event.camera_id;

  if v_event.primary_event_type not in ('vehicle_present','vehicle_stopped') then
    return jsonb_build_object('eventId', p_event_id, 'vehicleInstancesMerged', 0);
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event.camera_id::text || ':vehicle-reconcile-v2', 0)
  );

  for v_link in
    select
      link.vehicle_instance_id as old_instance_id,
      vehicle.vehicle_type,
      vehicle.zone_ids,
      vehicle.appearance,
      vehicle.appearance_confidence
    from public.event_vehicle_memory_links link
    join public.event_vehicles vehicle on vehicle.id = link.event_vehicle_id
    where link.event_id = p_event_id
      and link.link_kind = 'new_instance'
  loop
    v_candidate_id := null;
    v_score := 0;

    select candidate.id, candidate.score
      into v_candidate_id, v_score
    from (
      select
        instance.id,
        (
          case
            when instance.vehicle_type = v_link.vehicle_type then 0.36
            when instance.vehicle_type = 'unknown' or v_link.vehicle_type = 'unknown' then 0.16
            else 0
          end
          + case when instance.last_zone_ids && v_link.zone_ids then 0.24 else 0 end
          + case
              when private.monitoria_known_value_compatible(
                instance.canonical_appearance->>'colorFamily',
                v_link.appearance->>'colorFamily'
              ) then 0.16 else 0
            end
          + case
              when private.monitoria_known_value_compatible(
                instance.canonical_appearance->>'bodyStyle',
                v_link.appearance->>'bodyStyle'
              ) then 0.12 else 0
            end
          + case
              when extract(epoch from (v_event.started_at - instance.last_seen_at)) <= 900
                then 0.12
              else 0.06
            end
        )::numeric as score,
        instance.last_seen_at
      from public.vehicle_memory_instances instance
      where instance.organization_id = v_event.organization_id
        and instance.camera_id = v_event.camera_id
        and instance.id <> v_link.old_instance_id
        and instance.first_seen_at < v_event.started_at
        and instance.last_seen_at >= v_event.started_at
          - pg_catalog.make_interval(
              mins => greatest(10, v_camera.vehicle_memory_window_minutes)
            )
        and (
          instance.vehicle_type = v_link.vehicle_type
          or instance.vehicle_type = 'unknown'
          or v_link.vehicle_type = 'unknown'
        )
        and private.monitoria_known_value_compatible(
          instance.canonical_appearance->>'colorFamily',
          v_link.appearance->>'colorFamily'
        )
        and private.monitoria_known_value_compatible(
          instance.canonical_appearance->>'bodyStyle',
          v_link.appearance->>'bodyStyle'
        )
        and not exists (
          select 1 from public.event_vehicle_memory_links current_link
          where current_link.event_id = p_event_id
            and current_link.vehicle_instance_id = instance.id
        )
    ) candidate
    where candidate.score >= 0.58
    order by candidate.score desc, candidate.last_seen_at desc
    limit 1;

    if v_candidate_id is null then continue; end if;

    update public.event_vehicle_memory_links
    set vehicle_instance_id = v_candidate_id,
        link_kind = 'parking_continuation',
        similarity_score = greatest(similarity_score, v_score),
        reasoning = reasoning || jsonb_build_object(
          'reconciledBy', 'phase13_stationary_vehicle_v2',
          'stationaryContext', true,
          'plateUsed', false
        )
    where vehicle_instance_id = v_link.old_instance_id;

    update public.event_vehicles
    set vehicle_instance_id = v_candidate_id,
        vehicle_similarity = greatest(vehicle_similarity, v_score)
    where vehicle_instance_id = v_link.old_instance_id;

    update public.vehicle_memory_instances target
    set first_seen_at = least(target.first_seen_at, source.first_seen_at),
        last_seen_at = greatest(target.last_seen_at, source.last_seen_at),
        expires_at = greatest(target.expires_at, source.expires_at),
        last_event_id = case
          when source.last_seen_at > target.last_seen_at then source.last_event_id
          else target.last_event_id
        end,
        canonical_appearance = case
          when source.appearance_confidence > target.appearance_confidence
            then source.canonical_appearance
          else target.canonical_appearance
        end,
        appearance_confidence = greatest(
          target.appearance_confidence,
          source.appearance_confidence
        ),
        observation_count = target.observation_count + source.observation_count,
        active = target.active or source.active,
        updated_at = now()
    from public.vehicle_memory_instances source
    where target.id = v_candidate_id
      and source.id = v_link.old_instance_id;

    delete from public.vehicle_memory_instances
    where id = v_link.old_instance_id
      and not exists (
        select 1 from public.event_vehicle_memory_links link
        where link.vehicle_instance_id = v_link.old_instance_id
      );

    v_merged := v_merged + 1;
  end loop;

  update public.events
  set probable_distinct_vehicle_count = (
        select count(distinct link.vehicle_instance_id)
        from public.event_vehicle_memory_links link
        where link.event_id = p_event_id
      ),
      updated_at = now()
  where id = p_event_id;

  return jsonb_build_object(
    'eventId', p_event_id,
    'vehicleInstancesMerged', v_merged
  );
end;
$$;

revoke all on function public.reconcile_event_vehicle_memory_v2(uuid)
  from public, anon, authenticated;
grant execute on function public.reconcile_event_vehicle_memory_v2(uuid)
  to service_role;

create or replace function public.assistant_calibrated_activity_summary_v1(
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
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'forbidden';
  end if;

  with selected_events as (
    select event.id, event.started_at, event.ended_at
    from public.events event
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.started_at >= p_from
      and event.started_at < p_to
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
  ),
  selected_people as (
    select person.*, link.person_instance_id
    from public.event_people person
    join selected_events event on event.id = person.event_id
    left join public.event_person_memory_links link
      on link.event_person_id = person.id
  ),
  selected_vehicles as (
    select vehicle.*, link.vehicle_instance_id
    from public.event_vehicles vehicle
    join selected_events event on event.id = vehicle.event_id
    left join public.event_vehicle_memory_links link
      on link.event_vehicle_id = vehicle.id
  )
  select jsonb_build_object(
    'eventCount', (select count(*) from selected_events),
    'staffAppearances', (
      select count(*) from selected_people
      where operational_role = 'staff'
    ),
    'probableDistinctStaff', (
      select count(distinct person_instance_id) from selected_people
      where operational_role = 'staff'
        and person_instance_id is not null
    ),
    'qualifiedCustomerAppearances', (
      select count(*) from selected_people
      where operational_role in ('customer','delivery_person')
        and engaged_at_counter
    ),
    'qualifiedCustomerVisits', (
      select count(distinct person_instance_id) from selected_people
      where operational_role in ('customer','delivery_person')
        and engaged_at_counter
        and person_instance_id is not null
    ),
    'outsideOrPasserAppearances', (
      select count(*) from selected_people
      where operational_role = 'visitor'
        and not engaged_at_counter
    ),
    'rawVehicleAppearances', (select count(*) from selected_vehicles),
    'probableDistinctParkedVehicles', (
      select count(distinct vehicle_instance_id) from selected_vehicles
      where vehicle_instance_id is not null
    ),
    'visualStateObservations', (
      select count(*)
      from public.visual_state_observations observation
      join selected_events event on event.id = observation.event_id
    ),
    'firstObservedAt', (select min(started_at) from selected_events),
    'lastObservedAt', (select max(ended_at) from selected_events),
    'countingRules', jsonb_build_array(
      'Aparições repetidas não são somadas como novos funcionários.',
      'Cliente qualificado precisa alcançar o balcão com sinal visual de atendimento.',
      'Pessoas na rua, simples passagens e visitas ao estabelecimento vizinho ficam fora da contagem de clientes.',
      'Veículos estacionados compatíveis são agrupados sem usar placa.'
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.assistant_calibrated_activity_summary_v1(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;
grant execute on function public.assistant_calibrated_activity_summary_v1(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

-- Novos valores conservadores: mantêm movimento real e juntam pausas curtas.
alter table public.cameras
  alter column event_close_after_seconds set default 25;

update public.cameras
set event_close_after_seconds = case analysis_plan_code
      when 'intensive' then 25
      when 'standard' then 20
      else greatest(event_close_after_seconds, 30)
    end,
    continuity_min_similarity = case
      when continuity_min_similarity = 0.720 then 0.660
      else continuity_min_similarity
    end,
    vehicle_similarity_threshold = case
      when vehicle_similarity_threshold = 0.760 then 0.620
      else vehicle_similarity_threshold
    end,
    updated_at = now()
where event_close_after_seconds in (8, 15, 45)
   or continuity_min_similarity = 0.720
   or vehicle_similarity_threshold = 0.760;

-- Reclassifica apenas metadados recentes; imagens, revisões e eventos permanecem intactos.
update public.event_people person
set model_role = person.role,
    operational_role = case
      when person.role = 'staff' then 'staff'
      when person.role in ('customer','delivery_person')
        and exists (
          select 1 from public.camera_zones zone
          where zone.id = any(person.zone_ids)
            and zone.person_role_hint = 'shared'
        )
        and exists (
          select 1
          from public.events event,
          lateral jsonb_array_elements(
            case
              when jsonb_typeof(event.analyzed_payload->'sessionSignals') = 'array'
                then event.analyzed_payload->'sessionSignals'
              else '[]'::jsonb
            end
          ) as item(signal)
          where event.id = person.event_id
            and signal->>'type' in (
              'waiting','service_started','service_continued',
              'terminal_activity','object_handoff_to_staff',
              'object_handoff_to_customer'
            )
        )
        then person.role
      when person.role in ('customer','delivery_person') then 'visitor'
      else person.role
    end,
    engaged_at_counter = person.role in ('customer','delivery_person')
      and exists (
        select 1 from public.camera_zones zone
        where zone.id = any(person.zone_ids)
          and zone.person_role_hint = 'shared'
      )
      and exists (
        select 1
        from public.events event,
        lateral jsonb_array_elements(
          case
            when jsonb_typeof(event.analyzed_payload->'sessionSignals') = 'array'
              then event.analyzed_payload->'sessionSignals'
            else '[]'::jsonb
          end
        ) as item(signal)
        where event.id = person.event_id
          and signal->>'type' in (
            'waiting','service_started','service_continued',
            'terminal_activity','object_handoff_to_staff',
            'object_handoff_to_customer'
          )
      ),
    operational_role_reason = 'phase13_historical_backfill'
from public.events event
where event.id = person.event_id
  and event.started_at >= now() - interval '30 days';

update public.event_people
set role = operational_role
where operational_role_reason = 'phase13_historical_backfill';

do $$
declare
  v_event record;
begin
  for v_event in
    select event.id
    from public.events event
    where event.started_at >= now() - interval '30 days'
      and event.deleted_at is null
    order by event.started_at, event.id
  loop
    perform public.reconcile_event_people_memory_v2(v_event.id);
    perform public.reconcile_event_vehicle_memory_v2(v_event.id);
  end loop;
end
$$;

commit;
