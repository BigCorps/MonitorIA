-- Rollback da Etapa 2. Mantém eventos e pessoas existentes, removendo apenas a camada de memória curta.

begin;

drop function if exists public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
);

drop function if exists public.purge_expired_short_memory_v1(integer);
drop function if exists public.assistant_continuity_summary(uuid, timestamptz, timestamptz, uuid, uuid);
drop function if exists public.process_event_continuity_v1(uuid);
drop function if exists private.monitoria_roles_compatible(text, text);
drop function if exists private.monitoria_appearance_similarity(jsonb, jsonb);
drop function if exists private.monitoria_normalized_appearance_value(jsonb, text);

alter table public.events
  drop constraint if exists events_interaction_group_id_fkey,
  drop constraint if exists events_continuation_of_event_id_fkey,
  drop constraint if exists events_continuity_confidence_check,
  drop constraint if exists events_continuity_summary_check;

alter table public.events
  drop column if exists interaction_group_id,
  drop column if exists continuation_of_event_id,
  drop column if exists is_continuation,
  drop column if exists interaction_event_count,
  drop column if exists probable_people_count,
  drop column if exists probable_customer_count,
  drop column if exists probable_staff_count,
  drop column if exists continuity_confidence,
  drop column if exists continuity_summary;

drop table if exists public.interaction_group_events cascade;
drop table if exists public.interaction_groups cascade;
drop table if exists public.event_person_memory_links cascade;
drop table if exists public.person_memory_instances cascade;
drop table if exists public.camera_staff_profiles cascade;

alter table public.event_people
  drop constraint if exists event_people_appearance_object_check,
  drop constraint if exists event_people_appearance_confidence_check,
  drop column if exists appearance,
  drop column if exists appearance_confidence;

alter table public.cameras
  drop constraint if exists cameras_short_memory_window_check,
  drop constraint if exists cameras_customer_memory_hours_check,
  drop constraint if exists cameras_staff_memory_hours_check,
  drop constraint if exists cameras_interaction_gap_check,
  drop constraint if exists cameras_continuity_similarity_check,
  drop constraint if exists cameras_staff_similarity_check,
  drop column if exists short_memory_enabled,
  drop column if exists short_memory_window_minutes,
  drop column if exists customer_memory_hours,
  drop column if exists staff_memory_hours,
  drop column if exists interaction_gap_minutes,
  drop column if exists continuity_min_similarity,
  drop column if exists staff_match_min_similarity;


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

commit;
