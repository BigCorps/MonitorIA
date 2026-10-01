begin;

-- MonitorIA Pesquisa IA 2.0: diretório semântico, cobertura, histórico de saúde,
-- jornadas direcionais e atenção operacional. Todas as funções validam vínculo
-- da organização antes de ler dados e não aceitam SQL/texto livre executável.

create or replace function public.assistant_context_directory_v2(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when not private.is_org_member(p_organization_id) then
      jsonb_build_object('error', 'not_authorized')
    else jsonb_build_object(
      'sites', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', s.id,
          'name', s.name,
          'timezone', s.timezone
        ) order by s.name)
        from public.sites s
        where s.organization_id = p_organization_id
      ), '[]'::jsonb),
      'cameras', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'siteId', c.site_id,
          'sourceKind', c.source_kind,
          'description', coalesce(c.description, ''),
          'monitoringGoals', coalesce(c.monitoring_goals, '[]'::jsonb)
        ) order by c.name)
        from public.cameras c
        where c.organization_id = p_organization_id
      ), '[]'::jsonb),
      'zones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', z.id,
          'name', z.name,
          'cameraId', cp.camera_id,
          'siteId', c.site_id,
          'zoneType', z.zone_type,
          'description', coalesce(z.description, ''),
          'personRoleHint', z.person_role_hint
        ) order by c.name, z.sort_order, z.name)
        from public.camera_zones z
        join public.camera_profiles cp
          on cp.id = z.camera_profile_id
         and cp.organization_id = p_organization_id
         and cp.is_active = true
        join public.cameras c
          on c.id = cp.camera_id
         and c.organization_id = p_organization_id
        where z.organization_id = p_organization_id
      ), '[]'::jsonb),
      'visualEntities', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'cameraId', e.camera_id,
          'siteId', c.site_id,
          'entityType', e.entity_type,
          'aliases', case
            when jsonb_typeof(e.metadata->'aliases') = 'array' then e.metadata->'aliases'
            else '[]'::jsonb
          end,
          'enabled', e.enabled,
          'reliability', e.reliability
        ) order by c.name, e.sort_order, e.name)
        from public.camera_visual_entities e
        join public.cameras c
          on c.id = e.camera_id
         and c.organization_id = p_organization_id
        where e.organization_id = p_organization_id
          and e.enabled = true
      ), '[]'::jsonb),
      'processes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', p.id,
          'name', p.name,
          'processCode', p.process_code,
          'cameraId', p.camera_id,
          'siteId', p.site_id,
          'description', coalesce(p.description, ''),
          'sessionType', p.session_type,
          'aliases', case
            when jsonb_typeof(p.metadata->'aliases') = 'array' then p.metadata->'aliases'
            else '[]'::jsonb
          end
        ) order by p.name)
        from public.operational_process_definitions p
        where p.organization_id = p_organization_id
          and p.status = 'active'
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_context_directory_v2(uuid) from public, anon;
grant execute on function public.assistant_context_directory_v2(uuid) to authenticated, service_role;

create or replace function public.assistant_coverage_summary_v2(
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
as $function$
  with scoped as (
    select c.id, c.name, c.site_id, s.name as site_name, c.source_kind,
           c.health_intelligence_enabled, c.last_seen_at
    from public.cameras c
    join public.sites s
      on s.id = c.site_id and s.organization_id = p_organization_id
    where c.organization_id = p_organization_id
      and (p_camera_id is null or c.id = p_camera_id)
      and (p_site_id is null or c.site_id = p_site_id)
  ), stats as (
    select sc.*,
      (select count(*) from public.events e
       where e.organization_id = p_organization_id
         and e.camera_id = sc.id
         and e.started_at >= p_from and e.started_at < p_to
         and e.deleted_at is null) as event_count,
      (select min(e.started_at) from public.events e
       where e.organization_id = p_organization_id
         and e.camera_id = sc.id
         and e.started_at >= p_from and e.started_at < p_to
         and e.deleted_at is null) as first_event_at,
      (select max(e.started_at) from public.events e
       where e.organization_id = p_organization_id
         and e.camera_id = sc.id
         and e.started_at >= p_from and e.started_at < p_to
         and e.deleted_at is null) as last_event_at,
      (select count(*) from public.camera_health_observations h
       where h.organization_id = p_organization_id
         and h.camera_id = sc.id
         and h.captured_at >= p_from and h.captured_at < p_to) as health_observation_count,
      (select max(h.captured_at) from public.camera_health_observations h
       where h.organization_id = p_organization_id
         and h.camera_id = sc.id
         and h.captured_at >= p_from and h.captured_at < p_to) as last_health_observation_at
    from scoped sc
  )
  select case
    when not private.is_org_member(p_organization_id) then jsonb_build_object('error','not_authorized')
    else jsonb_build_object(
      'dataState', case
        when (select count(*) from stats) = 0 then 'NO_COVERAGE'
        when coalesce((select sum(event_count + health_observation_count) from stats), 0) = 0 then 'NO_COVERAGE'
        when exists(select 1 from stats where event_count = 0 and health_observation_count = 0)
          and exists(select 1 from stats where event_count > 0 or health_observation_count > 0) then 'PARTIAL_COVERAGE'
        when p_to >= now() - interval '1 hour'
          and exists(select 1 from stats where source_kind = 'live_camera' and last_seen_at < now() - interval '30 minutes') then 'STALE_DATA'
        else 'VALID_DATA'
      end,
      'cameraCount', (select count(*) from stats),
      'eventCount', coalesce((select sum(event_count) from stats), 0),
      'healthObservationCount', coalesce((select sum(health_observation_count) from stats), 0),
      'cameras', coalesce((select jsonb_agg(jsonb_build_object(
        'cameraId', id,
        'cameraName', name,
        'siteId', site_id,
        'siteName', site_name,
        'sourceKind', source_kind,
        'eventCount', event_count,
        'firstEventAt', first_event_at,
        'lastEventAt', last_event_at,
        'healthObservationCount', health_observation_count,
        'lastHealthObservationAt', last_health_observation_at,
        'healthEnabled', health_intelligence_enabled,
        'lastSeenAt', last_seen_at,
        'state', case
          when event_count = 0 and health_observation_count = 0 then 'NO_COVERAGE'
          when source_kind = 'live_camera' and p_to >= now() - interval '1 hour'
            and last_seen_at < now() - interval '30 minutes' then 'STALE_DATA'
          else 'VALID_DATA'
        end
      ) order by name) from stats), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_coverage_summary_v2(uuid,timestamptz,timestamptz,uuid,uuid) from public, anon;
grant execute on function public.assistant_coverage_summary_v2(uuid,timestamptz,timestamptz,uuid,uuid) to authenticated, service_role;

create or replace function public.assistant_camera_health_history_v2(
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
as $function$
  select case
    when not private.is_org_member(p_organization_id) then jsonb_build_object('error','not_authorized')
    else jsonb_build_object(
      'summary', jsonb_build_object(
        'observationCount', (
          select count(*)
          from public.camera_health_observations h
          join public.cameras c on c.id=h.camera_id and c.organization_id=p_organization_id
          where h.organization_id=p_organization_id
            and h.captured_at>=p_from and h.captured_at<p_to
            and (p_camera_id is null or h.camera_id=p_camera_id)
            and (p_site_id is null or h.site_id=p_site_id)
        ),
        'incidentCount', (
          select count(*)
          from public.camera_health_incidents i
          where i.organization_id=p_organization_id
            and i.first_observed_at < p_to
            and coalesce(i.resolved_at, i.last_observed_at, i.first_observed_at) >= p_from
            and (p_camera_id is null or i.camera_id=p_camera_id)
            and (p_site_id is null or i.site_id=p_site_id)
        ),
        'affectedCameras', (
          select count(distinct i.camera_id)
          from public.camera_health_incidents i
          where i.organization_id=p_organization_id
            and i.first_observed_at < p_to
            and coalesce(i.resolved_at, i.last_observed_at, i.first_observed_at) >= p_from
            and (p_camera_id is null or i.camera_id=p_camera_id)
            and (p_site_id is null or i.site_id=p_site_id)
        )
      ),
      'incidents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'cameraId', i.camera_id,
          'cameraName', c.name,
          'siteId', i.site_id,
          'siteName', s.name,
          'type', i.incident_type,
          'status', i.status,
          'severity', i.severity,
          'firstObservedAt', i.first_observed_at,
          'lastObservedAt', i.last_observed_at,
          'resolvedAt', i.resolved_at,
          'consecutiveCount', i.consecutive_count,
          'confidence', i.confidence,
          'title', i.title,
          'summary', i.summary,
          'reasons', coalesce(to_jsonb(i.reasons), '[]'::jsonb)
        ) order by i.first_observed_at desc)
        from public.camera_health_incidents i
        join public.cameras c on c.id=i.camera_id and c.organization_id=p_organization_id
        join public.sites s on s.id=i.site_id and s.organization_id=p_organization_id
        where i.organization_id=p_organization_id
          and i.first_observed_at < p_to
          and coalesce(i.resolved_at, i.last_observed_at, i.first_observed_at) >= p_from
          and (p_camera_id is null or i.camera_id=p_camera_id)
          and (p_site_id is null or i.site_id=p_site_id)
      ), '[]'::jsonb),
      'observations', coalesce((
        select jsonb_agg(row_data order by captured_at desc)
        from (
          select h.captured_at,
                 jsonb_build_object(
                   'id', h.id,
                   'cameraId', h.camera_id,
                   'cameraName', c.name,
                   'siteId', h.site_id,
                   'siteName', s.name,
                   'capturedAt', h.captured_at,
                   'healthStatus', h.health_status,
                   'issueCodes', coalesce(to_jsonb(h.issue_codes), '[]'::jsonb),
                   'confidence', h.confidence,
                   'brightnessMean', h.brightness_mean,
                   'blurScore', h.blur_score,
                   'baselineDistance', h.baseline_distance
                 ) as row_data
          from public.camera_health_observations h
          join public.cameras c on c.id=h.camera_id and c.organization_id=p_organization_id
          join public.sites s on s.id=h.site_id and s.organization_id=p_organization_id
          where h.organization_id=p_organization_id
            and h.captured_at>=p_from and h.captured_at<p_to
            and (p_camera_id is null or h.camera_id=p_camera_id)
            and (p_site_id is null or h.site_id=p_site_id)
          order by h.captured_at desc
          limit 100
        ) q
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_camera_health_history_v2(uuid,timestamptz,timestamptz,uuid,uuid) from public, anon;
grant execute on function public.assistant_camera_health_history_v2(uuid,timestamptz,timestamptz,uuid,uuid) to authenticated, service_role;

create or replace function public.assistant_cross_camera_journeys_v2(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_site_id uuid default null,
  p_from_camera_id uuid default null,
  p_to_camera_id uuid default null,
  p_subject_type text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with scoped as (
    select j.*, fc.name as from_camera_name, tc.name as to_camera_name,
           s.name as site_name
    from public.cross_camera_journeys j
    join public.cameras fc on fc.id=j.from_camera_id and fc.organization_id=p_organization_id
    join public.cameras tc on tc.id=j.to_camera_id and tc.organization_id=p_organization_id
    join public.sites s on s.id=j.site_id and s.organization_id=p_organization_id
    where j.organization_id=p_organization_id
      and j.observed_from>=p_from and j.observed_from<p_to
      and (p_site_id is null or j.site_id=p_site_id)
      and (p_from_camera_id is null or j.from_camera_id=p_from_camera_id)
      and (p_to_camera_id is null or j.to_camera_id=p_to_camera_id)
      and (p_subject_type is null or j.subject_type=p_subject_type)
  )
  select case
    when not private.is_org_member(p_organization_id) then jsonb_build_object('error','not_authorized')
    else jsonb_build_object(
      'total', (select count(*) from scoped),
      'people', (select count(*) from scoped where subject_type='person'),
      'vehicles', (select count(*) from scoped where subject_type='vehicle'),
      'averageTravelSeconds', (select round(avg(travel_seconds)::numeric,1) from scoped),
      'evidenceEventIds', coalesce((
        select to_jsonb(array(
          select distinct ev
          from scoped s, unnest(coalesce(s.evidence_event_ids, array[]::uuid[])) ev
          limit 24
        ))
      ), '[]'::jsonb),
      'journeys', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'siteId', site_id,
          'siteName', site_name,
          'subjectType', subject_type,
          'fromCameraId', from_camera_id,
          'fromCameraName', from_camera_name,
          'toCameraId', to_camera_id,
          'toCameraName', to_camera_name,
          'fromEventId', from_event_id,
          'toEventId', to_event_id,
          'observedFrom', observed_from,
          'observedTo', observed_to,
          'travelSeconds', travel_seconds,
          'probableDirection', probable_direction,
          'confidence', confidence,
          'summary', summary,
          'evidenceEventIds', coalesce(to_jsonb(evidence_event_ids), '[]'::jsonb),
          'competingHypotheses', coalesce(competing_hypotheses, '[]'::jsonb)
        ) order by observed_from desc)
        from scoped
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_cross_camera_journeys_v2(uuid,timestamptz,timestamptz,uuid,uuid,uuid,text) from public, anon;
grant execute on function public.assistant_cross_camera_journeys_v2(uuid,timestamptz,timestamptz,uuid,uuid,uuid,text) to authenticated, service_role;

create or replace function public.assistant_attention_summary_v2(
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
as $function$
  select case
    when not private.is_org_member(p_organization_id) then jsonb_build_object('error','not_authorized')
    else jsonb_build_object(
      'alerts', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', a.id,
          'kind', 'intelligent_alert',
          'cameraId', a.camera_id,
          'cameraName', c.name,
          'siteId', a.site_id,
          'siteName', s.name,
          'code', a.alert_code,
          'severity', a.severity,
          'status', a.status,
          'title', a.title,
          'summary', a.summary,
          'reason', a.reason,
          'recommendation', a.recommendation,
          'observedAt', a.observed_at,
          'firstObservedAt', a.first_observed_at,
          'lastObservedAt', a.last_observed_at,
          'occurrenceCount', a.occurrence_count,
          'evidenceEventIds', coalesce(to_jsonb(a.evidence_event_ids), '[]'::jsonb)
        ) order by
          case a.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end desc,
          a.last_observed_at desc)
        from public.intelligent_alerts a
        join public.cameras c on c.id=a.camera_id and c.organization_id=p_organization_id
        join public.sites s on s.id=a.site_id and s.organization_id=p_organization_id
        where a.organization_id=p_organization_id
          and coalesce(a.last_observed_at,a.observed_at,a.first_observed_at) >= p_from
          and coalesce(a.first_observed_at,a.observed_at) < p_to
          and (p_camera_id is null or a.camera_id=p_camera_id)
          and (p_site_id is null or a.site_id=p_site_id)
      ), '[]'::jsonb),
      'deviations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'kind', 'routine_deviation',
          'cameraId', d.camera_id,
          'cameraName', c.name,
          'siteId', d.site_id,
          'siteName', s.name,
          'code', d.deviation_code,
          'severity', d.severity,
          'status', d.status,
          'title', d.title,
          'summary', d.summary,
          'observedAt', d.observed_at,
          'confidence', d.confidence,
          'evidenceEventIds', coalesce(to_jsonb(d.evidence_event_ids), '[]'::jsonb)
        ) order by
          case d.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end desc,
          d.observed_at desc)
        from public.operational_deviations d
        join public.cameras c on c.id=d.camera_id and c.organization_id=p_organization_id
        join public.sites s on s.id=d.site_id and s.organization_id=p_organization_id
        where d.organization_id=p_organization_id
          and d.observed_at>=p_from and d.observed_at<p_to
          and (p_camera_id is null or d.camera_id=p_camera_id)
          and (p_site_id is null or d.site_id=p_site_id)
      ), '[]'::jsonb),
      'healthIncidents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'kind', 'camera_health',
          'cameraId', i.camera_id,
          'cameraName', c.name,
          'siteId', i.site_id,
          'siteName', s.name,
          'code', i.incident_type,
          'severity', i.severity,
          'status', i.status,
          'title', i.title,
          'summary', i.summary,
          'firstObservedAt', i.first_observed_at,
          'lastObservedAt', i.last_observed_at,
          'resolvedAt', i.resolved_at,
          'confidence', i.confidence
        ) order by
          case i.severity when 'critical' then 5 when 'high' then 4 when 'medium' then 3 when 'low' then 2 else 1 end desc,
          i.last_observed_at desc)
        from public.camera_health_incidents i
        join public.cameras c on c.id=i.camera_id and c.organization_id=p_organization_id
        join public.sites s on s.id=i.site_id and s.organization_id=p_organization_id
        where i.organization_id=p_organization_id
          and i.first_observed_at < p_to
          and coalesce(i.resolved_at,i.last_observed_at,i.first_observed_at) >= p_from
          and (p_camera_id is null or i.camera_id=p_camera_id)
          and (p_site_id is null or i.site_id=p_site_id)
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_attention_summary_v2(uuid,timestamptz,timestamptz,uuid,uuid) from public, anon;
grant execute on function public.assistant_attention_summary_v2(uuid,timestamptz,timestamptz,uuid,uuid) to authenticated, service_role;

create or replace function public.assistant_structured_event_search_v2(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null,
  p_zone_id uuid default null,
  p_event_types text[] default null,
  p_after_confirmed_closing boolean default null,
  p_requires_review boolean default null,
  p_limit integer default 12
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with rows as (
    select e.id, e.started_at, e.ended_at, e.primary_event_type, e.headline, e.summary,
           e.confidence, e.requires_review, e.after_confirmed_closing,
           e.zone_ids, e.tags, e.camera_id, c.name as camera_name,
           e.site_id, s.name as site_name
    from public.events e
    join public.cameras c on c.id=e.camera_id and c.organization_id=p_organization_id
    join public.sites s on s.id=e.site_id and s.organization_id=p_organization_id
    where e.organization_id=p_organization_id
      and e.started_at>=p_from and e.started_at<p_to
      and e.deleted_at is null
      and (p_camera_id is null or e.camera_id=p_camera_id)
      and (p_site_id is null or e.site_id=p_site_id)
      and (p_zone_id is null or p_zone_id = any(coalesce(e.zone_ids, array[]::uuid[])))
      and (p_event_types is null or e.primary_event_type = any(p_event_types))
      and (p_after_confirmed_closing is null or e.after_confirmed_closing=p_after_confirmed_closing)
      and (p_requires_review is null or e.requires_review=p_requires_review)
    order by e.started_at desc
  )
  select case
    when not private.is_org_member(p_organization_id) then jsonb_build_object('error','not_authorized')
    else jsonb_build_object(
      'total', (select count(*) from rows),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'startedAt', started_at,
          'endedAt', ended_at,
          'eventType', primary_event_type,
          'headline', headline,
          'summary', summary,
          'confidence', confidence,
          'requiresReview', requires_review,
          'afterConfirmedClosing', after_confirmed_closing,
          'zoneIds', coalesce(to_jsonb(zone_ids), '[]'::jsonb),
          'tags', coalesce(to_jsonb(tags), '[]'::jsonb),
          'cameraId', camera_id,
          'cameraName', camera_name,
          'siteId', site_id,
          'siteName', site_name
        ) order by started_at desc)
        from (select * from rows limit greatest(1,least(coalesce(p_limit,12),50))) limited
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_structured_event_search_v2(uuid,timestamptz,timestamptz,uuid,uuid,uuid,text[],boolean,boolean,integer) from public, anon;
grant execute on function public.assistant_structured_event_search_v2(uuid,timestamptz,timestamptz,uuid,uuid,uuid,text[],boolean,boolean,integer) to authenticated, service_role;

commit;
