alter table public.analysis_jobs
  add column if not exists source_agent_id uuid null,
  add column if not exists agent_event_id uuid null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_jobs_source_agent_id_fkey'
  ) then
    alter table public.analysis_jobs
      add constraint analysis_jobs_source_agent_id_fkey
      foreign key (source_agent_id)
      references public.agents(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_jobs_camera_agent_event_key'
  ) then
    alter table public.analysis_jobs
      add constraint analysis_jobs_camera_agent_event_key
      unique (camera_id, agent_event_id);
  end if;
end
$$;

create index if not exists analysis_jobs_source_agent_id_idx
  on public.analysis_jobs(source_agent_id)
  where source_agent_id is not null;

create unique index if not exists capture_sessions_one_open_per_agent_camera_idx
  on public.capture_sessions(agent_id, camera_id)
  where ended_at is null;

create or replace function public.complete_agent_analysis_job(
  p_job_id uuid,
  p_analyzed_event jsonb,
  p_provider text,
  p_model text,
  p_response_id text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_latency_ms integer,
  p_estimated_cost_usd numeric,
  p_event_expires_at timestamptz,
  p_keyframe_expires_at timestamptz
)
returns table(event_id uuid, relevant boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.analysis_jobs%rowtype;
  v_event_id uuid;
  v_person jsonb;
  v_vehicle jsonb;
  v_vehicle_id uuid;
  v_plate jsonb;
  v_relevant boolean;
  v_frames_observed bigint;
begin
  if jsonb_typeof(p_analyzed_event) <> 'object' then
    raise exception 'invalid_analyzed_event';
  end if;

  select *
    into v_job
  from public.analysis_jobs aj
  where aj.id = p_job_id
  for update;

  if not found then
    raise exception 'analysis_job_not_found';
  end if;

  if v_job.status = 'completed'::public.analysis_job_status then
    select e.id into v_event_id
    from public.events e
    where e.analysis_job_id = p_job_id;

    return query
    select v_event_id, (v_event_id is not null);
    return;
  end if;

  v_relevant :=
    coalesce(p_analyzed_event->>'primaryEventType', '') <>
    'no_relevant_change';

  v_frames_observed := greatest(
    0,
    coalesce(
      (v_job.local_metrics->>'framesObserved')::bigint,
      0
    )
  );

  update public.analysis_jobs
  set status = 'completed'::public.analysis_job_status,
      provider = nullif(trim(p_provider), ''),
      model = nullif(trim(p_model), ''),
      response_id = nullif(trim(p_response_id), ''),
      input_tokens = greatest(0, coalesce(p_input_tokens, 0)),
      output_tokens = greatest(0, coalesce(p_output_tokens, 0)),
      latency_ms = greatest(0, coalesce(p_latency_ms, 0)),
      last_error = null,
      updated_at = now()
  where id = p_job_id;

  insert into public.usage_events (
    organization_id,
    camera_id,
    analysis_job_id,
    provider,
    model,
    input_tokens,
    output_tokens,
    estimated_cost_usd,
    metadata
  ) values (
    v_job.organization_id,
    v_job.camera_id,
    p_job_id,
    p_provider,
    p_model,
    greatest(0, coalesce(p_input_tokens, 0)),
    greatest(0, coalesce(p_output_tokens, 0)),
    p_estimated_cost_usd,
    jsonb_build_object(
      'purpose', 'continuous_event',
      'response_id', p_response_id,
      'latency_ms', greatest(0, coalesce(p_latency_ms, 0)),
      'agent_event_id', v_job.agent_event_id
    )
  );

  if not v_relevant then
    update public.storage_assets
    set expires_at = p_keyframe_expires_at
    where analysis_job_id = p_job_id;

    if v_job.capture_session_id is not null then
      update public.capture_sessions
      set frames_observed =
        frames_observed + v_frames_observed
      where id = v_job.capture_session_id;
    end if;

    return query select null::uuid, false;
    return;
  end if;

  insert into public.events (
    organization_id,
    site_id,
    camera_id,
    analysis_job_id,
    profile_id,
    profile_version,
    schema_version,
    started_at,
    ended_at,
    primary_event_type,
    summary,
    confidence,
    requires_review,
    review_status,
    review_reasons,
    zone_ids,
    tags,
    analyzed_payload,
    expires_at,
    updated_at
  ) values (
    v_job.organization_id,
    (
      select c.site_id
      from public.cameras c
      where c.id = v_job.camera_id
    ),
    v_job.camera_id,
    p_job_id,
    v_job.profile_id,
    v_job.profile_version,
    coalesce(
      nullif(p_analyzed_event->>'schemaVersion', ''),
      '1.0'
    ),
    v_job.started_at,
    v_job.ended_at,
    p_analyzed_event->>'primaryEventType',
    left(
      coalesce(p_analyzed_event->>'summary', ''),
      800
    ),
    greatest(
      0,
      least(
        1,
        coalesce(
          (p_analyzed_event->>'confidence')::numeric,
          0
        )
      )
    ),
    coalesce(
      (p_analyzed_event->>'requiresReview')::boolean,
      false
    ),
    case
      when coalesce(
        (p_analyzed_event->>'requiresReview')::boolean,
        false
      )
        then 'pending'::public.review_status
      else 'not_required'::public.review_status
    end,
    coalesce(
      p_analyzed_event->'reviewReasons',
      '[]'::jsonb
    ),
    coalesce(
      array(
        select zone_id::uuid
        from jsonb_array_elements_text(
          coalesce(
            p_analyzed_event->'zoneIds',
            '[]'::jsonb
          )
        ) as zones(zone_id)
      ),
      '{}'::uuid[]
    ),
    coalesce(
      array(
        select tag
        from jsonb_array_elements_text(
          coalesce(
            p_analyzed_event->'tags',
            '[]'::jsonb
          )
        ) as tags(tag)
      ),
      '{}'::text[]
    ),
    p_analyzed_event,
    p_event_expires_at,
    now()
  )
  returning id into v_event_id;

  for v_person in
    select value
    from jsonb_array_elements(
      coalesce(
        p_analyzed_event->'people',
        '[]'::jsonb
      )
    )
  loop
    insert into public.event_people (
      organization_id,
      event_id,
      local_track_id,
      upper_clothing_color,
      lower_clothing_color,
      accessories,
      carrying,
      zone_ids,
      confidence
    ) values (
      v_job.organization_id,
      v_event_id,
      nullif(trim(v_person->>'localTrackId'), ''),
      nullif(trim(v_person->>'upperClothingColor'), ''),
      nullif(trim(v_person->>'lowerClothingColor'), ''),
      coalesce(
        array(
          select accessory
          from jsonb_array_elements_text(
            coalesce(
              v_person->'accessories',
              '[]'::jsonb
            )
          ) as accessories(accessory)
        ),
        '{}'::text[]
      ),
      coalesce(
        array(
          select carried
          from jsonb_array_elements_text(
            coalesce(
              v_person->'carrying',
              '[]'::jsonb
            )
          ) as carrying(carried)
        ),
        '{}'::text[]
      ),
      coalesce(
        array(
          select zone_id::uuid
          from jsonb_array_elements_text(
            coalesce(
              v_person->'zoneIds',
              '[]'::jsonb
            )
          ) as zones(zone_id)
        ),
        '{}'::uuid[]
      ),
      greatest(
        0,
        least(
          1,
          coalesce(
            (v_person->>'confidence')::numeric,
            0
          )
        )
      )
    );
  end loop;

  for v_vehicle in
    select value
    from jsonb_array_elements(
      coalesce(
        p_analyzed_event->'vehicles',
        '[]'::jsonb
      )
    )
  loop
    insert into public.event_vehicles (
      organization_id,
      event_id,
      local_track_id,
      vehicle_type,
      color,
      zone_ids,
      confidence
    ) values (
      v_job.organization_id,
      v_event_id,
      nullif(trim(v_vehicle->>'localTrackId'), ''),
      coalesce(
        nullif(trim(v_vehicle->>'type'), ''),
        'unknown'
      ),
      nullif(trim(v_vehicle->>'color'), ''),
      coalesce(
        array(
          select zone_id::uuid
          from jsonb_array_elements_text(
            coalesce(
              v_vehicle->'zoneIds',
              '[]'::jsonb
            )
          ) as zones(zone_id)
        ),
        '{}'::uuid[]
      ),
      greatest(
        0,
        least(
          1,
          coalesce(
            (v_vehicle->>'confidence')::numeric,
            0
          )
        )
      )
    )
    returning id into v_vehicle_id;

    v_plate := v_vehicle->'plateSuggestion';

    if
      v_plate is not null
      and v_plate <> 'null'::jsonb
    then
      insert into public.event_plate_suggestions (
        organization_id,
        event_vehicle_id,
        suggested_text,
        normalized_text,
        confidence,
        visibility,
        status
      ) values (
        v_job.organization_id,
        v_vehicle_id,
        nullif(trim(v_plate->>'text'), ''),
        case
          when nullif(trim(v_plate->>'text'), '') is null
            then null
          else upper(
            regexp_replace(
              v_plate->>'text',
              '[^A-Za-z0-9]',
              '',
              'g'
            )
          )
        end,
        greatest(
          0,
          least(
            1,
            coalesce(
              (v_plate->>'confidence')::numeric,
              0
            )
          )
        ),
        coalesce(
          nullif(trim(v_plate->>'visibility'), ''),
          'not_visible'
        ),
        'suggestion'
      );
    end if;
  end loop;

  update public.storage_assets
  set event_id = v_event_id,
      expires_at = p_keyframe_expires_at
  where analysis_job_id = p_job_id;

  if v_job.capture_session_id is not null then
    update public.capture_sessions
    set frames_observed =
          frames_observed + v_frames_observed,
        events_created =
          events_created + 1
    where id = v_job.capture_session_id;
  end if;

  return query select v_event_id, true;
end;
$$;

revoke all on function public.complete_agent_analysis_job(
  uuid,
  jsonb,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  numeric,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.complete_agent_analysis_job(
  uuid,
  jsonb,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  numeric,
  timestamptz,
  timestamptz
) to service_role;
