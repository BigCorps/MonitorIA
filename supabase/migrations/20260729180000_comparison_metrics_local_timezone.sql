-- Corrige a distribuição por hora para usar o fuso do local.

create or replace function private.monitoria_period_metrics(
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
  with parameters as (
    select coalesce(
      (
        select site.timezone
        from public.sites site
        where site.organization_id = p_organization_id
          and site.id = p_site_id
        limit 1
      ),
      (
        select site.timezone
        from public.sites site
        where site.organization_id = p_organization_id
        order by site.created_at
        limit 1
      ),
      'America/Sao_Paulo'::text
    ) as timezone
  ),
  base as (
    select event.*
    from public.events event
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.started_at >= p_from
      and event.started_at < p_to
      and (
        p_camera_id is null
        or event.camera_id = p_camera_id
      )
      and (
        p_site_id is null
        or event.site_id = p_site_id
      )
  ),
  totals as (
    select
      pg_catalog.count(*) as total_events,
      pg_catalog.count(*) filter (
        where exists (
          select 1
          from public.event_people person
          where person.event_id = base.id
        )
      ) as people_events,
      pg_catalog.count(*) filter (
        where exists (
          select 1
          from public.event_vehicles vehicle
          where vehicle.event_id = base.id
        )
      ) as vehicle_events,
      pg_catalog.count(*) filter (
        where base.requires_review
      ) as review_required,
      pg_catalog.count(*) filter (
        where base.human_reviewed_at is not null
      ) as reviewed_events,
      pg_catalog.round(
        pg_catalog.avg(base.confidence)::numeric,
        4
      ) as average_confidence,
      pg_catalog.round(
        pg_catalog.avg(
          pg_catalog.date_part(
            'epoch',
            base.ended_at - base.started_at
          )
        )::numeric,
        2
      ) as average_duration_seconds
    from base
  ),
  types as (
    select coalesce(
      pg_catalog.jsonb_object_agg(
        grouped.event_type,
        grouped.quantity
      ),
      '{}'::jsonb
    ) as value
    from (
      select
        coalesce(
          base.corrected_event_type,
          base.primary_event_type
        ) as event_type,
        pg_catalog.count(*) as quantity
      from base
      group by 1
      order by 2 desc, 1
    ) grouped
  ),
  hours as (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'hour',
          grouped.hour_of_day,
          'count',
          grouped.quantity
        )
        order by grouped.hour_of_day
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        pg_catalog.date_part(
          'hour',
          base.started_at at time zone parameters.timezone
        )::integer as hour_of_day,
        pg_catalog.count(*) as quantity
      from base
      cross join parameters
      group by 1
    ) grouped
  )
  select pg_catalog.jsonb_build_object(
    'from',
    p_from,
    'to',
    p_to,
    'timezone',
    parameters.timezone,
    'totalEvents',
    totals.total_events,
    'peopleEvents',
    totals.people_events,
    'vehicleEvents',
    totals.vehicle_events,
    'reviewRequired',
    totals.review_required,
    'reviewedEvents',
    totals.reviewed_events,
    'averageConfidence',
    coalesce(totals.average_confidence, 0),
    'averageDurationSeconds',
    coalesce(totals.average_duration_seconds, 0),
    'byType',
    types.value,
    'byHour',
    hours.value
  )
  from totals
  cross join types
  cross join hours
  cross join parameters;
$$;
