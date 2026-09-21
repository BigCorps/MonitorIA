-- MonitorIA RC9 — separação definitiva entre câmeras conectadas e gravações.
--
-- live_camera:
--   monitoramento contínuo, Agent, online/offline, saúde e alertas de conexão.
--
-- local_recording:
--   envio avulso de arquivos, sem Agent, sem online/offline, sem saúde de câmera
--   e sem alertas baseados no relógio atual.
--
-- Inteligência histórica continua disponível para gravações.

begin;

-- 1. O tipo de uma fonte é permanente. Para mudar a finalidade, cria-se outra fonte.
create or replace function private.monitoria_source_kind_immutable_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.source_kind is distinct from new.source_kind then
    raise exception 'source_kind_immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists cameras_source_kind_immutable
  on public.cameras;

create trigger cameras_source_kind_immutable
before update of source_kind
on public.cameras
for each row
execute function private.monitoria_source_kind_immutable_v1();

-- 2. Inteligências incluídas continuam disponíveis para arquivos históricos,
-- mas saúde visual contínua existe apenas em câmeras conectadas.
create or replace function private.apply_monitoria_included_intelligence_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.analysis_plan_code in ('basic', 'standard', 'intensive') then
    new.visual_state_enabled := true;
    new.short_memory_enabled := true;
    new.operational_sessions_enabled := true;
    new.routine_intelligence_enabled := true;
    new.process_intelligence_enabled := true;
    new.staff_profile_intelligence_enabled := true;
    new.vehicle_memory_enabled := true;

    new.health_intelligence_enabled :=
      new.source_kind = 'live_camera';
  end if;

  return new;
end;
$$;

update public.cameras
set
  health_intelligence_enabled = false,
  health_status = 'unknown',
  health_last_observed_at = null,
  updated_at = now()
where source_kind = 'local_recording'
  and (
    health_intelligence_enabled
    or health_status <> 'unknown'
    or health_last_observed_at is not null
  );

-- 3. Patch idempotente das funções contínuas já instaladas.
do $patch$
declare
  v_def text;
  v_new text;
begin
  -- Saúde: nunca avalia gravações como câmera sem sinal.
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'evaluate_camera_health_staleness_v1'
  order by p.oid desc
  limit 1;

  if v_def is not null
     and position('c.source_kind = ''live_camera''' in v_def) = 0 then
    v_new := replace(
      v_def,
      'where c.health_intelligence_enabled',
      'where c.source_kind = ''live_camera'' and c.health_intelligence_enabled'
    );

    if v_new = v_def then
      raise exception 'rc9_camera_health_patch_anchor_not_found';
    end if;

    execute v_new;
  end if;

  -- Desvios "agora/hoje": somente câmeras contínuas.
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'evaluate_all_routine_deviations_v2'
  order by p.oid desc
  limit 1;

  if v_def is not null
     and position('camera.source_kind = ''live_camera''' in v_def) = 0 then
    v_new := replace(
      v_def,
      'where camera.routine_intelligence_enabled',
      'where camera.source_kind = ''live_camera'' and camera.routine_intelligence_enabled'
    );

    if v_new = v_def then
      raise exception 'rc9_routine_live_patch_anchor_not_found';
    end if;

    execute v_new;
  end if;

  -- Alertas operacionais: "câmera offline" só se aplica a live_camera.
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refresh_operational_alerts_v1'
  order by p.oid desc
  limit 1;

  if v_def is not null
     and position('c.source_kind = ''live_camera'' and c.status::text <> ''disabled''' in v_def) = 0 then
    v_new := replace(
      v_def,
      'where c.status::text <> ''disabled''',
      'where c.source_kind = ''live_camera'' and c.status::text <> ''disabled'''
    );

    if v_new = v_def then
      raise exception 'rc9_operational_offline_patch_anchor_not_found';
    end if;

    v_new := replace(
      v_new,
      'format(''%s análises da câmera %s falharam nos últimos 30 minutos.'', x.failures, c.name)',
      'format(''%s análises da fonte %s falharam nos últimos 30 minutos.'', x.failures, c.name)'
    );

    v_new := replace(
      v_new,
      'O consumo projetado atingiu o limite configurado para esta câmera.',
      'O consumo projetado atingiu o limite configurado para esta fonte.'
    );

    execute v_new;
  end if;

  -- Alertas inteligentes são um canal de atenção "agora".
  -- Acontecimentos de gravações continuam no histórico, períodos, processos
  -- e Pesquisa IA, mas não abrem alertas atuais.
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refresh_intelligent_alerts_v1'
  order by p.oid desc
  limit 1;

  if v_def is not null
     and position('source_camera.source_kind = ''live_camera''' in v_def) = 0 then
    v_new := v_def;

    v_new := replace(
      v_new,
      'from public.operational_deviations d',
      'from public.operational_deviations d join public.cameras source_camera on source_camera.id = d.camera_id and source_camera.source_kind = ''live_camera'''
    );

    v_new := replace(
      v_new,
      'from public.operational_process_deviations d',
      'from public.operational_process_deviations d join public.cameras source_camera on source_camera.id = d.camera_id and source_camera.source_kind = ''live_camera'''
    );

    v_new := replace(
      v_new,
      'from public.camera_health_incidents h',
      'from public.camera_health_incidents h join public.cameras source_camera on source_camera.id = h.camera_id and source_camera.source_kind = ''live_camera'''
    );

    v_new := replace(
      v_new,
      'from public.operational_sessions session',
      'from public.operational_sessions session join public.cameras source_camera on source_camera.id = session.camera_id and source_camera.source_kind = ''live_camera'''
    );

    v_new := replace(
      v_new,
      'from public.events e',
      'from public.events e join public.cameras source_camera on source_camera.id = e.camera_id and source_camera.source_kind = ''live_camera'''
    );

    v_new := replace(
      v_new,
      'from public.visual_state_transitions t',
      'from public.visual_state_transitions t join public.cameras source_camera on source_camera.id = t.camera_id and source_camera.source_kind = ''live_camera'''
    );

    if v_new = v_def then
      raise exception 'rc9_intelligent_alert_patch_anchor_not_found';
    end if;

    execute v_new;
  end if;

  -- Entre câmeras é continuidade de fontes conectadas continuamente.
  select pg_get_functiondef(p.oid)
    into v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'refresh_cross_camera_journeys_v1'
  order by p.oid desc
  limit 1;

  if v_def is not null
     and position('c1.source_kind = ''live_camera''' in v_def) = 0 then
    v_new := replace(
      v_def,
      'where e1.started_at >= p_from and e1.started_at < p_to',
      'where c1.source_kind = ''live_camera''
      and c2.source_kind = ''live_camera''
      and e1.started_at >= p_from and e1.started_at < p_to'
    );

    if v_new = v_def then
      raise exception 'rc9_cross_camera_patch_anchor_not_found';
    end if;

    execute v_new;
  end if;
end
$patch$;

-- 4. Limpeza dos falsos estados já produzidos para gravações.
update public.camera_health_incidents incident
set
  status = 'resolved',
  resolved_at = coalesce(incident.resolved_at, now()),
  summary = 'Este ambiente recebe gravações enviadas e não possui estado online/offline.',
  updated_at = now()
where incident.camera_id in (
  select id from public.cameras
  where source_kind = 'local_recording'
)
and incident.status in ('observing', 'open');

update public.operational_alerts alert
set
  status = 'resolved',
  resolved_at = coalesce(alert.resolved_at, now()),
  resolution_reason = 'recording_source_not_live'
where alert.camera_id in (
  select id from public.cameras
  where source_kind = 'local_recording'
)
and alert.status in ('open', 'acknowledged')
and alert.alert_code in (
  'camera_offline',
  'clip_failing'
);

update public.intelligent_alerts alert
set
  status = 'resolved',
  resolved_at = coalesce(alert.resolved_at, now()),
  resolution_reason = 'recording_source_not_live'
where alert.camera_id in (
  select id from public.cameras
  where source_kind = 'local_recording'
)
and alert.status in ('open', 'acknowledged');

update public.operational_insights insight
set
  status = 'resolved',
  valid_until = coalesce(insight.valid_until, now()),
  updated_at = now()
where insight.camera_id in (
  select id from public.cameras
  where source_kind = 'local_recording'
)
and insight.status = 'active'
and (
  insight.insight_type = 'camera_health'
  or insight.phase_source = 'int12'
);

commit;
