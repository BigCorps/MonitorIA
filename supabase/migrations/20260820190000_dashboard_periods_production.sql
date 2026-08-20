-- MonitorIA — Dashboard de Produção / Etapa 3 — Períodos
--
-- Reconcilia Períodos com a avaliação humana dos Acontecimentos sem apagar
-- os vínculos históricos. Toda mudança é reversível ao editar a avaliação.

begin;

create or replace function private.monitoria_event_visible_after_review(
  p_event_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.events event
    where event.id = p_event_id
      and event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
  );
$function$;

create or replace function private.monitoria_session_has_visible_event(
  p_session_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.operational_session_events chapter
    join public.events event
      on event.id = chapter.event_id
    where chapter.session_id = p_session_id
      and chapter.organization_id = p_organization_id
      and event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
  );
$function$;

create or replace function private.monitoria_session_participant_visible(
  p_session_id uuid,
  p_person_instance_id uuid,
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.event_person_memory_links link
    join public.events event
      on event.id = link.event_id
    where link.person_instance_id = p_person_instance_id
      and event.organization_id = p_organization_id
      and event.operational_session_id = p_session_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
  );
$function$;

create or replace function private.monitoria_session_outcome_visible(
  p_session_id uuid,
  p_evidence_event_ids uuid[],
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from pg_catalog.unnest(
      coalesce(p_evidence_event_ids, '{}'::uuid[])
    ) evidence(event_id)
    join public.events event
      on event.id = evidence.event_id
    where event.organization_id = p_organization_id
      and event.operational_session_id = p_session_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
  );
$function$;

revoke all on function private.monitoria_event_visible_after_review(uuid, uuid)
  from public, anon;
revoke all on function private.monitoria_session_has_visible_event(uuid, uuid)
  from public, anon;
revoke all on function private.monitoria_session_participant_visible(uuid, uuid, uuid)
  from public, anon;
revoke all on function private.monitoria_session_outcome_visible(uuid, uuid[], uuid)
  from public, anon;

grant execute on function private.monitoria_event_visible_after_review(uuid, uuid)
  to authenticated, monitoria_mcp_readonly, service_role;
grant execute on function private.monitoria_session_has_visible_event(uuid, uuid)
  to authenticated, monitoria_mcp_readonly, service_role;
grant execute on function private.monitoria_session_participant_visible(uuid, uuid, uuid)
  to authenticated, monitoria_mcp_readonly, service_role;
grant execute on function private.monitoria_session_outcome_visible(uuid, uuid[], uuid)
  to authenticated, monitoria_mcp_readonly, service_role;

drop policy if exists operational_sessions_review_visibility
  on public.operational_sessions;
create policy operational_sessions_review_visibility
on public.operational_sessions
as restrictive
for select
to authenticated, monitoria_mcp_readonly
using (
  private.monitoria_session_has_visible_event(id, organization_id)
);

drop policy if exists operational_session_events_review_visibility
  on public.operational_session_events;
create policy operational_session_events_review_visibility
on public.operational_session_events
as restrictive
for select
to authenticated, monitoria_mcp_readonly
using (
  private.monitoria_event_visible_after_review(event_id, organization_id)
);

drop policy if exists operational_session_participants_review_visibility
  on public.operational_session_participants;
create policy operational_session_participants_review_visibility
on public.operational_session_participants
as restrictive
for select
to authenticated, monitoria_mcp_readonly
using (
  private.monitoria_session_participant_visible(
    session_id,
    person_instance_id,
    organization_id
  )
);

drop policy if exists operational_session_outcomes_review_visibility
  on public.operational_session_outcomes;
create policy operational_session_outcomes_review_visibility
on public.operational_session_outcomes
as restrictive
for select
to authenticated, monitoria_mcp_readonly
using (
  private.monitoria_session_outcome_visible(
    session_id,
    evidence_event_ids,
    organization_id
  )
);

create or replace function private.monitoria_effective_chapter_type(
  p_signal_summary jsonb,
  p_primary_event_type text,
  p_human_verdict text,
  p_corrected_event_type text
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_signals jsonb := case
    when pg_catalog.jsonb_typeof(p_signal_summary->'signals') = 'array'
      then p_signal_summary->'signals'
    else '[]'::jsonb
  end;
  v_effective_event_type text := coalesce(
    case
      when p_human_verdict = 'incorrect'
        then nullif(p_corrected_event_type, '')
      else null
    end,
    p_primary_event_type,
    'other'
  );
begin
  if p_human_verdict = 'incorrect' then
    return case v_effective_event_type
      when 'person_entered' then 'arrival'
      when 'vehicle_entered' then 'arrival'
      when 'person_exited' then 'departure'
      when 'vehicle_exited' then 'departure'
      when 'person_present' then 'presence'
      when 'vehicle_present' then 'presence'
      when 'vehicle_stopped' then 'presence'
      when 'zone_intrusion' then 'restricted_access'
      when 'object_appeared' then 'state_change'
      when 'object_removed' then 'state_change'
      when 'object_moved' then 'state_change'
      when 'scene_change' then 'state_change'
      else 'other'
    end;
  end if;

  if coalesce(p_signal_summary->'openTransition', 'false'::jsonb)
       = 'true'::jsonb
     or v_signals @? '$[*] ? (@.type == "opening_step")' then
    return 'opening_step';
  end if;

  if coalesce(p_signal_summary->'closeTransition', 'false'::jsonb)
       = 'true'::jsonb
     or v_signals @? '$[*] ? (@.type == "closing_step")' then
    return 'closing_step';
  end if;

  if v_signals @? '$[*] ? (@.type == "object_handoff_to_staff" || @.type == "object_handoff_to_customer")' then
    return 'object_handoff';
  end if;

  if v_signals @? '$[*] ? (@.type == "departure")' then
    return 'departure';
  end if;

  if v_signals @? '$[*] ? (@.type == "arrival")' then
    return 'arrival';
  end if;

  if v_signals @? '$[*] ? (@.type == "waiting")' then
    return 'waiting';
  end if;

  if v_signals @? '$[*] ? (@.type == "service_started")' then
    return 'service_started';
  end if;

  if v_signals @? '$[*] ? (@.type == "terminal_activity")' then
    return 'terminal_activity';
  end if;

  if v_signals @? '$[*] ? (@.type == "service_continued")' then
    return 'service_continued';
  end if;

  if coalesce(p_signal_summary->'equipmentObservation', 'false'::jsonb)
       = 'true'::jsonb
     or v_signals @? '$[*] ? (@.type == "equipment_activity")' then
    return 'equipment_activity';
  end if;

  if v_signals @? '$[*] ? (@.type == "restricted_access")'
     or p_primary_event_type = 'zone_intrusion' then
    return 'restricted_access';
  end if;

  if v_signals @? '$[*] ? (@.type == "state_change")' then
    return 'state_change';
  end if;

  if p_primary_event_type in ('person_present', 'vehicle_present') then
    return 'presence';
  end if;

  return 'other';
end;
$function$;

revoke all on function private.monitoria_effective_chapter_type(
  jsonb, text, text, text
) from public, anon, authenticated, monitoria_mcp_readonly;

grant execute on function private.monitoria_effective_chapter_type(
  jsonb, text, text, text
) to service_role;

create or replace function private.refresh_operational_session_review_rollup_v1(
  p_session_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.operational_sessions%rowtype;
  v_camera public.cameras%rowtype;
  v_started_at timestamptz;
  v_ended_at timestamptz;
  v_duration_seconds numeric := 0;
  v_chapter_count integer := 0;
  v_confidence numeric := 0;
  v_memory_people integer := 0;
  v_memory_customers integer := 0;
  v_memory_staff integer := 0;
  v_fallback_people integer := 0;
  v_fallback_customers integer := 0;
  v_fallback_staff integer := 0;
  v_people_count integer := 0;
  v_customer_count integer := 0;
  v_staff_count integer := 0;
  v_has_opening boolean := false;
  v_has_closing boolean := false;
  v_has_restricted boolean := false;
  v_has_handoff boolean := false;
  v_has_equipment boolean := false;
  v_session_type text;
  v_title text;
  v_summary text;
  v_status text;
  v_closure_reason text;
  v_outcome_code text;
  v_outcome_confidence numeric := 0;
  v_outcome_found boolean := false;
begin
  select *
    into v_session
  from public.operational_sessions
  where id = p_session_id
  for update;

  if not found then
    return false;
  end if;

  select *
    into v_camera
  from public.cameras
  where id = v_session.camera_id;

  update public.operational_session_events chapter
  set chapter_type = private.monitoria_effective_chapter_type(
        chapter.signal_summary,
        event.primary_event_type,
        event.human_verdict,
        event.corrected_event_type
      ),
      is_key_chapter = (
        private.monitoria_effective_chapter_type(
          chapter.signal_summary,
          event.primary_event_type,
          event.human_verdict,
          event.corrected_event_type
        ) in (
          'arrival',
          'departure',
          'service_started',
          'object_handoff',
          'opening_step',
          'closing_step',
          'restricted_access'
        )
      )
  from public.events event
  where chapter.session_id = p_session_id
    and chapter.event_id = event.id
    and event.deleted_at is null;

  select
    min(event.started_at),
    max(event.ended_at),
    count(*)::integer,
    coalesce(avg(chapter.confidence), 0),
    coalesce(bool_or(chapter.chapter_type = 'opening_step'), false),
    coalesce(bool_or(chapter.chapter_type = 'closing_step'), false),
    coalesce(bool_or(chapter.chapter_type = 'restricted_access'), false),
    coalesce(bool_or(chapter.chapter_type = 'object_handoff'), false),
    coalesce(bool_or(chapter.chapter_type = 'equipment_activity'), false)
  into
    v_started_at,
    v_ended_at,
    v_chapter_count,
    v_confidence,
    v_has_opening,
    v_has_closing,
    v_has_restricted,
    v_has_handoff,
    v_has_equipment
  from public.operational_session_events chapter
  join public.events event
    on event.id = chapter.event_id
  where chapter.session_id = p_session_id
    and event.deleted_at is null
    and event.human_verdict is distinct from 'irrelevant';

  if coalesce(v_chapter_count, 0) = 0 then
    update public.operational_sessions
    set chapter_count = 0,
        probable_people_count = 0,
        probable_customer_count = 0,
        probable_staff_count = 0,
        confidence = 0,
        outcome_code = 'no_visible_outcome',
        outcome_confidence = 0,
        status = 'uncertain',
        closure_reason = 'human_review_removed_all_records',
        summary = 'Nenhum registro relevante permaneceu após a revisão.',
        metadata = metadata || pg_catalog.jsonb_build_object(
          'reviewHidden',
          true,
          'reviewRollupVersion',
          'dashboard_production_v1'
        ),
        updated_at = now()
    where id = p_session_id;

    update public.events
    set session_status = 'uncertain',
        session_chapter_count = 0,
        session_duration_seconds = 0,
        session_confidence = 0,
        session_summary = session_summary || pg_catalog.jsonb_build_object(
          'status',
          'uncertain',
          'chapterCount',
          0,
          'durationSeconds',
          0,
          'reviewReconciled',
          true
        ),
        updated_at = now()
    where operational_session_id = p_session_id;

    return true;
  end if;

  v_duration_seconds := greatest(
    0,
    pg_catalog.date_part('epoch', v_ended_at - v_started_at)
  );

  select
    count(distinct link.person_instance_id)::integer,
    count(distinct link.person_instance_id) filter (
      where instance.staff_profile_id is null
        and instance.probable_role in (
          'customer',
          'delivery_person',
          'visitor'
        )
    )::integer,
    count(distinct link.person_instance_id) filter (
      where instance.staff_profile_id is not null
        or instance.probable_role = 'staff'
    )::integer
  into
    v_memory_people,
    v_memory_customers,
    v_memory_staff
  from public.event_person_memory_links link
  join public.person_memory_instances instance
    on instance.id = link.person_instance_id
  join public.events event
    on event.id = link.event_id
  where event.operational_session_id = p_session_id
    and event.deleted_at is null
    and event.human_verdict is distinct from 'irrelevant';

  select
    coalesce(max(grouped.people_count), 0)::integer,
    coalesce(max(grouped.customer_count), 0)::integer,
    coalesce(max(grouped.staff_count), 0)::integer
  into
    v_fallback_people,
    v_fallback_customers,
    v_fallback_staff
  from (
    select
      person.event_id,
      count(*)::integer as people_count,
      count(*) filter (
        where person.role in (
          'customer',
          'delivery_person',
          'visitor'
        )
      )::integer as customer_count,
      count(*) filter (
        where person.role = 'staff'
      )::integer as staff_count
    from public.event_people person
    join public.events event
      on event.id = person.event_id
    where event.operational_session_id = p_session_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
    group by person.event_id
  ) grouped;

  if coalesce(v_memory_people, 0) > 0 then
    v_people_count := v_memory_people;
    v_customer_count := coalesce(v_memory_customers, 0);
    v_staff_count := coalesce(v_memory_staff, 0);
  else
    v_people_count := coalesce(v_fallback_people, 0);
    v_customer_count := coalesce(v_fallback_customers, 0);
    v_staff_count := coalesce(v_fallback_staff, 0);
  end if;

  with visible_participants as (
    select
      link.person_instance_id,
      (array_agg(event.id order by event.started_at, event.id))[1]
        as first_event_id,
      (array_agg(event.id order by event.ended_at desc, event.id desc))[1]
        as last_event_id,
      min(event.started_at) as first_seen_at,
      max(event.ended_at) as last_seen_at,
      max(
        greatest(
          coalesce(link.continuity_score, 0),
          coalesce(instance.appearance_confidence, 0)
        )
      ) as confidence
    from public.event_person_memory_links link
    join public.person_memory_instances instance
      on instance.id = link.person_instance_id
    join public.events event
      on event.id = link.event_id
    where event.operational_session_id = p_session_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
    group by link.person_instance_id
  )
  update public.operational_session_participants participant
  set first_event_id = visible.first_event_id,
      last_event_id = visible.last_event_id,
      first_seen_at = visible.first_seen_at,
      last_seen_at = visible.last_seen_at,
      confidence = greatest(
        participant.confidence,
        coalesce(visible.confidence, 0)
      ),
      updated_at = now()
  from visible_participants visible
  where participant.session_id = p_session_id
    and participant.person_instance_id = visible.person_instance_id;

  v_session_type := case
    when v_has_opening then 'opening_procedure'
    when v_has_closing then 'closing_procedure'
    when v_has_restricted then 'restricted_area_access'
    when v_has_handoff then 'delivery_or_pickup'
    when v_has_equipment
      and v_session.session_type not in (
        'customer_service',
        'visitor_stay'
      )
      then 'equipment_operation'
    when v_session.session_type in (
      'opening_procedure',
      'closing_procedure',
      'restricted_area_access',
      'delivery_or_pickup',
      'equipment_operation'
    )
      and v_customer_count > 0
      and v_staff_count > 0
      then 'customer_service'
    when v_session.session_type in (
      'opening_procedure',
      'closing_procedure',
      'restricted_area_access',
      'delivery_or_pickup',
      'equipment_operation'
    )
      and v_customer_count > 0
      then 'visitor_stay'
    when v_session.session_type in (
      'opening_procedure',
      'closing_procedure',
      'restricted_area_access',
      'delivery_or_pickup',
      'equipment_operation'
    )
      and v_staff_count > 0
      then 'staff_activity'
    when v_session.session_type in (
      'opening_procedure',
      'closing_procedure',
      'restricted_area_access',
      'delivery_or_pickup',
      'equipment_operation'
    )
      then 'other'
    else v_session.session_type
  end;

  v_title := case v_session_type
    when 'customer_service' then 'Atendimento no balcão'
    when 'delivery_or_pickup' then 'Entrega ou retirada no atendimento'
    when 'visitor_stay' then 'Permanência de visitante'
    when 'staff_activity' then 'Atividade da equipe'
    when 'equipment_operation' then 'Uso de equipamento'
    when 'restricted_area_access' then 'Acesso a área restrita'
    when 'opening_procedure' then 'Abertura do estabelecimento'
    when 'closing_procedure' then 'Fechamento do estabelecimento'
    else 'Atividade observada'
  end;

  v_summary := format(
    '%s registro(s) relacionado(s), %s cliente(s) ou visitante(s) provável(is) e %s integrante(s) da equipe provável(is).',
    v_chapter_count,
    coalesce(v_customer_count, 0),
    coalesce(v_staff_count, 0)
  );

  select
    outcome.outcome_code,
    outcome.confidence
  into
    v_outcome_code,
    v_outcome_confidence
  from public.operational_session_outcomes outcome
  where outcome.session_id = p_session_id
    and private.monitoria_session_outcome_visible(
      p_session_id,
      outcome.evidence_event_ids,
      v_session.organization_id
    )
  order by
    case
      when outcome.outcome_code = v_session.outcome_code then 0
      else 1
    end,
    outcome.confidence desc,
    outcome.updated_at desc
  limit 1;

  v_outcome_found := found;

  if not v_outcome_found then
    v_outcome_code := case
      when v_session.status = 'open' then 'in_progress'
      else 'no_visible_outcome'
    end;
    v_outcome_confidence := 0;
  end if;

  v_status := v_session.status;
  v_closure_reason := v_session.closure_reason;

  if v_outcome_code in (
    'establishment_opened',
    'establishment_closed',
    'interaction_ended_after_handoff',
    'service_ended_with_departure',
    'visitor_departed'
  ) then
    v_status := 'completed';
  elsif v_outcome_code = 'duration_limit_reached' then
    v_status := 'uncertain';
  elsif v_session.status = 'open'
        and v_ended_at < now()
          - pg_catalog.make_interval(
              mins => greatest(
                2,
                coalesce(v_camera.session_idle_close_minutes, 12)
              )
            ) then
    v_status := 'closed_by_inactivity';
    v_closure_reason := 'inactivity';
    if v_outcome_code = 'in_progress' then
      v_outcome_code := 'no_visible_outcome';
    end if;
  elsif v_session.status = 'completed'
        and not v_outcome_found then
    v_status := 'uncertain';
    v_closure_reason := 'human_review_removed_closing_evidence';
  end if;

  update public.operational_sessions
  set session_type = v_session_type,
      status = v_status,
      closure_reason = v_closure_reason,
      started_at = v_started_at,
      last_event_at = v_ended_at,
      ended_at = case
        when v_status = 'open' then null
        else v_ended_at
      end,
      duration_seconds = v_duration_seconds,
      title = v_title,
      summary = v_summary,
      chapter_count = v_chapter_count,
      probable_people_count = v_people_count,
      probable_customer_count = v_customer_count,
      probable_staff_count = v_staff_count,
      confidence = greatest(
        0,
        least(1, coalesce(v_confidence, 0))
      ),
      outcome_code = v_outcome_code,
      outcome_confidence = greatest(
        0,
        least(1, coalesce(v_outcome_confidence, 0))
      ),
      metadata = (
        metadata - 'reviewHidden'
      ) || pg_catalog.jsonb_build_object(
        'reviewRollupVersion',
        'dashboard_production_v1',
        'reviewReconciledAt',
        now()
      ),
      updated_at = now()
  where id = p_session_id;

  update public.events event
  set session_type = v_session_type,
      session_status = v_status,
      session_chapter_type = chapter.chapter_type,
      session_chapter_order = chapter.chapter_order,
      session_chapter_count = v_chapter_count,
      session_duration_seconds = v_duration_seconds,
      session_confidence = greatest(
        0,
        least(1, coalesce(v_confidence, 0))
      ),
      session_summary = pg_catalog.jsonb_build_object(
        'operationalSessionId',
        p_session_id,
        'sessionType',
        v_session_type,
        'status',
        v_status,
        'chapterType',
        chapter.chapter_type,
        'chapterOrder',
        chapter.chapter_order,
        'chapterCount',
        v_chapter_count,
        'durationSeconds',
        v_duration_seconds,
        'probablePeopleCount',
        v_people_count,
        'probableCustomerCount',
        v_customer_count,
        'probableStaffCount',
        v_staff_count,
        'outcomeCode',
        v_outcome_code,
        'method',
        'human_review_reconciled_v1'
      ),
      updated_at = now()
  from public.operational_session_events chapter
  where chapter.session_id = p_session_id
    and chapter.event_id = event.id;

  return true;
end;
$function$;

revoke all on function private.refresh_operational_session_review_rollup_v1(uuid)
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.refresh_operational_session_review_rollup_v1(uuid)
  to service_role;

create or replace function private.refresh_session_after_event_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session_id uuid;
begin
  if old.human_verdict is distinct from new.human_verdict
     or old.corrected_event_type is distinct from new.corrected_event_type then
    v_session_id := coalesce(
      new.operational_session_id,
      old.operational_session_id
    );

    if v_session_id is not null then
      perform private.refresh_operational_session_review_rollup_v1(
        v_session_id
      );
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_refresh_session_after_event_review
  on public.events;

create trigger trg_refresh_session_after_event_review
after update of human_verdict, corrected_event_type
on public.events
for each row
when (
  old.human_verdict is distinct from new.human_verdict
  or old.corrected_event_type is distinct from new.corrected_event_type
)
execute function private.refresh_session_after_event_review();

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
as $function$
  with filtered as (
    select
      session_row.id,
      session_row.started_at,
      coalesce(
        session_row.ended_at,
        session_row.last_event_at
      ) as ended_at,
      session_row.duration_seconds::numeric,
      session_row.camera_id,
      camera.name as camera_name,
      session_row.site_id,
      site.name as site_name,
      session_row.session_type,
      session_row.status,
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
        join public.events event
          on event.id = chapter.event_id
        join public.storage_assets asset
          on asset.event_id = chapter.event_id
        where chapter.session_id = session_row.id
          and event.deleted_at is null
          and event.human_verdict is distinct from 'irrelevant'
          and asset.status = 'ready'::public.asset_status
          and asset.deleted_at is null
        order by
          chapter.is_key_chapter desc,
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
      and session_row.chapter_count > 0
      and private.monitoria_session_has_visible_event(
        session_row.id,
        p_organization_id
      )
      and (p_from is null or session_row.started_at >= p_from)
      and (p_to is null or session_row.started_at < p_to)
      and (
        p_camera_id is null
        or session_row.camera_id = p_camera_id
      )
      and (
        p_site_id is null
        or session_row.site_id = p_site_id
      )
      and (
        nullif(
          pg_catalog.btrim(coalesce(p_session_type, '')),
          ''
        ) is null
        or session_row.session_type = p_session_type
      )
      and (
        nullif(
          pg_catalog.btrim(coalesce(p_status, '')),
          ''
        ) is null
        or p_status = 'all'
        or session_row.status = p_status
      )
  )
  select
    filtered.*,
    pg_catalog.count(*) over() as total_count
  from filtered
  order by filtered.started_at desc
  limit greatest(
    1,
    least(coalesce(p_limit, 50), 200)
  )
  offset greatest(0, coalesce(p_offset, 0));
$function$;

revoke all on function public.search_operational_sessions(
  uuid, timestamptz, timestamptz, uuid, uuid,
  text, text, integer, integer
) from public, anon;

grant execute on function public.search_operational_sessions(
  uuid, timestamptz, timestamptz, uuid, uuid,
  text, text, integer, integer
) to authenticated, monitoria_mcp_readonly, service_role;

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
as $function$
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
      and session_row.chapter_count > 0
      and private.monitoria_session_has_visible_event(
        session_row.id,
        p_organization_id
      )
      and session_row.started_at >= p_from
      and session_row.started_at < p_to
      and (
        p_camera_id is null
        or session_row.camera_id = p_camera_id
      )
      and (
        p_site_id is null
        or session_row.site_id = p_site_id
      )
  ),
  by_type as (
    select
      session_type,
      count(*)::integer as count
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
          select jsonb_agg(
            selected.event_id
            order by selected.chapter_order
          )
          from (
            select
              chapter.event_id,
              chapter.chapter_order
            from public.operational_session_events chapter
            join public.events event
              on event.id = chapter.event_id
            where chapter.session_id = session_row.id
              and event.deleted_at is null
              and event.human_verdict is distinct from 'irrelevant'
            order by
              chapter.is_key_chapter desc,
              chapter.chapter_order desc
            limit 8
          ) selected
        ),
        '[]'::jsonb
      ) as evidence_event_ids
    from filtered session_row
    order by session_row.started_at desc
    limit 20
  )
  select jsonb_build_object(
    'totalSessions',
      (select count(*) from filtered),
    'completedSessions',
      (
        select count(*)
        from filtered
        where status = 'completed'
      ),
    'openSessions',
      (
        select count(*)
        from filtered
        where status = 'open'
      ),
    'uncertainSessions',
      (
        select count(*)
        from filtered
        where status = 'uncertain'
      ),
    'probableCustomerParticipations',
      (
        select coalesce(
          sum(probable_customer_count),
          0
        )
        from filtered
      ),
    'averageDurationSeconds',
      (
        select coalesce(
          avg(duration_seconds),
          0
        )
        from filtered
      ),
    'medianDurationSeconds',
      (
        select coalesce(
          percentile_cont(0.5)
            within group (order by duration_seconds),
          0
        )
        from filtered
      ),
    'byType',
      coalesce(
        (
          select jsonb_object_agg(
            session_type,
            count
          )
          from by_type
        ),
        '{}'::jsonb
      ),
    'sessions',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(evidence)
          )
          from evidence
        ),
        '[]'::jsonb
      ),
    'definitions',
      jsonb_build_object(
        'period',
          'Atividade formada por acontecimentos visualmente relacionados.',
        'customerCount',
          'Participações prováveis; não representa identidade civil nem contagem exata.',
        'outcome',
          'Resultado visual observado; não confirma venda, pagamento ou intenção.'
      )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.assistant_operational_sessions_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;

grant execute on function public.assistant_operational_sessions_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, monitoria_mcp_readonly, service_role;

do $block$
declare
  v_session_id uuid;
begin
  for v_session_id in
    select distinct event.operational_session_id
    from public.events event
    where event.operational_session_id is not null
      and event.human_reviewed_at is not null
  loop
    perform private.refresh_operational_session_review_rollup_v1(
      v_session_id
    );
  end loop;
end;
$block$;

commit;
