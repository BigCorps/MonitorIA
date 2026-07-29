-- MonitorIA v0.8.0
-- Aplicada em produção via MCP como events_search_review_comparison.

alter table public.events
  add column if not exists search_document tsvector not null default ''::tsvector,
  add column if not exists human_verdict text null,
  add column if not exists corrected_event_type text null,
  add column if not exists review_notes text not null default '',
  add column if not exists human_reviewed_at timestamptz null,
  add column if not exists human_reviewed_by uuid null
    references auth.users(id) on delete set null,
  add column if not exists deleted_at timestamptz null,
  add column if not exists deleted_by uuid null
    references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_human_verdict_check'
  ) then
    alter table public.events
      add constraint events_human_verdict_check
      check (
        human_verdict is null
        or human_verdict = any (
          array[
            'useful'::text,
            'irrelevant'::text,
            'incorrect'::text
          ]
        )
      );
  end if;
end
$$;

create or replace function private.refresh_monitoria_event_search_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.search_document :=
    pg_catalog.setweight(
      pg_catalog.to_tsvector(
        'portuguese'::regconfig,
        coalesce(new.summary, '')
      ),
      'A'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector(
        'portuguese'::regconfig,
        coalesce(
          new.corrected_event_type,
          new.primary_event_type,
          ''
        )
      ),
      'A'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector(
        'portuguese'::regconfig,
        coalesce(
          pg_catalog.array_to_string(new.tags, ' '),
          ''
        )
      ),
      'B'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector(
        'portuguese'::regconfig,
        coalesce(new.analyzed_payload::text, '')
      ),
      'C'
    )
    || pg_catalog.setweight(
      pg_catalog.to_tsvector(
        'portuguese'::regconfig,
        coalesce(new.review_notes, '')
        || ' '
        || coalesce(new.review_reasons::text, '')
      ),
      'D'
    );

  return new;
end;
$$;

drop trigger if exists events_refresh_search_document
  on public.events;

create trigger events_refresh_search_document
before insert or update of
  summary,
  primary_event_type,
  corrected_event_type,
  tags,
  analyzed_payload,
  review_notes,
  review_reasons
on public.events
for each row
execute function private.refresh_monitoria_event_search_document();

update public.events
set summary = summary;

create index if not exists events_search_document_idx
  on public.events using gin(search_document);

create index if not exists events_org_started_visible_idx
  on public.events(organization_id, started_at desc)
  where deleted_at is null;

create index if not exists events_camera_started_visible_idx
  on public.events(camera_id, started_at desc)
  where deleted_at is null;

create table if not exists public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  event_id uuid not null
    references public.events(id) on delete cascade,
  verdict text not null
    check (
      verdict = any (
        array[
          'useful'::text,
          'irrelevant'::text,
          'incorrect'::text
        ]
      )
    ),
  corrected_event_type text null,
  notes text not null default '',
  created_by uuid null
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_reviews_event_time_idx
  on public.event_reviews(event_id, created_at desc);

create index if not exists event_reviews_org_time_idx
  on public.event_reviews(organization_id, created_at desc);

alter table public.event_reviews enable row level security;

drop policy if exists event_reviews_select
  on public.event_reviews;

create policy event_reviews_select
on public.event_reviews
for select
to authenticated
using (private.is_org_member(organization_id));

revoke all on public.event_reviews
  from public, anon, authenticated;
grant select on public.event_reviews
  to authenticated;
grant all on public.event_reviews
  to service_role;

create or replace function public.review_monitoria_event(
  p_event_id uuid,
  p_verdict text,
  p_corrected_event_type text default null,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_review_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if not (
    p_verdict = any (
      array[
        'useful'::text,
        'irrelevant'::text,
        'incorrect'::text
      ]
    )
  ) then
    raise exception 'invalid_verdict';
  end if;

  if p_verdict = 'incorrect'
     and nullif(
       pg_catalog.btrim(
         coalesce(p_corrected_event_type, '')
       ),
       ''
     ) is null then
    raise exception 'corrected_event_type_required';
  end if;

  select event.organization_id
    into v_organization_id
  from public.events event
  where event.id = p_event_id
    and event.deleted_at is null;

  if not found then
    raise exception 'event_not_found';
  end if;

  if not private.is_org_member(v_organization_id) then
    raise exception 'not_authorized';
  end if;

  insert into public.event_reviews (
    organization_id,
    event_id,
    verdict,
    corrected_event_type,
    notes,
    created_by
  ) values (
    v_organization_id,
    p_event_id,
    p_verdict,
    case
      when p_verdict = 'incorrect'
        then pg_catalog.left(
          pg_catalog.btrim(p_corrected_event_type),
          120
        )
      else null
    end,
    pg_catalog.left(coalesce(p_notes, ''), 2000),
    v_user_id
  )
  returning id into v_review_id;

  update public.events
  set human_verdict = p_verdict,
      corrected_event_type = case
        when p_verdict = 'incorrect'
          then pg_catalog.left(
            pg_catalog.btrim(p_corrected_event_type),
            120
          )
        else corrected_event_type
      end,
      review_notes =
        pg_catalog.left(coalesce(p_notes, ''), 2000),
      human_reviewed_at = now(),
      human_reviewed_by = v_user_id,
      review_status = case
        when p_verdict = 'irrelevant'
          then 'rejected'::public.review_status
        else 'confirmed'::public.review_status
      end,
      updated_at = now()
  where id = p_event_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_organization_id,
    v_user_id,
    'event.reviewed',
    'event',
    p_event_id,
    pg_catalog.jsonb_build_object(
      'review_id',
      v_review_id,
      'verdict',
      p_verdict,
      'corrected_event_type',
      p_corrected_event_type
    )
  );

  return v_review_id;
end;
$$;

revoke all on function public.review_monitoria_event(
  uuid,
  text,
  text,
  text
) from public, anon;

grant execute on function public.review_monitoria_event(
  uuid,
  text,
  text,
  text
) to authenticated, service_role;

create or replace function public.soft_delete_monitoria_event(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select event.organization_id
    into v_organization_id
  from public.events event
  where event.id = p_event_id
    and event.deleted_at is null;

  if not found then
    raise exception 'event_not_found';
  end if;

  if not private.has_org_role(
    v_organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
    raise exception 'not_authorized';
  end if;

  update public.events
  set deleted_at = now(),
      deleted_by = v_user_id,
      updated_at = now()
  where id = p_event_id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_organization_id,
    v_user_id,
    'event.soft_deleted',
    'event',
    p_event_id,
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.soft_delete_monitoria_event(uuid)
  from public, anon;

grant execute on function public.soft_delete_monitoria_event(uuid)
  to authenticated, service_role;

create or replace function public.search_monitoria_events(
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
      and (
        p_camera_id is null
        or event.camera_id = p_camera_id
      )
      and (
        p_site_id is null
        or event.site_id = p_site_id
      )
      and (
        nullif(
          pg_catalog.btrim(
            coalesce(p_event_type, '')
          ),
          ''
        ) is null
        or coalesce(
          event.corrected_event_type,
          event.primary_event_type
        ) = p_event_type
      )
      and (
        p_min_confidence is null
        or event.confidence >= p_min_confidence
      )
      and (
        coalesce(p_review_filter, 'all') = 'all'
        or (
          p_review_filter = 'pending'
          and event.review_status =
            'pending'::public.review_status
        )
        or (
          p_review_filter = 'required'
          and event.requires_review
        )
        or (
          p_review_filter = 'reviewed'
          and event.human_reviewed_at is not null
        )
        or event.human_verdict = p_review_filter
      )
      and (
        p_has_people is null
        or p_has_people = (
          exists (
            select 1
            from public.event_people person
            where person.event_id = event.id
          )
        )
      )
      and (
        p_has_vehicles is null
        or p_has_vehicles = (
          exists (
            select 1
            from public.event_vehicles vehicle
            where vehicle.event_id = event.id
          )
        )
      )
      and (
        nullif(
          pg_catalog.btrim(coalesce(p_query, '')),
          ''
        ) is null
        or event.search_document
          @@ pg_catalog.websearch_to_tsquery(
            'portuguese'::regconfig,
            pg_catalog.btrim(p_query)
          )
        or event.summary ilike
          '%' || pg_catalog.btrim(p_query) || '%'
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
$$;

revoke all on function public.search_monitoria_events(
  uuid,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  numeric,
  text,
  boolean,
  boolean,
  integer,
  integer
) from public, anon;

grant execute on function public.search_monitoria_events(
  uuid,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  numeric,
  text,
  boolean,
  boolean,
  integer,
  integer
) to authenticated, service_role;

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
  with base as (
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
          base.started_at
        )::integer as hour_of_day,
        pg_catalog.count(*) as quantity
      from base
      group by 1
    ) grouped
  )
  select pg_catalog.jsonb_build_object(
    'from',
    p_from,
    'to',
    p_to,
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
  cross join hours;
$$;

revoke all on function private.monitoria_period_metrics(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function private.monitoria_period_metrics(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) to service_role;

create or replace function public.compare_monitoria_periods(
  p_organization_id uuid,
  p_from_a timestamptz,
  p_to_a timestamptz,
  p_from_b timestamptz,
  p_to_b timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  if p_from_a >= p_to_a or p_from_b >= p_to_b then
    raise exception 'invalid_period';
  end if;

  return pg_catalog.jsonb_build_object(
    'periodA',
    private.monitoria_period_metrics(
      p_organization_id,
      p_from_a,
      p_to_a,
      p_camera_id,
      p_site_id
    ),
    'periodB',
    private.monitoria_period_metrics(
      p_organization_id,
      p_from_b,
      p_to_b,
      p_camera_id,
      p_site_id
    )
  );
end;
$$;

revoke all on function public.compare_monitoria_periods(
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) from public, anon;

grant execute on function public.compare_monitoria_periods(
  uuid,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) to authenticated, service_role;

comment on column public.events.search_document is
  'Documento de busca textual do evento, sem embeddings.';

comment on table public.event_reviews is
  'Histórico imutável das avaliações humanas feitas no dashboard.';
