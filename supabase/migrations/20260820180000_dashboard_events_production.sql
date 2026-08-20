-- MonitorIA — Dashboard de Produção / Etapa 2 — Acontecimentos
--
-- Objetivos:
-- 1. acontecimentos marcados como irrelevantes deixam de participar das
--    pesquisas e métricas diretas por padrão;
-- 2. a classificação corrigida pelo usuário tem precedência nos tipos;
-- 3. Pesquisa IA e MCP passam a herdar a mesma regra porque utilizam
--    search_monitoria_events / assistant_period_summary;
-- 4. preparar aprendizado supervisionado por recorrência, SEM autoaplicar.
--
-- Esta migration não reconstrói Períodos/Processos. Essa reconciliação fica
-- isolada para a Etapa 3 do Dashboard de Produção.

begin;

create index if not exists events_human_feedback_candidate_idx
  on public.events(
    organization_id,
    camera_id,
    primary_event_type,
    human_verdict,
    human_reviewed_at desc
  )
  where deleted_at is null
    and human_verdict in ('irrelevant', 'incorrect');

-- -------------------------------------------------------------------
-- Pesquisa de acontecimentos: irrelevantes ficam fora por padrão.
-- O filtro explícito "irrelevant" e o filtro "reviewed" continuam
-- permitindo consultar o histórico de avaliações.
-- -------------------------------------------------------------------

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
      ) as thumbnail_asset_id
    from public.events event
    join public.cameras camera
      on camera.id = event.camera_id
    join public.sites site
      on site.id = event.site_id
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
        nullif(pg_catalog.btrim(coalesce(p_query, '')), '') is null
        or event.search_document @@ pg_catalog.websearch_to_tsquery(
          'portuguese'::regconfig,
          pg_catalog.btrim(p_query)
        )
        or event.headline ilike '%' || pg_catalog.btrim(p_query) || '%'
        or event.summary ilike '%' || pg_catalog.btrim(p_query) || '%'
      )
  )
  select
    filtered.*,
    pg_catalog.count(*) over() as total_count
  from filtered
  order by filtered.started_at desc
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

-- -------------------------------------------------------------------
-- Comparações/resumos diretos: mesmos critérios de relevância.
-- -------------------------------------------------------------------

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
as $function$
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
      and event.human_verdict is distinct from 'irrelevant'
      and event.started_at >= p_from
      and event.started_at < p_to
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
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
      pg_catalog.count(*) filter (where base.requires_review)
        as review_required,
      pg_catalog.count(*) filter (where base.human_reviewed_at is not null)
        as reviewed_events,
      pg_catalog.round(pg_catalog.avg(base.confidence)::numeric, 4)
        as average_confidence,
      pg_catalog.round(
        pg_catalog.avg(
          pg_catalog.date_part('epoch', base.ended_at - base.started_at)
        )::numeric,
        2
      ) as average_duration_seconds
    from base
  ),
  types as (
    select coalesce(
      pg_catalog.jsonb_object_agg(grouped.event_type, grouped.quantity),
      '{}'::jsonb
    ) as value
    from (
      select
        coalesce(base.corrected_event_type, base.primary_event_type)
          as event_type,
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
          'hour', grouped.hour_of_day,
          'count', grouped.quantity
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
    'from', p_from,
    'to', p_to,
    'timezone', parameters.timezone,
    'totalEvents', totals.total_events,
    'peopleEvents', totals.people_events,
    'vehicleEvents', totals.vehicle_events,
    'reviewRequired', totals.review_required,
    'reviewedEvents', totals.reviewed_events,
    'averageConfidence', coalesce(totals.average_confidence, 0),
    'averageDurationSeconds', coalesce(totals.average_duration_seconds, 0),
    'byType', types.value,
    'byHour', hours.value
  )
  from totals
  cross join types
  cross join hours
  cross join parameters;
$function$;

revoke all on function private.monitoria_period_metrics(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon, authenticated;

grant execute on function private.monitoria_period_metrics(
  uuid, timestamptz, timestamptz, uuid, uuid
) to service_role;

-- -------------------------------------------------------------------
-- Pesquisa IA / resumo do período.
-- A classificação corrigida impede que o payload antigo volte a contar o
-- acontecimento como entrada/saída/mudança de objeto pelo tipo anterior.
-- -------------------------------------------------------------------

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
      coalesce(
        event.corrected_event_type,
        event.primary_event_type
      ) as effective_event_type,
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
        coalesce(
          avg(date_part('epoch', base.ended_at - base.started_at)),
          0
        )::numeric,
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
            'object_appeared',
            'object_moved',
            'object_removed'
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
      count(*) filter (where role = 'customer')::bigint
        as customer_appearances,
      count(*) filter (where role = 'staff')::bigint
        as staff_appearances,
      count(*) filter (where role = 'delivery_person')::bigint
        as delivery_person_appearances,
      count(*) filter (where role = 'visitor')::bigint
        as visitor_appearances,
      count(*) filter (where role = 'unknown')::bigint
        as unknown_appearances,
      round(coalesce(avg(role_confidence), 0)::numeric, 4)
        as average_role_confidence
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
      select
        base.effective_event_type as event_type,
        count(*)::bigint as quantity
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
        jsonb_build_object(
          'hour', grouped.hour_of_day,
          'events', grouped.quantity
        )
        order by grouped.hour_of_day
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        date_part(
          'hour',
          base.started_at at time zone v_timezone
        )::integer as hour_of_day,
        count(*)::bigint as quantity
      from base
      group by 1
    ) grouped
  ),
  day_hours as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date', grouped.event_date,
          'hours', grouped.hours
        )
        order by grouped.event_date
      ),
      '[]'::jsonb
    ) as value
    from (
      select
        daily.event_date,
        jsonb_agg(
          jsonb_build_object(
            'hour', daily.hour_of_day,
            'events', daily.quantity
          )
          order by daily.hour_of_day
        ) as hours
      from (
        select
          (base.started_at at time zone v_timezone)::date as event_date,
          date_part(
            'hour',
            base.started_at at time zone v_timezone
          )::integer as hour_of_day,
          count(*)::bigint as quantity
        from base
        group by 1, 2
      ) daily
      group by daily.event_date
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
    'period',
    jsonb_build_object(
      'from', p_from,
      'to', p_to,
      'timezone', v_timezone
    ),
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
    'deliveryPersonAppearances',
      people_totals.delivery_person_appearances,
    'visitorAppearances', people_totals.visitor_appearances,
    'unknownAppearances', people_totals.unknown_appearances,
    'averageRoleConfidence', people_totals.average_role_confidence,
    'vehicleAppearances', vehicle_totals.vehicle_appearances,
    'vehicleEvents', vehicle_totals.vehicle_events,
    'byType', types.value,
    'byRole', roles.value,
    'byHour', hours.value,
    'byDayHour', day_hours.value,
    'evidence', evidence.value,
    'definitions',
    jsonb_build_object(
      'peopleAppearances',
        'Aparições estruturadas; a mesma pessoa pode aparecer em mais de um acontecimento.',
      'customerAppearances',
        'Aparições estimadas na função cliente, não clientes únicos.',
      'probableServiceInteractions',
        'Acontecimentos com sinais visuais de atendimento; não confirma venda ou pagamento.',
      'deliveryRelatedEvents',
        'Acontecimentos com entregador, entrega, retirada ou pacote observável.',
      'vehicleAppearances',
        'Registros de veículos em acontecimentos; não veículos únicos.'
    )
  ) into v_result
  from totals
  cross join people_totals
  cross join vehicle_totals
  cross join types
  cross join roles
  cross join hours
  cross join day_hours
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

-- -------------------------------------------------------------------
-- Aprendizado supervisionado — SOMENTE candidatos.
--
-- Não há trigger de autoaplicação, não altera prompts e não altera regras.
-- A função apenas agrupa as correções atuais para que uma próxima etapa
-- possa mostrar sugestões ao owner/admin.
-- -------------------------------------------------------------------

create or replace function public.get_event_refinement_candidates_v1(
  p_organization_id uuid,
  p_camera_id uuid default null
)
returns table(
  camera_id uuid,
  camera_name text,
  original_event_type text,
  verdict text,
  corrected_event_type text,
  correction_count bigint,
  first_reviewed_at timestamptz,
  last_reviewed_at timestamptz,
  readiness text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with grouped as (
    select
      event.camera_id,
      camera.name as camera_name,
      event.primary_event_type as original_event_type,
      event.human_verdict as verdict,
      case
        when event.human_verdict = 'incorrect'
          then event.corrected_event_type
        else null
      end as corrected_event_type,
      count(*)::bigint as correction_count,
      min(event.human_reviewed_at) as first_reviewed_at,
      max(event.human_reviewed_at) as last_reviewed_at
    from public.events event
    join public.cameras camera
      on camera.id = event.camera_id
    where event.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and event.deleted_at is null
      and event.human_reviewed_at is not null
      and event.human_verdict in ('irrelevant', 'incorrect')
      and (
        event.human_verdict <> 'incorrect'
        or event.corrected_event_type is not null
      )
      and (p_camera_id is null or event.camera_id = p_camera_id)
    group by
      event.camera_id,
      camera.name,
      event.primary_event_type,
      event.human_verdict,
      case
        when event.human_verdict = 'incorrect'
          then event.corrected_event_type
        else null
      end
  )
  select
    grouped.camera_id,
    grouped.camera_name,
    grouped.original_event_type,
    grouped.verdict,
    grouped.corrected_event_type,
    grouped.correction_count,
    grouped.first_reviewed_at,
    grouped.last_reviewed_at,
    case
      when grouped.correction_count >= 5 then 'strong_suggestion'
      when grouped.correction_count >= 3 then 'can_suggest'
      else 'collecting'
    end as readiness
  from grouped
  order by
    grouped.correction_count desc,
    grouped.last_reviewed_at desc;
$function$;

revoke all on function public.get_event_refinement_candidates_v1(uuid, uuid)
  from public, anon;

grant execute on function public.get_event_refinement_candidates_v1(uuid, uuid)
  to authenticated, service_role;

comment on function public.get_event_refinement_candidates_v1(uuid, uuid) is
  'Agrupa correções humanas recorrentes para aprendizado supervisionado. Não aplica refinamentos automaticamente.';

commit;
