-- MonitorIA v0.8.2
-- Backend aplicado em produção via MCP.
-- Este arquivo permanece no repositório para reprodutibilidade.

create table if not exists public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  created_by uuid not null
    references auth.users(id) on delete cascade,
  title text not null default 'Nova pesquisa',
  last_message_at timestamptz not null default now(),
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(title) between 1 and 120)
);

create index if not exists assistant_threads_org_time_idx
  on public.assistant_threads(organization_id, last_message_at desc)
  where archived_at is null;

alter table public.assistant_threads enable row level security;

drop policy if exists assistant_threads_select
  on public.assistant_threads;
create policy assistant_threads_select
on public.assistant_threads
for select
to authenticated
using (private.is_org_member(organization_id));

revoke all on public.assistant_threads
  from public, anon, authenticated;
grant select on public.assistant_threads
  to authenticated;
grant all on public.assistant_threads
  to service_role;

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  thread_id uuid not null
    references public.assistant_threads(id) on delete cascade,
  role text not null
    check (role = any (array['user'::text, 'assistant'::text])),
  content text not null,
  evidence_event_ids uuid[] not null default '{}'::uuid[],
  query_plan jsonb not null default '{}'::jsonb,
  model text null,
  usage jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric null,
  created_by uuid null
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (char_length(content) between 1 and 12000),
  check (jsonb_typeof(query_plan) = 'object'),
  check (jsonb_typeof(usage) = 'object'),
  check (cardinality(evidence_event_ids) <= 24)
);

create index if not exists assistant_messages_thread_time_idx
  on public.assistant_messages(thread_id, created_at asc);

create index if not exists assistant_messages_org_time_idx
  on public.assistant_messages(organization_id, created_at desc);

alter table public.assistant_messages enable row level security;

drop policy if exists assistant_messages_select
  on public.assistant_messages;
create policy assistant_messages_select
on public.assistant_messages
for select
to authenticated
using (private.is_org_member(organization_id));

revoke all on public.assistant_messages
  from public, anon, authenticated;
grant select on public.assistant_messages
  to authenticated;
grant all on public.assistant_messages
  to service_role;

create or replace function public.assistant_period_summary(
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
  v_timezone text;
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  if p_from >= p_to then
    raise exception 'invalid_period';
  end if;

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
  ) into v_timezone;

  with base as (
    select event.*
    from public.events event
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.started_at >= p_from
      and event.started_at < p_to
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
  ),
  people as (
    select person.*
    from public.event_people person
    join base on base.id = person.event_id
  ),
  vehicles as (
    select vehicle.*
    from public.event_vehicles vehicle
    join base on base.id = vehicle.event_id
  ),
  totals as (
    select
      count(*)::bigint as total_events,
      count(*) filter (where base.requires_review)::bigint as review_required,
      count(*) filter (where base.human_reviewed_at is not null)::bigint as reviewed_events,
      round(coalesce(avg(base.confidence), 0)::numeric, 4) as average_confidence,
      round(coalesce(avg(date_part('epoch', base.ended_at - base.started_at)), 0)::numeric, 2) as average_duration_seconds,
      count(*) filter (
        where base.primary_event_type = 'person_entered'
          or base.analyzed_payload @? '$.observations[*] ? (@.type == "person_entered")'
      )::bigint as entry_events,
      count(*) filter (
        where base.primary_event_type = 'person_exited'
          or base.analyzed_payload @? '$.observations[*] ? (@.type == "person_exited")'
      )::bigint as exit_events,
      count(*) filter (
        where lower(base.headline || ' ' || base.summary || ' ' || array_to_string(base.tags, ' '))
          ~ '(atendimento|cliente|balc[aã]o|terminal)'
      )::bigint as probable_service_interactions,
      count(*) filter (
        where lower(base.headline || ' ' || base.summary || ' ' || array_to_string(base.tags, ' '))
          ~ '(entrega|entregador|delivery|pacote|encomenda|retirada de pacote)'
          or exists (
            select 1 from people p
            where p.event_id = base.id
              and p.role = 'delivery_person'
          )
      )::bigint as delivery_related_events,
      count(*) filter (
        where base.primary_event_type in ('object_appeared','object_moved','object_removed')
          or base.analyzed_payload @? '$.objects[*] ? (@.state == "appeared" || @.state == "moved" || @.state == "removed")'
      )::bigint as object_change_events
    from base
  ),
  people_totals as (
    select
      count(*)::bigint as people_appearances,
      count(*) filter (where role = 'customer')::bigint as customer_appearances,
      count(*) filter (where role = 'staff')::bigint as staff_appearances,
      count(*) filter (where role = 'delivery_person')::bigint as delivery_person_appearances,
      count(*) filter (where role = 'visitor')::bigint as visitor_appearances,
      count(*) filter (where role = 'unknown')::bigint as unknown_appearances,
      round(coalesce(avg(role_confidence), 0)::numeric, 4) as average_role_confidence
    from people
  ),
  vehicle_totals as (
    select
      count(*)::bigint as vehicle_appearances,
      count(distinct event_id)::bigint as vehicle_events
    from vehicles
  ),
  types as (
    select coalesce(jsonb_object_agg(grouped.event_type, grouped.quantity), '{}'::jsonb) as value
    from (
      select
        coalesce(base.corrected_event_type, base.primary_event_type) as event_type,
        count(*)::bigint as quantity
      from base
      group by 1
      order by 2 desc, 1
    ) grouped
  ),
  roles as (
    select coalesce(jsonb_object_agg(grouped.role, grouped.quantity), '{}'::jsonb) as value
    from (
      select people.role, count(*)::bigint as quantity
      from people
      group by people.role
      order by 2 desc, 1
    ) grouped
  ),
  hours as (
    select coalesce(
      jsonb_agg(jsonb_build_object('hour', grouped.hour_of_day, 'events', grouped.quantity) order by grouped.hour_of_day),
      '[]'::jsonb
    ) as value
    from (
      select
        date_part('hour', base.started_at at time zone v_timezone)::integer as hour_of_day,
        count(*)::bigint as quantity
      from base
      group by 1
    ) grouped
  ),
  evidence as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', selected.id,
          'startedAt', selected.started_at,
          'headline', selected.headline,
          'summary', selected.summary,
          'eventType', coalesce(selected.corrected_event_type, selected.primary_event_type),
          'confidence', selected.confidence
        ) order by selected.started_at desc
      ),
      '[]'::jsonb
    ) as value
    from (
      select base.*
      from base
      order by base.started_at desc
      limit 12
    ) selected
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', v_timezone),
    'totalEvents', totals.total_events,
    'reviewRequired', totals.review_required,
    'reviewedEvents', totals.reviewed_events,
    'averageConfidence', totals.average_confidence,
    'averageDurationSeconds', totals.average_duration_seconds,
    'entryEvents', totals.entry_events,
    'exitEvents', totals.exit_events,
    'probableServiceInteractions', totals.probable_service_interactions,
    'deliveryRelatedEvents', totals.delivery_related_events,
    'objectChangeEvents', totals.object_change_events,
    'peopleAppearances', people_totals.people_appearances,
    'customerAppearances', people_totals.customer_appearances,
    'staffAppearances', people_totals.staff_appearances,
    'deliveryPersonAppearances', people_totals.delivery_person_appearances,
    'visitorAppearances', people_totals.visitor_appearances,
    'unknownAppearances', people_totals.unknown_appearances,
    'averageRoleConfidence', people_totals.average_role_confidence,
    'vehicleAppearances', vehicle_totals.vehicle_appearances,
    'vehicleEvents', vehicle_totals.vehicle_events,
    'byType', types.value,
    'byRole', roles.value,
    'byHour', hours.value,
    'evidence', evidence.value,
    'definitions', jsonb_build_object(
      'peopleAppearances', 'Aparições estruturadas; a mesma pessoa pode aparecer em mais de um evento.',
      'customerAppearances', 'Aparições estimadas na função cliente, não clientes únicos.',
      'probableServiceInteractions', 'Eventos com sinais visuais de atendimento; não confirma venda ou pagamento.',
      'deliveryRelatedEvents', 'Eventos com entregador, entrega, retirada ou pacote observável.',
      'vehicleAppearances', 'Registros de veículos em eventos; não veículos únicos.'
    )
  ) into v_result
  from totals
  cross join people_totals
  cross join vehicle_totals
  cross join types
  cross join roles
  cross join hours
  cross join evidence;

  return v_result;
end;
$$;

revoke all on function public.assistant_period_summary(uuid,timestamptz,timestamptz,uuid,uuid)
  from public, anon;
grant execute on function public.assistant_period_summary(uuid,timestamptz,timestamptz,uuid,uuid)
  to authenticated, service_role;
