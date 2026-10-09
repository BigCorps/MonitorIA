-- MonitorIA — Timeline v3 com filtro etário visual amplo
--
-- Preserva a v2 e adiciona filtro opcional child/adult aos eventos concluídos.
-- Jobs ainda em processamento não aparecem quando esse filtro está ativo,
-- porque ainda não possuem classificação visual estruturada.

begin;

create or replace function public.search_monitoria_timeline_v3(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_camera_ids uuid[] default null,
  p_site_id uuid default null,
  p_event_type text default null,
  p_review_filter text default 'all',
  p_apparent_age_group text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(
  row_kind text,
  row_id uuid,
  analysis_job_id uuid,
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
  review_status text,
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
  processing_status text,
  last_error text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_cameras as (
    select c.id, c.name, c.site_id, s.name as site_name
    from public.cameras c
    join public.sites s on s.id = c.site_id
    where c.organization_id = p_organization_id
      and s.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and (p_camera_ids is null or cardinality(p_camera_ids) = 0 or c.id = any(p_camera_ids))
      and (p_site_id is null or c.site_id = p_site_id)
  ), completed as (
    select
      'event'::text as row_kind,
      e.id as row_id,
      e.analysis_job_id,
      e.started_at,
      e.ended_at,
      pg_catalog.date_part('epoch', e.ended_at - e.started_at)::numeric as duration_seconds,
      e.camera_id,
      c.name as camera_name,
      e.site_id,
      c.site_name,
      coalesce(nullif(e.headline, ''), 'Acontecimento registrado') as headline,
      coalesce(e.corrected_event_type, e.primary_event_type) as event_type,
      e.primary_event_type as original_event_type,
      e.summary,
      e.confidence,
      e.requires_review,
      e.review_status::text,
      e.human_verdict,
      e.human_reviewed_at,
      e.tags,
      (select pg_catalog.count(*) from public.event_people person where person.event_id = e.id) as people_count,
      (select pg_catalog.count(*) from public.event_vehicles vehicle where vehicle.event_id = e.id) as vehicle_count,
      e.interaction_group_id,
      e.is_continuation,
      e.interaction_event_count,
      e.probable_people_count,
      e.probable_customer_count,
      e.probable_staff_count,
      e.continuity_confidence,
      e.operational_session_id,
      e.session_type,
      e.session_status,
      e.session_chapter_type,
      e.session_chapter_order,
      e.session_chapter_count,
      e.session_duration_seconds,
      e.session_confidence,
      (
        select sa.id
        from public.storage_assets sa
        where sa.event_id = e.id
          and sa.status = 'ready'::public.asset_status
          and sa.deleted_at is null
        order by
          case sa.frame_label when 'peak' then 0 when 'start' then 1 when 'end' then 2 else 3 end,
          sa.captured_at
        limit 1
      ) as thumbnail_asset_id,
      'completed'::text as processing_status,
      null::text as last_error
    from public.events e
    join eligible_cameras c on c.id = e.camera_id
    where e.organization_id = p_organization_id
      and e.deleted_at is null
      and (
        e.human_verdict is distinct from 'irrelevant'
        or coalesce(p_review_filter, 'all') in ('irrelevant', 'reviewed')
      )
      and (p_from is null or e.started_at >= p_from)
      and (p_to is null or e.started_at < p_to)
      and (
        nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
        or coalesce(e.corrected_event_type, e.primary_event_type) = p_event_type
      )
      and (
        coalesce(p_review_filter, 'all') = 'all'
        or (p_review_filter = 'pending' and e.review_status = 'pending'::public.review_status)
        or (p_review_filter = 'required' and e.requires_review)
        or (p_review_filter = 'reviewed' and e.human_reviewed_at is not null)
        or e.human_verdict = p_review_filter
      )
      and (
        p_apparent_age_group is null
        or (
          p_apparent_age_group in ('child', 'adult')
          and exists (
            select 1
            from jsonb_array_elements(
              coalesce(e.analyzed_payload->'people', '[]'::jsonb)
            ) person
            where person->>'apparentAgeGroup' = p_apparent_age_group
              and case
                when coalesce(
                  person->>'apparentAgeGroupConfidence',
                  ''
                ) ~ '^[0-9]+([.][0-9]+)?
    select
      'analysis'::text as row_kind,
      aj.id as row_id,
      aj.id as analysis_job_id,
      aj.started_at,
      aj.ended_at,
      pg_catalog.date_part('epoch', aj.ended_at - aj.started_at)::numeric as duration_seconds,
      aj.camera_id,
      c.name as camera_name,
      c.site_id,
      c.site_name,
      case
        when ei.status = 'failed_terminal' then 'Falha na análise'
        when aj.status = 'failed'::public.analysis_job_status then 'Análise será retomada'
        else 'Analisando…'
      end as headline,
      'processing'::text as event_type,
      'processing'::text as original_event_type,
      case
        when ei.status = 'failed_terminal' then 'O acontecimento e suas evidências foram preservados, mas a análise exige atenção técnica.'
        when aj.status = 'failed'::public.analysis_job_status then 'O MonitorIA preservou o acontecimento e vai tentar a análise novamente.'
        else 'O acontecimento já foi recebido e está sendo analisado.'
      end as summary,
      null::numeric as confidence,
      false as requires_review,
      'processing'::text as review_status,
      null::text as human_verdict,
      null::timestamptz as human_reviewed_at,
      '{}'::text[] as tags,
      0::bigint as people_count,
      0::bigint as vehicle_count,
      null::uuid as interaction_group_id,
      false as is_continuation,
      0::integer as interaction_event_count,
      0::integer as probable_people_count,
      0::integer as probable_customer_count,
      0::integer as probable_staff_count,
      0::numeric as continuity_confidence,
      null::uuid as operational_session_id,
      null::text as session_type,
      null::text as session_status,
      null::text as session_chapter_type,
      null::integer as session_chapter_order,
      0::integer as session_chapter_count,
      0::numeric as session_duration_seconds,
      0::numeric as session_confidence,
      (
        select sa.id
        from public.storage_assets sa
        where sa.analysis_job_id = aj.id
          and sa.mime_type = 'image/jpeg'
          and sa.status = 'ready'::public.asset_status
          and sa.deleted_at is null
        order by
          case sa.frame_label when 'peak' then 0 when 'start' then 1 when 'end' then 2 else 3 end,
          sa.captured_at
        limit 1
      ) as thumbnail_asset_id,
      coalesce(ei.status, aj.status::text) as processing_status,
      coalesce(ei.last_error, aj.last_error) as last_error
    from public.analysis_jobs aj
    join eligible_cameras c on c.id = aj.camera_id
    left join public.event_ingestions ei on ei.analysis_job_id = aj.id
    where aj.organization_id = p_organization_id
      and aj.status in (
        'queued'::public.analysis_job_status,
        'processing'::public.analysis_job_status,
        'failed'::public.analysis_job_status
      )
      and (p_from is null or aj.started_at >= p_from)
      and (p_to is null or aj.started_at < p_to)
      and nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
      and coalesce(p_review_filter, 'all') = 'all'
      and p_apparent_age_group is null
      and not exists (select 1 from public.events e where e.analysis_job_id = aj.id)
  ), all_rows as (
    select * from completed
    union all
    select * from pending
  )
  select all_rows.*, pg_catalog.count(*) over() as total_count
  from all_rows
  order by all_rows.started_at desc, all_rows.row_id desc
  limit greatest(1, least(coalesce(p_limit, 24), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_monitoria_timeline_v3(
  uuid, timestamptz, timestamptz, uuid[], uuid, text, text, text, integer, integer
) from public, anon;
grant execute on function public.search_monitoria_timeline_v3(
  uuid, timestamptz, timestamptz, uuid[], uuid, text, text, text, integer, integer
) to authenticated, service_role;
                  then (person->>'apparentAgeGroupConfidence')::numeric
                else 0
              end >= 0.60
          )
        )
      )
  ), pending as (
    select
      'analysis'::text as row_kind,
      aj.id as row_id,
      aj.id as analysis_job_id,
      aj.started_at,
      aj.ended_at,
      pg_catalog.date_part('epoch', aj.ended_at - aj.started_at)::numeric as duration_seconds,
      aj.camera_id,
      c.name as camera_name,
      c.site_id,
      c.site_name,
      case
        when ei.status = 'failed_terminal' then 'Falha na análise'
        when aj.status = 'failed'::public.analysis_job_status then 'Análise será retomada'
        else 'Analisando…'
      end as headline,
      'processing'::text as event_type,
      'processing'::text as original_event_type,
      case
        when ei.status = 'failed_terminal' then 'O acontecimento e suas evidências foram preservados, mas a análise exige atenção técnica.'
        when aj.status = 'failed'::public.analysis_job_status then 'O MonitorIA preservou o acontecimento e vai tentar a análise novamente.'
        else 'O acontecimento já foi recebido e está sendo analisado.'
      end as summary,
      null::numeric as confidence,
      false as requires_review,
      'processing'::text as review_status,
      null::text as human_verdict,
      null::timestamptz as human_reviewed_at,
      '{}'::text[] as tags,
      0::bigint as people_count,
      0::bigint as vehicle_count,
      null::uuid as interaction_group_id,
      false as is_continuation,
      0::integer as interaction_event_count,
      0::integer as probable_people_count,
      0::integer as probable_customer_count,
      0::integer as probable_staff_count,
      0::numeric as continuity_confidence,
      null::uuid as operational_session_id,
      null::text as session_type,
      null::text as session_status,
      null::text as session_chapter_type,
      null::integer as session_chapter_order,
      0::integer as session_chapter_count,
      0::numeric as session_duration_seconds,
      0::numeric as session_confidence,
      (
        select sa.id
        from public.storage_assets sa
        where sa.analysis_job_id = aj.id
          and sa.mime_type = 'image/jpeg'
          and sa.status = 'ready'::public.asset_status
          and sa.deleted_at is null
        order by
          case sa.frame_label when 'peak' then 0 when 'start' then 1 when 'end' then 2 else 3 end,
          sa.captured_at
        limit 1
      ) as thumbnail_asset_id,
      coalesce(ei.status, aj.status::text) as processing_status,
      coalesce(ei.last_error, aj.last_error) as last_error
    from public.analysis_jobs aj
    join eligible_cameras c on c.id = aj.camera_id
    left join public.event_ingestions ei on ei.analysis_job_id = aj.id
    where aj.organization_id = p_organization_id
      and aj.status in (
        'queued'::public.analysis_job_status,
        'processing'::public.analysis_job_status,
        'failed'::public.analysis_job_status
      )
      and (p_from is null or aj.started_at >= p_from)
      and (p_to is null or aj.started_at < p_to)
      and nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
      and coalesce(p_review_filter, 'all') = 'all'
      and not exists (select 1 from public.events e where e.analysis_job_id = aj.id)
  ), all_rows as (
    select * from completed
    union all
    select * from pending
  )
  select all_rows.*, pg_catalog.count(*) over() as total_count
  from all_rows
  order by all_rows.started_at desc, all_rows.row_id desc
  limit greatest(1, least(coalesce(p_limit, 24), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_monitoria_timeline_v3(
  uuid, timestamptz, timestamptz, uuid[], uuid, text, text, text, integer, integer
) from public, anon;
grant execute on function public.search_monitoria_timeline_v3(
  uuid, timestamptz, timestamptz, uuid[], uuid, text, text, text, integer, integer
) to authenticated, service_role;

commit;
