-- MonitorIA — Pesquisa IA híbrida v1
--
-- Objetivos:
-- 1. permitir consultas locais/determinísticas com diretivas controladas;
-- 2. adicionar agregações por câmera/local ao resumo já usado pela Pesquisa IA;
-- 3. enriquecer evidências de saúde e rotinas sem nova análise visual;
-- 4. manter tenant isolation e contratos existentes;
-- 5. não gerar SQL dinamicamente a partir da frase do usuário.

begin;

-- -----------------------------------------------------------------------------
-- Pesquisa de eventos
-- Diretivas permitidas são produzidas pelo backend, não pelo SQL livre:
--   @time=HH:MM-HH:MM  -> janela de horário LOCAL do site
--   @important         -> filtro determinístico de eventos que merecem atenção
-- O restante continua passando pelo mecanismo de busca textual já existente.
-- -----------------------------------------------------------------------------

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
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with directives as (
    select
      position('@important' in lower(coalesce(p_query, ''))) > 0 as important_only,
      substring(
        lower(coalesce(p_query, ''))
        from '@time=([0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2})'
      ) as time_range,
      btrim(
        regexp_replace(
          regexp_replace(
            lower(coalesce(p_query, '')),
            '@time=[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}',
            ' ',
            'g'
          ),
          '@important',
          ' ',
          'g'
        )
      ) as clean_query
  ),
  parsed as (
    select
      important_only,
      clean_query,
      case
        when time_range is not null
          and split_part(split_part(time_range, '-', 1), ':', 1)::int between 0 and 23
          and split_part(split_part(time_range, '-', 1), ':', 2)::int between 0 and 59
          then split_part(time_range, '-', 1)::time
        else null::time
      end as local_start,
      case
        when time_range is not null
          and split_part(split_part(time_range, '-', 2), ':', 1)::int between 0 and 23
          and split_part(split_part(time_range, '-', 2), ':', 2)::int between 0 and 59
          then split_part(time_range, '-', 2)::time
        else null::time
      end as local_end
    from directives
  ),
  filtered as (
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
      event.interaction_group_id,
      event.is_continuation,
      event.interaction_event_count,
      event.probable_people_count,
      event.probable_customer_count,
      event.probable_staff_count,
      event.continuity_confidence,
      event.operational_session_id,
      event.session_type,
      event.session_status,
      event.session_chapter_type,
      event.session_chapter_order,
      event.session_chapter_count,
      event.session_duration_seconds,
      event.session_confidence,
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
      ) as thumbnail_asset_id,
      case
        when event.requires_review then 5
        when coalesce(event.corrected_event_type, event.primary_event_type) in (
          'zone_intrusion',
          'unusual_activity',
          'object_removed',
          'scene_change'
        ) then 4
        when exists (
          select 1
          from public.intelligent_alerts alert
          where alert.organization_id = p_organization_id
            and alert.status in ('open', 'acknowledged')
            and event.id = any(alert.evidence_event_ids)
        ) then 3
        when exists (
          select 1
          from public.operational_deviations deviation
          where deviation.organization_id = p_organization_id
            and deviation.status = 'active'
            and event.id = any(deviation.evidence_event_ids)
        ) then 2
        else 0
      end as importance_rank
    from public.events event
    join public.cameras camera
      on camera.id = event.camera_id
     and camera.organization_id = p_organization_id
    join public.sites site
      on site.id = event.site_id
     and site.organization_id = p_organization_id
    cross join parsed
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and private.is_org_member(p_organization_id)
      and (
        event.human_verdict is distinct from 'irrelevant'
        or coalesce(p_review_filter, 'all') in ('irrelevant', 'reviewed')
      )
      and (p_from is null or event.started_at >= p_from)
      and (p_to is null or event.started_at < p_to)
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
      and (
        parsed.local_start is null
        or parsed.local_end is null
        or case
          when parsed.local_start < parsed.local_end then
            (event.started_at at time zone site.timezone)::time >= parsed.local_start
            and (event.started_at at time zone site.timezone)::time < parsed.local_end
          else
            (event.started_at at time zone site.timezone)::time >= parsed.local_start
            or (event.started_at at time zone site.timezone)::time < parsed.local_end
        end
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
        or coalesce(event.corrected_event_type, event.primary_event_type) = p_event_type
      )
      and (p_min_confidence is null or event.confidence >= p_min_confidence)
      and (
        coalesce(p_review_filter, 'all') = 'all'
        or (
          p_review_filter = 'pending'
          and event.review_status = 'pending'::public.review_status
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
        or p_has_people = exists (
          select 1
          from public.event_people person
          where person.event_id = event.id
        )
      )
      and (
        p_has_vehicles is null
        or p_has_vehicles = exists (
          select 1
          from public.event_vehicles vehicle
          where vehicle.event_id = event.id
        )
      )
      and (
        not parsed.important_only
        or event.requires_review
        or coalesce(event.corrected_event_type, event.primary_event_type) in (
          'zone_intrusion',
          'unusual_activity',
          'object_removed',
          'scene_change'
        )
        or exists (
          select 1
          from public.intelligent_alerts alert
          where alert.organization_id = p_organization_id
            and alert.status in ('open', 'acknowledged')
            and event.id = any(alert.evidence_event_ids)
        )
        or exists (
          select 1
          from public.operational_deviations deviation
          where deviation.organization_id = p_organization_id
            and deviation.status = 'active'
            and event.id = any(deviation.evidence_event_ids)
        )
      )
      and (
        nullif(parsed.clean_query, '') is null
        or event.search_document @@ pg_catalog.websearch_to_tsquery(
          'portuguese'::regconfig,
          parsed.clean_query
        )
        or event.headline ilike '%' || parsed.clean_query || '%'
        or event.summary ilike '%' || parsed.clean_query || '%'
      )
  )
  select
    filtered.id,
    filtered.started_at,
    filtered.ended_at,
    filtered.duration_seconds,
    filtered.camera_id,
    filtered.camera_name,
    filtered.site_id,
    filtered.site_name,
    filtered.headline,
    filtered.event_type,
    filtered.original_event_type,
    filtered.summary,
    filtered.confidence,
    filtered.requires_review,
    filtered.review_status,
    filtered.human_verdict,
    filtered.human_reviewed_at,
    filtered.tags,
    filtered.people_count,
    filtered.vehicle_count,
    filtered.interaction_group_id,
    filtered.is_continuation,
    filtered.interaction_event_count,
    filtered.probable_people_count,
    filtered.probable_customer_count,
    filtered.probable_staff_count,
    filtered.continuity_confidence,
    filtered.operational_session_id,
    filtered.session_type,
    filtered.session_status,
    filtered.session_chapter_type,
    filtered.session_chapter_order,
    filtered.session_chapter_count,
    filtered.session_duration_seconds,
    filtered.session_confidence,
    filtered.thumbnail_asset_id,
    pg_catalog.count(*) over() as total_count
  from filtered
  order by filtered.importance_rank desc, filtered.started_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$function$;

revoke all on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
) from public, anon;

grant execute on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    grant execute on function public.search_monitoria_events(
      uuid, text, timestamptz, timestamptz, uuid, uuid, text,
      numeric, text, boolean, boolean, integer, integer
    ) to monitoria_mcp_readonly;
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Resumo do período: preserva todo o contrato atual e adiciona byCamera/bySite.
-- Isso permite rankings determinísticos sem retornar todos os eventos ao Node.
-- -----------------------------------------------------------------------------

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
as $function$
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
    select
      event.*,
      coalesce(event.corrected_event_type, event.primary_event_type)
        as effective_event_type,
      (event.human_verdict = 'incorrect') as has_human_type_correction
    from public.events event
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
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
      count(*) filter (where base.human_reviewed_at is not null)::bigint
        as reviewed_events,
      round(coalesce(avg(base.confidence), 0)::numeric, 4)
        as average_confidence,
      round(
        coalesce(avg(date_part('epoch', base.ended_at - base.started_at)), 0)::numeric,
        2
      ) as average_duration_seconds,
      count(*) filter (
        where base.effective_event_type = 'person_entered'
          or (
            not base.has_human_type_correction
            and base.analyzed_payload
              @? '$.observations[*] ? (@.type == "person_entered")'
          )
      )::bigint as entry_events,
      count(*) filter (
        where base.effective_event_type = 'person_exited'
          or (
            not base.has_human_type_correction
            and base.analyzed_payload
              @? '$.observations[*] ? (@.type == "person_exited")'
          )
      )::bigint as exit_events,
      count(*) filter (
        where (
          lower(base.headline)
            ~ '(atendimento|cliente.{0,50}balc|balc.{0,50}cliente|pagamento|documento|assinatura)'
          or lower(base.summary)
            ~ '(interag|atend|oper|manuse|apoia|entreg|receb|pag|assin|escrev).{0,100}(balc|terminal)'
          or lower(base.summary)
            ~ '(balc|terminal).{0,100}(interag|atend|oper|manuse|apoia|entreg|receb|pag|assin|escrev)'
          or lower(array_to_string(base.tags, ' '))
            ~ '(customer_interaction|counter_interaction|terminal_interaction|interaction_at_counter|interaction_counter|interacao_no_balcao|interação_balcão|balcão_interação)'
        )
      )::bigint as probable_service_interactions,
      count(*) filter (
        where lower(
          base.headline || ' ' || base.summary || ' '
          || array_to_string(base.tags, ' ')
        ) ~ '(entrega|entregador|delivery|pacote|encomenda|retirada de pacote)'
          or exists (
            select 1
            from people p
            where p.event_id = base.id
              and p.role = 'delivery_person'
          )
      )::bigint as delivery_related_events,
      count(*) filter (
        where base.effective_event_type in (
            'object_appeared', 'object_moved', 'object_removed'
          )
          or (
            not base.has_human_type_correction
            and base.analyzed_payload
              @? '$.objects[*] ? (@.state == "appeared" || @.state == "moved" || @.state == "removed")'
          )
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
    select coalesce(
      jsonb_object_agg(grouped.event_type, grouped.quantity),
      '{}'::jsonb
    ) as value
    from (
      select base.effective_event_type as event_type, count(*)::bigint as quantity
      from base
      group by 1
      order by 2 desc, 1
    ) grouped
  ),
  roles as (
    select coalesce(
      jsonb_object_agg(grouped.role, grouped.quantity),
      '{}'::jsonb
    ) as value
    from (
      select people.role, count(*)::bigint as quantity
      from people
      group by people.role
      order by 2 desc, 1
    ) grouped
  ),
  hours as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('hour', grouped.hour_of_day, 'events', grouped.quantity)
        order by grouped.hour_of_day
      ),
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
  day_hours as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('date', grouped.event_date, 'hours', grouped.hours)
        order by grouped.event_date
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        daily.event_date,
        jsonb_agg(
          jsonb_build_object('hour', daily.hour_of_day, 'events', daily.quantity)
          order by daily.hour_of_day
        ) as hours
      from (
        select
          (base.started_at at time zone v_timezone)::date as event_date,
          date_part('hour', base.started_at at time zone v_timezone)::integer as hour_of_day,
          count(*)::bigint as quantity
        from base
        group by 1, 2
      ) daily
      group by daily.event_date
    ) grouped
  ),
  cameras as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cameraId', grouped.camera_id,
          'cameraName', grouped.camera_name,
          'siteId', grouped.site_id,
          'siteName', grouped.site_name,
          'events', grouped.quantity,
          'averageConfidence', grouped.average_confidence
        )
        order by grouped.quantity desc, grouped.camera_name
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        base.camera_id,
        camera.name as camera_name,
        base.site_id,
        site.name as site_name,
        count(*)::bigint as quantity,
        round(coalesce(avg(base.confidence), 0)::numeric, 4) as average_confidence
      from base
      join public.cameras camera
        on camera.id = base.camera_id
       and camera.organization_id = p_organization_id
      join public.sites site
        on site.id = base.site_id
       and site.organization_id = p_organization_id
      group by base.camera_id, camera.name, base.site_id, site.name
    ) grouped
  ),
  sites as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'siteId', grouped.site_id,
          'siteName', grouped.site_name,
          'events', grouped.quantity,
          'averageConfidence', grouped.average_confidence
        )
        order by grouped.quantity desc, grouped.site_name
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        base.site_id,
        site.name as site_name,
        count(*)::bigint as quantity,
        round(coalesce(avg(base.confidence), 0)::numeric, 4) as average_confidence
      from base
      join public.sites site
        on site.id = base.site_id
       and site.organization_id = p_organization_id
      group by base.site_id, site.name
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
          'eventType', selected.effective_event_type,
          'confidence', selected.confidence
        )
        order by selected.started_at desc
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
    'byDayHour', day_hours.value,
    'byCamera', cameras.value,
    'bySite', sites.value,
    'evidence', evidence.value,
    'definitions', jsonb_build_object(
      'peopleAppearances',
        'Aparições estruturadas; a mesma pessoa pode aparecer em mais de um acontecimento.',
      'customerAppearances',
        'Aparições estimadas na função cliente, não clientes únicos.',
      'probableServiceInteractions',
        'Acontecimentos com sinais visuais de atendimento; não confirma venda ou pagamento.',
      'deliveryRelatedEvents',
        'Acontecimentos com entregador, entrega, retirada ou pacote observável.',
      'vehicleAppearances',
        'Registros de veículos em acontecimentos; não veículos únicos.',
      'byCamera',
        'Contagem de eventos registrados por câmera no período; não é medição física contínua de movimento.'
    )
  ) into v_result
  from totals
  cross join people_totals
  cross join vehicle_totals
  cross join types
  cross join roles
  cross join hours
  cross join day_hours
  cross join cameras
  cross join sites
  cross join evidence;

  return v_result;
end;
$function$;

revoke all on function public.assistant_period_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;

grant execute on function public.assistant_period_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Saúde de câmera: o contrato ganha contagem consecutiva, início e motivos.
-- Não captura imagem nem chama modelo; apenas expõe evidência já calculada.
-- -----------------------------------------------------------------------------

create or replace function public.assistant_camera_health_summary_v1(
  p_organization_id uuid,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $function$
declare
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Acesso negado.';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'cameras_enabled', count(*) filter (where c.health_intelligence_enabled),
      'healthy', count(*) filter (where c.health_status = 'healthy'),
      'learning', count(*) filter (where c.health_status = 'learning'),
      'degraded', count(*) filter (where c.health_status = 'degraded'),
      'critical', count(*) filter (where c.health_status = 'critical'),
      'offline', count(*) filter (where c.health_status = 'offline'),
      'active_incidents', (
        select count(*)
        from public.camera_health_incidents i
        where i.organization_id = p_organization_id
          and (p_camera_id is null or i.camera_id = p_camera_id)
          and (p_site_id is null or i.site_id = p_site_id)
          and i.status in ('observing', 'open')
      ),
      'proposed_baselines', (
        select count(*)
        from public.camera_health_baselines b
        where b.organization_id = p_organization_id
          and (p_camera_id is null or b.camera_id = p_camera_id)
          and (p_site_id is null or b.site_id = p_site_id)
          and b.status = 'proposed'
      )
    ),
    'cameras', coalesce(jsonb_agg(jsonb_build_object(
      'camera_id', c.id,
      'camera_name', c.name,
      'site_id', c.site_id,
      'site_name', site.name,
      'enabled', c.health_intelligence_enabled,
      'health_status', c.health_status,
      'last_observed_at', c.health_last_observed_at,
      'active_incidents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'type', i.incident_type,
          'status', i.status,
          'severity', i.severity,
          'title', i.title,
          'summary', i.summary,
          'reasons', to_jsonb(i.reasons),
          'confidence', i.confidence,
          'consecutive_count', i.consecutive_count,
          'first_observed_at', i.first_observed_at,
          'last_observed_at', i.last_observed_at
        ) order by i.last_observed_at desc)
        from public.camera_health_incidents i
        where i.organization_id = p_organization_id
          and i.camera_id = c.id
          and i.status in ('observing', 'open')
      ), '[]'::jsonb),
      'baseline_status', coalesce((
        select b.status
        from public.camera_health_baselines b
        where b.organization_id = p_organization_id
          and b.camera_id = c.id
        order by b.created_at desc
        limit 1
      ), 'missing')
    ) order by c.name), '[]'::jsonb)
  ) into v_result
  from public.cameras c
  join public.sites site
    on site.id = c.site_id
   and site.organization_id = p_organization_id
  where c.organization_id = p_organization_id
    and c.source_kind = 'live_camera'
    and (p_camera_id is null or c.id = p_camera_id)
    and (p_site_id is null or c.site_id = p_site_id);

  return coalesce(
    v_result,
    jsonb_build_object('summary', '{}'::jsonb, 'cameras', '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.assistant_camera_health_summary_v1(
  uuid, uuid, uuid
) from public, anon;

grant execute on function public.assistant_camera_health_summary_v1(
  uuid, uuid, uuid
) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Rotinas/desvios: adiciona nomes amigáveis junto aos IDs já existentes.
-- A semântica matemática atual (observações, baseline, expectativa, desvio)
-- permanece inalterada.
-- -----------------------------------------------------------------------------

create or replace function public.assistant_routine_deviation_summary(
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
    when not private.is_org_member(p_organization_id) then
      jsonb_build_object('error', 'not_authorized')
    else jsonb_build_object(
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'definitions', jsonb_build_object(
        'declaredSchedule',
          'Horário explicitamente informado pelo usuário. Não é alterado pelo aprendizado.',
        'learnedPattern',
          'Faixa recorrente calculada a partir de observações históricas comparáveis.',
        'observation',
          'O que foi visualmente observado no período.',
        'deviation',
          'Diferença em relação ao horário informado quando ele existe; caso contrário, ao padrão aprendido.',
        'missingEvidence',
          'Ausência de confirmação visual não prova que a ação não aconteceu.'
      ),
      'declaredExpectations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', expectation.id,
            'camera_id', expectation.camera_id,
            'camera_name', camera.name,
            'site_id', expectation.site_id,
            'site_name', site.name,
            'expectation_code', expectation.expectation_code,
            'day_of_week', expectation.day_of_week,
            'expected_center', expectation.expected_center,
            'unit', expectation.unit,
            'grace_before', expectation.grace_before,
            'grace_after', expectation.grace_after,
            'valid_from', expectation.valid_from,
            'valid_until', expectation.valid_until,
            'source', expectation.source,
            'status', expectation.status,
            'metadata', expectation.metadata
          )
          order by expectation.camera_id, expectation.valid_from nulls first,
            expectation.day_of_week, expectation.expectation_code
        )
        from public.operational_expectations expectation
        join public.cameras camera
          on camera.id = expectation.camera_id
         and camera.organization_id = p_organization_id
        join public.sites site
          on site.id = expectation.site_id
         and site.organization_id = p_organization_id
        where expectation.organization_id = p_organization_id
          and expectation.source = 'user'
          and expectation.status = 'active'
          and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
          and (p_camera_id is null or expectation.camera_id = p_camera_id)
          and (p_site_id is null or expectation.site_id = p_site_id)
      ), '[]'::jsonb),
      'baselines', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', baseline.id,
            'camera_id', baseline.camera_id,
            'camera_name', camera.name,
            'site_id', baseline.site_id,
            'site_name', site.name,
            'baseline_code', baseline.baseline_code,
            'day_of_week', baseline.day_of_week,
            'bucket_hour', baseline.bucket_hour,
            'session_type', baseline.session_type,
            'status', baseline.status,
            'sample_count', baseline.sample_count,
            'day_count', baseline.day_count,
            'period_start', baseline.period_start,
            'period_end', baseline.period_end,
            'expected_lower', baseline.lower_value,
            'expected_center', baseline.center_value,
            'expected_upper', baseline.upper_value,
            'unit', baseline.unit,
            'confidence', baseline.confidence
          )
          order by baseline.confidence desc, baseline.baseline_code
        )
        from public.camera_behavior_baselines baseline
        join public.cameras camera
          on camera.id = baseline.camera_id
         and camera.organization_id = p_organization_id
        join public.sites site
          on site.id = baseline.site_id
         and site.organization_id = p_organization_id
        where baseline.organization_id = p_organization_id
          and baseline.status in ('active', 'learning')
          and baseline.day_of_week = -1
          and (p_camera_id is null or baseline.camera_id = p_camera_id)
          and (p_site_id is null or baseline.site_id = p_site_id)
      ), '[]'::jsonb),
      'observations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'camera_id', observation.camera_id,
            'camera_name', camera.name,
            'site_id', observation.site_id,
            'site_name', site.name,
            'local_date', observation.local_date,
            'metric_code', observation.metric_code,
            'observed_value', observation.observed_value,
            'unit', observation.unit,
            'observed_at', observation.observed_at,
            'evidence_event_ids', observation.evidence_event_ids,
            'confidence', observation.confidence
          )
          order by observation.observed_at desc
        )
        from (
          select routine.*
          from public.routine_observations routine
          where routine.organization_id = p_organization_id
            and routine.observed_at >= p_from
            and routine.observed_at < p_to
            and (p_camera_id is null or routine.camera_id = p_camera_id)
            and (p_site_id is null or routine.site_id = p_site_id)
          order by routine.observed_at desc
          limit 100
        ) observation
        join public.cameras camera
          on camera.id = observation.camera_id
         and camera.organization_id = p_organization_id
        join public.sites site
          on site.id = observation.site_id
         and site.organization_id = p_organization_id
      ), '[]'::jsonb),
      'deviations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', deviation.id,
            'observed_at', deviation.observed_at,
            'local_date', deviation.local_date,
            'camera_id', deviation.camera_id,
            'camera_name', camera.name,
            'site_id', deviation.site_id,
            'site_name', site.name,
            'deviation_code', deviation.deviation_code,
            'status', deviation.status,
            'severity', deviation.severity,
            'title', deviation.title,
            'summary', deviation.summary,
            'confidence', deviation.confidence,
            'evidence_event_ids', deviation.evidence_event_ids,
            'observed_value', deviation.observed_value,
            'expected_lower', deviation.expected_lower,
            'expected_center', deviation.expected_center,
            'expected_upper', deviation.expected_upper,
            'unit', deviation.unit,
            'reference', coalesce(deviation.data->>'reference', 'learned_pattern'),
            'data', deviation.data
          )
          order by deviation.observed_at desc
        )
        from public.operational_deviations deviation
        join public.cameras camera
          on camera.id = deviation.camera_id
         and camera.organization_id = p_organization_id
        join public.sites site
          on site.id = deviation.site_id
         and site.organization_id = p_organization_id
        where deviation.organization_id = p_organization_id
          and deviation.observed_at >= p_from
          and deviation.observed_at < p_to
          and (p_camera_id is null or deviation.camera_id = p_camera_id)
          and (p_site_id is null or deviation.site_id = p_site_id)
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_routine_deviation_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;

grant execute on function public.assistant_routine_deviation_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    grant execute on function public.assistant_routine_deviation_summary(
      uuid, timestamptz, timestamptz, uuid, uuid
    ) to monitoria_mcp_readonly;
  end if;
end
$$;

commit;
