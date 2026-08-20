-- MonitorIA — Dashboard de Produção — Etapa 5 — Processos
-- Base: main a989534ea74558e4e2c9252ff93780513b004090
--
-- Modelos genéricos observam; processos personalizados definem regras.
-- Avaliações humanas de Acontecimentos também valem no motor de Processos.

begin;

-- Modelos padrão v2: preserva v1 arquivado e cria versão observacional.
do $block$
declare
  v_definition public.operational_process_definitions%rowtype;
  v_new_id uuid;
  v_version integer;
begin
  for v_definition in
    select definition.*
    from public.operational_process_definitions definition
    where definition.source = 'system'
      and definition.status = 'active'
      and coalesce(
        definition.metadata->>'productionMode',
        ''
      ) <> 'observational'
    order by definition.process_code
  loop
    select coalesce(max(existing.version), 0) + 1
    into v_version
    from public.operational_process_definitions existing
    where existing.scope_key = v_definition.scope_key
      and existing.process_code = v_definition.process_code;

    update public.operational_process_definitions
    set status = 'archived',
        updated_at = now()
    where id = v_definition.id;

    insert into public.operational_process_definitions (
      organization_id,
      site_id,
      camera_id,
      scope_key,
      process_code,
      version,
      name,
      description,
      session_type,
      source,
      status,
      strictness,
      expected_duration_min_seconds,
      expected_duration_max_seconds,
      result_policy,
      created_by,
      metadata
    ) values (
      null,
      null,
      null,
      v_definition.scope_key,
      v_definition.process_code,
      v_version,
      v_definition.name,
      v_definition.description,
      v_definition.session_type,
      'system',
      'active',
      v_definition.strictness,
      v_definition.expected_duration_min_seconds,
      v_definition.expected_duration_max_seconds,
      v_definition.result_policy,
      null,
      coalesce(v_definition.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'generic', true,
          'productionMode', 'observational',
          'basedOnVersion', v_definition.version
        )
    )
    returning id into v_new_id;

    insert into public.operational_process_steps (
      organization_id,
      process_definition_id,
      step_code,
      name,
      description,
      sort_order,
      required,
      repeatable,
      terminal,
      accepted_chapter_types,
      minimum_confidence,
      maximum_gap_seconds,
      evidence_required,
      metadata
    )
    select
      null,
      v_new_id,
      step.step_code,
      step.name,
      step.description,
      step.sort_order,
      false,
      step.repeatable,
      step.terminal,
      step.accepted_chapter_types,
      step.minimum_confidence,
      step.maximum_gap_seconds,
      step.evidence_required,
      coalesce(step.metadata, '{}'::jsonb)
        || jsonb_build_object(
          'system_template', true,
          'recommendedRequired', step.required,
          'productionMode', 'observational'
        )
    from public.operational_process_steps step
    where step.process_definition_id = v_definition.id
    order by step.sort_order;
  end loop;
end;
$block$;

-- Modelo padrão ou ocorrência meramente informativa nunca vira pendência ativa.
create or replace function private.upsert_process_deviation_v1(
  p_instance public.operational_process_instances,
  p_step_id uuid,
  p_key text,
  p_code text,
  p_severity text,
  p_title text,
  p_summary text,
  p_confidence numeric,
  p_observed_at timestamptz,
  p_evidence_event_ids uuid[],
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_source text := 'system';
  v_status text;
  v_severity text;
begin
  select definition.source
  into v_source
  from public.operational_process_definitions definition
  where definition.id = p_instance.process_definition_id;

  v_status := case
    when coalesce(v_source, 'system') = 'system' then 'informational'
    when p_severity = 'info' then 'informational'
    else 'active'
  end;

  v_severity := case
    when coalesce(v_source, 'system') = 'system' then 'info'
    else p_severity
  end;

  insert into public.operational_process_deviations (
    organization_id,
    site_id,
    camera_id,
    process_instance_id,
    process_step_id,
    deviation_key,
    deviation_code,
    status,
    severity,
    title,
    summary,
    confidence,
    observed_at,
    resolved_at,
    evidence_event_ids,
    data
  ) values (
    p_instance.organization_id,
    p_instance.site_id,
    p_instance.camera_id,
    p_instance.id,
    p_step_id,
    p_key,
    p_code,
    v_status,
    v_severity,
    p_title,
    p_summary,
    greatest(0, least(1, coalesce(p_confidence, 0))),
    p_observed_at,
    case when v_status = 'active' then null else p_observed_at end,
    coalesce(p_evidence_event_ids, '{}'),
    coalesce(p_data, '{}'::jsonb)
      || jsonb_build_object(
        'definitionSource',
        coalesce(v_source, 'system')
      )
  )
  on conflict (process_instance_id, deviation_key) do update set
    process_step_id = excluded.process_step_id,
    deviation_code = excluded.deviation_code,
    status = excluded.status,
    severity = excluded.severity,
    title = excluded.title,
    summary = excluded.summary,
    confidence = excluded.confidence,
    observed_at = excluded.observed_at,
    resolved_at = excluded.resolved_at,
    evidence_event_ids = excluded.evidence_event_ids,
    data = excluded.data,
    updated_at = now()
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function private.upsert_process_deviation_v1(
  public.operational_process_instances,
  uuid,text,text,text,text,text,numeric,timestamptz,uuid[],jsonb
) from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.upsert_process_deviation_v1(
  public.operational_process_instances,
  uuid,text,text,text,text,text,numeric,timestamptz,uuid[],jsonb
) to service_role;

create or replace function private.upsert_process_insight_v1(
  p_instance public.operational_process_instances,
  p_severity text,
  p_data jsonb,
  p_evidence_event_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_source text := 'system';
  v_status text;
  v_severity text;
begin
  select definition.source
  into v_source
  from public.operational_process_definitions definition
  where definition.id = p_instance.process_definition_id;

  v_status := case
    when coalesce(v_source, 'system') = 'system'
      then 'informational'
    when p_instance.status in ('open', 'incomplete', 'uncertain')
      then 'active'
    else 'informational'
  end;

  v_severity := case
    when coalesce(v_source, 'system') = 'system' then 'info'
    else p_severity
  end;

  select insight.id into v_id
  from public.operational_insights insight
  where insight.organization_id = p_instance.organization_id
    and insight.insight_type = 'process'
    and insight.source_entity_type = 'process_instance'
    and insight.source_entity_id = p_instance.id
  order by insight.created_at desc
  limit 1;

  if v_id is null then
    insert into public.operational_insights (
      organization_id,site_id,camera_id,insight_type,status,severity,
      title,summary,confidence,observed_at,valid_until,
      source_entity_type,source_entity_id,evidence_event_ids,
      phase_source,data
    ) values (
      p_instance.organization_id,
      p_instance.site_id,
      p_instance.camera_id,
      'process',
      v_status,
      v_severity,
      p_instance.title,
      p_instance.summary,
      p_instance.confidence,
      p_instance.last_observed_at,
      null,
      'process_instance',
      p_instance.id,
      coalesce(p_evidence_event_ids, '{}'),
      'dashboard-production-5',
      coalesce(p_data, '{}'::jsonb)
        || jsonb_build_object(
          'definitionSource',
          coalesce(v_source, 'system')
        )
    )
    returning id into v_id;
  else
    update public.operational_insights
    set status = v_status,
        severity = v_severity,
        title = p_instance.title,
        summary = p_instance.summary,
        confidence = p_instance.confidence,
        observed_at = p_instance.last_observed_at,
        evidence_event_ids = coalesce(p_evidence_event_ids, '{}'),
        phase_source = 'dashboard-production-5',
        data = coalesce(p_data, '{}'::jsonb)
          || jsonb_build_object(
            'definitionSource',
            coalesce(v_source, 'system')
          ),
        updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$function$;

revoke all on function private.upsert_process_insight_v1(
  public.operational_process_instances,text,jsonb,uuid[]
) from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.upsert_process_insight_v1(
  public.operational_process_instances,text,jsonb,uuid[]
) to service_role;

-- Legado: mantém histórico, mas tira modelos genéricos das pendências.
update public.operational_process_deviations deviation
set status = 'informational',
    severity = 'info',
    resolved_at = coalesce(deviation.resolved_at, now()),
    data = coalesce(deviation.data, '{}'::jsonb)
      || jsonb_build_object(
        'legacyReclassifiedBy',
        'dashboard-production-5'
      ),
    updated_at = now()
from public.operational_process_instances instance
join public.operational_process_definitions definition
  on definition.id = instance.process_definition_id
where deviation.process_instance_id = instance.id
  and definition.source = 'system'
  and deviation.status = 'active';

update public.operational_insights insight
set status = 'informational',
    severity = 'info',
    data = coalesce(insight.data, '{}'::jsonb)
      || jsonb_build_object(
        'legacyReclassifiedBy',
        'dashboard-production-5'
      ),
    updated_at = now()
from public.operational_process_instances instance
join public.operational_process_definitions definition
  on definition.id = instance.process_definition_id
where insight.insight_type = 'process'
  and insight.source_entity_type = 'process_instance'
  and insight.source_entity_id = instance.id
  and definition.source = 'system'
  and insight.status = 'active';

-- Injeta a visibilidade pós-revisão em todas as leituras de capítulos do motor.
do $patch$
declare
  v_definition text;
  v_original text;
  v_search text := 'where session_event.session_id = v_session.id';
  v_replace text :=
    'where session_event.session_id = v_session.id'
    || E'\n      and private.monitoria_event_visible_after_review('
    || E'\n        session_event.event_id,'
    || E'\n        v_session.organization_id'
    || E'\n      )';
begin
  select pg_get_functiondef(
    'public.refresh_operational_process_for_session_v1(uuid)'::regprocedure
  )
  into v_definition;

  if position(
    'private.monitoria_event_visible_after_review('
    in v_definition
  ) = 0 then
    if position(v_search in v_definition) = 0 then
      raise exception
        'process_engine_patch_guard_failed: expected session_event selector';
    end if;

    v_original := v_definition;
    v_definition := replace(v_definition, v_search, v_replace);

    if v_definition = v_original then
      raise exception 'process_engine_patch_guard_failed: no replacement';
    end if;

    execute v_definition;
  end if;
end;
$patch$;

-- Período sem registro relevante não vira falso processo incompleto.
create or replace function public.refresh_operational_process_for_session_v2(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.operational_sessions%rowtype;
  v_instance public.operational_process_instances%rowtype;
begin
  select *
  into v_session
  from public.operational_sessions
  where id = p_session_id;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'session_not_found'
    );
  end if;

  if coalesce(v_session.chapter_count, 0) = 0
     or not private.monitoria_session_has_visible_event(
       v_session.id,
       v_session.organization_id
     ) then
    select *
    into v_instance
    from public.operational_process_instances
    where operational_session_id = p_session_id;

    if found then
      update public.operational_process_deviations
      set status = 'resolved',
          resolved_at = coalesce(resolved_at, now()),
          updated_at = now()
      where process_instance_id = v_instance.id
        and status = 'active';

      update public.operational_insights
      set status = 'resolved',
          valid_until = coalesce(valid_until, now()),
          updated_at = now()
      where insight_type = 'process'
        and source_entity_type = 'process_instance'
        and source_entity_id = v_instance.id
        and status = 'active';

      update public.operational_process_instances
      set status = 'aborted',
          result_code = 'no_relevant_records',
          required_steps_total = 0,
          required_steps_completed = 0,
          observed_steps_count = 0,
          unexpected_steps_count = 0,
          progress_ratio = 0,
          next_expected_step_code = null,
          summary =
            'Nenhum registro relevante permaneceu após a revisão.',
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'reviewReconciled',
              true,
              'reviewReconciledAt',
              now()
            ),
          updated_at = now()
      where id = v_instance.id;
    end if;

    return jsonb_build_object(
      'ok', true,
      'skipped', true,
      'reason', 'no_relevant_records'
    );
  end if;

  return public.refresh_operational_process_for_session_v1(
    p_session_id
  );
end;
$function$;

revoke all on function public.refresh_operational_process_for_session_v2(uuid)
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function public.refresh_operational_process_for_session_v2(uuid)
  to service_role;

-- Fila mantém contrato existente, usando a camada reconciliada v2.
create or replace function public.process_operational_process_refresh_queue_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_result jsonb;
begin
  for v_row in
    select queue.operational_session_id
    from public.operational_process_refresh_queue queue
    where queue.next_attempt_at <= now()
      and (
        queue.locked_at is null
        or queue.locked_at < now() - interval '10 minutes'
      )
    order by queue.requested_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    for update skip locked
  loop
    update public.operational_process_refresh_queue
    set locked_at = now(),
        attempt_count = attempt_count + 1
    where operational_session_id = v_row.operational_session_id;

    begin
      v_result :=
        public.refresh_operational_process_for_session_v2(
          v_row.operational_session_id
        );

      delete from public.operational_process_refresh_queue
      where operational_session_id = v_row.operational_session_id;

      v_processed := v_processed + 1;
    exception when others then
      update public.operational_process_refresh_queue
      set locked_at = null,
          next_attempt_at = now()
            + make_interval(
                mins => least(
                  60,
                  greatest(1, attempt_count * 2)
                )
              ),
          last_error = left(sqlerrm, 1000)
      where operational_session_id = v_row.operational_session_id;

      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'processed', v_processed,
    'failed', v_failed,
    'remaining', (
      select count(*)
      from public.operational_process_refresh_queue
      where next_attempt_at <= now()
    )
  );
end;
$function$;

revoke all on function public.process_operational_process_refresh_queue_v1(integer)
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function public.process_operational_process_refresh_queue_v1(integer)
  to service_role;

create or replace function public.refresh_all_operational_processes_v1(
  p_organization_id uuid default null,
  p_camera_id uuid default null,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session record;
  v_scanned integer := 0;
  v_written integer := 0;
  v_failed integer := 0;
  v_result jsonb;
begin
  for v_session in
    select session.id
    from public.operational_sessions session
    join public.cameras camera
      on camera.id = session.camera_id
    where camera.process_intelligence_enabled = true
      and (
        p_organization_id is null
        or session.organization_id = p_organization_id
      )
      and (
        p_camera_id is null
        or session.camera_id = p_camera_id
      )
    order by session.started_at desc
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
  loop
    v_scanned := v_scanned + 1;

    begin
      v_result :=
        public.refresh_operational_process_for_session_v2(
          v_session.id
        );

      if coalesce((v_result->>'ok')::boolean, false) then
        v_written := v_written + 1;
      end if;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'sessionsScanned', v_scanned,
    'instancesWritten', v_written,
    'failed', v_failed
  );
end;
$function$;

revoke all on function public.refresh_all_operational_processes_v1(
  uuid,uuid,integer
) from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function public.refresh_all_operational_processes_v1(
  uuid,uuid,integer
) to service_role;


-- Personalização: pausar volta ao escopo inferior/modelo padrão.
create or replace function public.pause_operational_process_definition_v1(
  p_definition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition public.operational_process_definitions%rowtype;
begin
  select *
  into v_definition
  from public.operational_process_definitions
  where id = p_definition_id
  for update;

  if not found or v_definition.organization_id is null then
    raise exception 'process_definition_not_found';
  end if;

  if not private.has_org_role(
    v_definition.organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
    raise exception 'organization_admin_required';
  end if;

  update public.operational_process_definitions
  set status = 'paused',
      updated_at = now()
  where id = p_definition_id
    and status = 'active';

  insert into public.operational_process_refresh_queue (
    operational_session_id,
    organization_id,
    camera_id,
    reason
  )
  select
    session.id,
    session.organization_id,
    session.camera_id,
    'process_definition_paused'
  from public.operational_sessions session
  where session.organization_id = v_definition.organization_id
    and session.session_type = v_definition.session_type
    and (
      v_definition.site_id is null
      or session.site_id = v_definition.site_id
    )
    and (
      v_definition.camera_id is null
      or session.camera_id = v_definition.camera_id
    )
  on conflict (operational_session_id) do update
  set reason = excluded.reason,
      requested_at = now(),
      next_attempt_at = now(),
      locked_at = null,
      last_error = null;

  return jsonb_build_object(
    'ok', true,
    'definitionId', p_definition_id,
    'status', 'paused'
  );
end;
$function$;

create or replace function public.restore_operational_process_definition_v1(
  p_definition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_definition public.operational_process_definitions%rowtype;
  v_scope_id uuid;
  v_steps jsonb;
  v_result jsonb;
begin
  select *
  into v_definition
  from public.operational_process_definitions
  where id = p_definition_id;

  if not found or v_definition.organization_id is null then
    raise exception 'process_definition_not_found';
  end if;

  if not private.has_org_role(
    v_definition.organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
    raise exception 'organization_admin_required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'stepCode', step.step_code,
        'name', step.name,
        'description', step.description,
        'required', step.required,
        'repeatable', step.repeatable,
        'terminal', step.terminal,
        'acceptedChapterTypes', step.accepted_chapter_types,
        'minimumConfidence', step.minimum_confidence,
        'maximumGapSeconds', step.maximum_gap_seconds,
        'evidenceRequired', step.evidence_required
      )
      order by step.sort_order
    ),
    '[]'::jsonb
  )
  into v_steps
  from public.operational_process_steps step
  where step.process_definition_id = v_definition.id;

  v_scope_id := case v_definition.source
    when 'site' then v_definition.site_id
    when 'camera' then v_definition.camera_id
    else null
  end;

  v_result := public.save_operational_process_definition_v1(
    v_definition.organization_id,
    v_definition.process_code,
    v_definition.name,
    v_definition.description,
    v_definition.session_type,
    v_definition.source,
    v_scope_id,
    v_definition.strictness,
    v_steps
  );

  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object(
      'restoredFromDefinitionId',
      p_definition_id,
      'restoredFromVersion',
      v_definition.version
    );
end;
$function$;

revoke all on function public.pause_operational_process_definition_v1(uuid)
  from public, anon;
grant execute on function public.pause_operational_process_definition_v1(uuid)
  to authenticated, service_role;

revoke all on function public.restore_operational_process_definition_v1(uuid)
  from public, anon;
grant execute on function public.restore_operational_process_definition_v1(uuid)
  to authenticated, service_role;

-- Pesquisa IA e MCP: mesma fonte, linguagem e regra de atenção.
create or replace function public.assistant_operational_process_summary_v1(
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
  v_summary jsonb;
  v_instances jsonb;
  v_deviations jsonb;
  v_custom_definitions jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  with filtered as (
    select
      instance.*,
      definition.source as definition_source,
      definition.version as definition_version
    from public.operational_process_instances instance
    join public.operational_process_definitions definition
      on definition.id = instance.process_definition_id
    where instance.organization_id = p_organization_id
      and instance.started_at >= p_from
      and instance.started_at < p_to
      and (
        p_camera_id is null
        or instance.camera_id = p_camera_id
      )
      and (
        p_site_id is null
        or instance.site_id = p_site_id
      )
      and private.monitoria_session_has_visible_event(
        instance.operational_session_id,
        p_organization_id
      )
  )
  select jsonb_build_object(
    'total', count(*),
    'inProgress',
      count(*) filter (where status = 'open'),
    'observedWithDefaultModel',
      count(*) filter (
        where definition_source = 'system'
          and status <> 'open'
      ),
    'completedConfigured',
      count(*) filter (
        where definition_source <> 'system'
          and status = 'completed'
      ),
    'configuredNeedsAttention',
      count(*) filter (
        where definition_source <> 'system'
          and status in ('incomplete', 'uncertain')
      )
  )
  into v_summary
  from filtered;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', row_value.id,
        'camera_id', row_value.camera_id,
        'camera_name', row_value.camera_name,
        'operational_session_id', row_value.operational_session_id,
        'process_code', row_value.process_code,
        'process_name', row_value.process_name,
        'configured', row_value.definition_source <> 'system',
        'definition_source', row_value.definition_source,
        'definition_version', row_value.definition_version,
        'status',
          case
            when row_value.definition_source = 'system'
                 and row_value.status <> 'open'
              then 'observed'
            else row_value.status
          end,
        'started_at', row_value.started_at,
        'ended_at', row_value.ended_at,
        'duration_seconds', row_value.duration_seconds,
        'summary', row_value.summary,
        'steps', row_value.steps,
        'evidence_event_ids', row_value.evidence_event_ids
      )
      order by row_value.started_at desc
    ),
    '[]'::jsonb
  )
  into v_instances
  from (
    select
      instance.id,
      instance.camera_id,
      camera.name as camera_name,
      instance.operational_session_id,
      instance.process_code,
      instance.process_name,
      instance.status,
      definition.source as definition_source,
      definition.version as definition_version,
      instance.started_at,
      instance.ended_at,
      instance.duration_seconds,
      instance.summary,
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'step_name', process_step.step_name,
              'status', process_step.status,
              'observed_at', process_step.observed_at
            )
            order by
              coalesce(
                nullif(process_step.expected_order, 0),
                process_step.observed_order,
                999
              )
          )
          from public.operational_process_instance_steps process_step
          where process_step.process_instance_id = instance.id
            and (
              process_step.event_id is null
              or private.monitoria_event_visible_after_review(
                process_step.event_id,
                p_organization_id
              )
            )
            and (
              definition.source <> 'system'
              or process_step.status not in ('missing', 'unexpected')
            )
        ),
        '[]'::jsonb
      ) as steps,
      coalesce(
        (
          select array_agg(distinct evidence_id)
          from public.operational_process_instance_steps process_step
          cross join lateral unnest(
            process_step.evidence_event_ids
          ) evidence_id
          where process_step.process_instance_id = instance.id
            and private.monitoria_event_visible_after_review(
              evidence_id,
              p_organization_id
            )
        ),
        '{}'::uuid[]
      ) as evidence_event_ids
    from public.operational_process_instances instance
    join public.operational_process_definitions definition
      on definition.id = instance.process_definition_id
    join public.cameras camera
      on camera.id = instance.camera_id
    where instance.organization_id = p_organization_id
      and instance.started_at >= p_from
      and instance.started_at < p_to
      and (
        p_camera_id is null
        or instance.camera_id = p_camera_id
      )
      and (
        p_site_id is null
        or instance.site_id = p_site_id
      )
      and private.monitoria_session_has_visible_event(
        instance.operational_session_id,
        p_organization_id
      )
    order by instance.started_at desc
    limit 100
  ) row_value;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', deviation.id,
        'camera_id', deviation.camera_id,
        'process_instance_id', deviation.process_instance_id,
        'deviation_code', deviation.deviation_code,
        'severity', deviation.severity,
        'title', deviation.title,
        'summary', deviation.summary,
        'observed_at', deviation.observed_at,
        'evidence_event_ids',
          coalesce(
            (
              select array_agg(evidence_id)
              from unnest(deviation.evidence_event_ids) evidence_id
              where private.monitoria_event_visible_after_review(
                evidence_id,
                p_organization_id
              )
            ),
            '{}'::uuid[]
          )
      )
      order by deviation.observed_at desc
    ),
    '[]'::jsonb
  )
  into v_deviations
  from public.operational_process_deviations deviation
  join public.operational_process_instances instance
    on instance.id = deviation.process_instance_id
  join public.operational_process_definitions definition
    on definition.id = instance.process_definition_id
  where deviation.organization_id = p_organization_id
    and deviation.status = 'active'
    and definition.source <> 'system'
    and deviation.observed_at >= p_from
    and deviation.observed_at < p_to
    and (
      p_camera_id is null
      or deviation.camera_id = p_camera_id
    )
    and (
      p_site_id is null
      or instance.site_id = p_site_id
    )
    and private.monitoria_session_has_visible_event(
      instance.operational_session_id,
      p_organization_id
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', definition.id,
        'process_code', definition.process_code,
        'name', definition.name,
        'version', definition.version,
        'scope', definition.source,
        'site_id', definition.site_id,
        'camera_id', definition.camera_id,
        'strictness', definition.strictness,
        'steps',
          coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'name', step.name,
                  'required', step.required,
                  'accepted_visual_signals',
                    step.accepted_chapter_types
                )
                order by step.sort_order
              )
              from public.operational_process_steps step
              where step.process_definition_id = definition.id
            ),
            '[]'::jsonb
          )
      )
      order by definition.updated_at desc
    ),
    '[]'::jsonb
  )
  into v_custom_definitions
  from public.operational_process_definitions definition
  where definition.organization_id = p_organization_id
    and definition.status = 'active'
    and definition.source <> 'system'
    and (
      p_site_id is null
      or definition.site_id is null
      or definition.site_id = p_site_id
    )
    and (
      p_camera_id is null
      or definition.camera_id is null
      or definition.camera_id = p_camera_id
    );

  return jsonb_build_object(
    'summary', coalesce(v_summary, '{}'::jsonb),
    'instances', v_instances,
    'attention', v_deviations,
    'configuredProcesses', v_custom_definitions,
    'definitions', jsonb_build_object(
      'defaultModel',
        'Modelo visual do MonitorIA usado apenas para organizar observações. Não representa uma regra declarada pela empresa.',
      'configuredProcess',
        'Processo que owner ou admin personalizou. Etapas obrigatórias podem gerar atenção quando não há confirmação visual suficiente.',
      'missing',
        'Não confirmado visualmente. Isso não prova que a etapa não aconteceu.',
      'refinement',
        'Sugestões recorrentes nunca alteram o processo sozinhas; uma nova versão só é criada após aprovação humana.'
    )
  );
end;
$function$;

revoke all on function public.assistant_operational_process_summary_v1(
  uuid,timestamptz,timestamptz,uuid,uuid
) from public, anon;
grant execute on function public.assistant_operational_process_summary_v1(
  uuid,timestamptz,timestamptz,uuid,uuid
) to authenticated, monitoria_mcp_readonly, service_role;

-- Reprocessamento seguro e gradual: usa a fila e o cron já existente.
insert into public.operational_process_refresh_queue (
  operational_session_id,
  organization_id,
  camera_id,
  reason,
  requested_at,
  next_attempt_at,
  locked_at,
  last_error
)
select
  session.id,
  session.organization_id,
  session.camera_id,
  'dashboard_production_5',
  now(),
  now(),
  null,
  null
from public.operational_sessions session
join public.cameras camera
  on camera.id = session.camera_id
where camera.process_intelligence_enabled = true
on conflict (operational_session_id) do update
set reason = excluded.reason,
    requested_at = excluded.requested_at,
    next_attempt_at = now(),
    locked_at = null,
    last_error = null;

commit;
