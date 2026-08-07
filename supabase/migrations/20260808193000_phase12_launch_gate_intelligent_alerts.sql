-- MonitorIA — Fase 12
-- Alertas inteligentes, evidências de homologação e gate auditável de lançamento.
-- Esta migration não abre cadastro geral, não envia campanhas e não chama IA.

begin;

create table if not exists public.intelligent_alert_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  minimum_confidence numeric(5,4) not null default 0.65
    check (minimum_confidence between 0 and 1),
  queue_people_limit integer not null default 5 check (queue_people_limit between 2 and 100),
  long_session_minutes integer not null default 60 check (long_session_minutes between 10 and 1440),
  enabled_codes text[] not null default array[
    'opening_late','closing_missing','reopened_activity','restricted_access',
    'object_removed','equipment_after_hours','queue_excessive','session_long',
    'camera_obstructed','camera_drift','camera_low_quality','process_incomplete'
  ]::text[],
  updated_at timestamptz not null default now()
);

alter table public.intelligent_alert_settings enable row level security;
drop policy if exists intelligent_alert_settings_member_select on public.intelligent_alert_settings;
create policy intelligent_alert_settings_member_select
on public.intelligent_alert_settings for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists intelligent_alert_settings_admin_insert on public.intelligent_alert_settings;
create policy intelligent_alert_settings_admin_insert
on public.intelligent_alert_settings for insert to authenticated
with check (private.has_org_role(
  organization_id,
  array['owner'::public.organization_role, 'admin'::public.organization_role]
));
drop policy if exists intelligent_alert_settings_admin_update on public.intelligent_alert_settings;
create policy intelligent_alert_settings_admin_update
on public.intelligent_alert_settings for update to authenticated
using (private.has_org_role(
  organization_id,
  array['owner'::public.organization_role, 'admin'::public.organization_role]
))
with check (private.has_org_role(
  organization_id,
  array['owner'::public.organization_role, 'admin'::public.organization_role]
));

revoke all on table public.intelligent_alert_settings from public, anon, authenticated;
grant select, insert, update on table public.intelligent_alert_settings to authenticated;
grant all on table public.intelligent_alert_settings to service_role;

create table if not exists public.intelligent_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid references public.sites(id) on delete cascade,
  camera_id uuid references public.cameras(id) on delete cascade,
  alert_code text not null check (alert_code in (
    'opening_late','closing_missing','reopened_activity','restricted_access',
    'object_removed','equipment_after_hours','queue_excessive','session_long',
    'camera_obstructed','camera_drift','camera_low_quality','process_incomplete'
  )),
  severity text not null check (severity in ('info','warning','critical')),
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  dedupe_key text not null check (char_length(dedupe_key) between 3 and 240),
  title text not null check (char_length(title) between 3 and 180),
  summary text not null check (char_length(summary) between 3 and 1200),
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  reason text not null check (char_length(reason) between 3 and 600),
  threshold jsonb not null default '{}'::jsonb check (jsonb_typeof(threshold) = 'object'),
  recommendation text not null check (char_length(recommendation) between 3 and 600),
  condition jsonb not null default '{}'::jsonb check (jsonb_typeof(condition) = 'object'),
  evidence_event_ids uuid[] not null default '{}',
  source_entity_type text not null,
  source_entity_id uuid not null,
  insight_id uuid references public.operational_insights(id) on delete set null,
  observed_at timestamptz not null,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  last_evaluated_at timestamptz not null default now(),
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists intelligent_alerts_active_dedupe_idx
  on public.intelligent_alerts(organization_id, dedupe_key)
  where status in ('open','acknowledged');
create index if not exists intelligent_alerts_org_status_time_idx
  on public.intelligent_alerts(organization_id, status, last_observed_at desc);
create index if not exists intelligent_alerts_source_idx
  on public.intelligent_alerts(source_entity_type, source_entity_id);

drop trigger if exists intelligent_alerts_set_updated_at on public.intelligent_alerts;
create trigger intelligent_alerts_set_updated_at
before update on public.intelligent_alerts
for each row execute function public.set_updated_at();

alter table public.intelligent_alerts enable row level security;
drop policy if exists intelligent_alerts_member_select on public.intelligent_alerts;
create policy intelligent_alerts_member_select
on public.intelligent_alerts for select to authenticated
using (private.is_org_member(organization_id));

revoke all on table public.intelligent_alerts from public, anon, authenticated;
grant select on table public.intelligent_alerts to authenticated;
grant all on table public.intelligent_alerts to service_role;

comment on table public.intelligent_alerts is
  'Alertas determinísticos derivados de evidências já calculadas. Não executa inferência adicional.';

create or replace function private.upsert_intelligent_alert_v1(
  p_organization_id uuid,
  p_site_id uuid,
  p_camera_id uuid,
  p_alert_code text,
  p_severity text,
  p_dedupe_key text,
  p_title text,
  p_summary text,
  p_confidence numeric,
  p_reason text,
  p_threshold jsonb,
  p_recommendation text,
  p_condition jsonb,
  p_evidence_event_ids uuid[],
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_observed_at timestamptz,
  p_evaluated_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_alert_id uuid;
  v_insight_id uuid;
begin
  update public.operational_insights set
    status = 'active',
    severity = case when p_severity='warning' then 'medium' else p_severity end,
    title = p_title, summary = p_summary,
    confidence = least(1, greatest(0, p_confidence)), observed_at = p_observed_at,
    valid_until = p_evaluated_at + interval '2 hours',
    evidence_event_ids = coalesce(p_evidence_event_ids, '{}'),
    data = jsonb_build_object(
      'kind', 'alert', 'alertCode', p_alert_code, 'dedupeKey', p_dedupe_key,
      'condition', coalesce(p_condition, '{}'::jsonb),
      'reason', p_reason, 'threshold', coalesce(p_threshold, '{}'::jsonb),
      'recommendation', p_recommendation, 'additionalModelCalls', 0
    ), updated_at = p_evaluated_at
  where organization_id = p_organization_id
    and phase_source = 'int12'
    and insight_type = 'alert'
    and data->>'dedupeKey' = p_dedupe_key
    and status = 'active'
  returning id into v_insight_id;

  if v_insight_id is null then
    insert into public.operational_insights (
      organization_id, site_id, camera_id, insight_type, status, severity,
      title, summary, confidence, observed_at, valid_until, source_entity_type,
      source_entity_id, evidence_event_ids, phase_source, data
    ) values (
      p_organization_id, p_site_id, p_camera_id, 'alert', 'active',
      case when p_severity='warning' then 'medium' else p_severity end,
      p_title, p_summary, least(1, greatest(0, p_confidence)), p_observed_at,
      p_evaluated_at + interval '2 hours', p_source_entity_type,
      p_source_entity_id, coalesce(p_evidence_event_ids, '{}'), 'int12',
      jsonb_build_object(
        'kind', 'alert', 'alertCode', p_alert_code, 'dedupeKey', p_dedupe_key,
        'condition', coalesce(p_condition, '{}'::jsonb),
        'reason', p_reason, 'threshold', coalesce(p_threshold, '{}'::jsonb),
        'recommendation', p_recommendation, 'additionalModelCalls', 0
      )
    ) returning id into v_insight_id;
  end if;

  insert into public.intelligent_alerts (
    organization_id, site_id, camera_id, alert_code, severity, dedupe_key,
    title, summary, confidence, reason, threshold, recommendation, condition,
    evidence_event_ids, source_entity_type, source_entity_id, insight_id,
    observed_at, first_observed_at, last_observed_at, last_evaluated_at
  ) values (
    p_organization_id, p_site_id, p_camera_id, p_alert_code, p_severity,
    p_dedupe_key, p_title, p_summary, least(1, greatest(0, p_confidence)),
    p_reason, coalesce(p_threshold, '{}'::jsonb), p_recommendation,
    coalesce(p_condition, '{}'::jsonb), coalesce(p_evidence_event_ids, '{}'),
    p_source_entity_type, p_source_entity_id, v_insight_id, p_observed_at,
    p_evaluated_at, p_evaluated_at, p_evaluated_at
  )
  on conflict (organization_id, dedupe_key)
    where status in ('open','acknowledged')
  do update set
    site_id = excluded.site_id, camera_id = excluded.camera_id,
    severity = excluded.severity, title = excluded.title, summary = excluded.summary,
    confidence = excluded.confidence, reason = excluded.reason,
    threshold = excluded.threshold, recommendation = excluded.recommendation,
    condition = excluded.condition, evidence_event_ids = excluded.evidence_event_ids,
    insight_id = excluded.insight_id, observed_at = excluded.observed_at,
    last_observed_at = excluded.last_observed_at,
    last_evaluated_at = excluded.last_evaluated_at,
    occurrence_count = public.intelligent_alerts.occurrence_count + 1
  returning id into v_alert_id;

  return v_alert_id;
end;
$$;

revoke all on function private.upsert_intelligent_alert_v1(
  uuid,uuid,uuid,text,text,text,text,text,numeric,text,jsonb,text,jsonb,uuid[],text,uuid,timestamptz,timestamptz
) from public, anon, authenticated;

create or replace function public.refresh_intelligent_alerts_v1()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_before integer;
  v_after integer;
  v_resolved integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select count(*) into v_before from public.intelligent_alerts
  where status in ('open','acknowledged');

  perform private.upsert_intelligent_alert_v1(
    d.organization_id, d.site_id, d.camera_id,
    case d.deviation_code
      when 'opening_late' then 'opening_late'
      when 'opening_not_observed' then 'opening_late'
      when 'closing_not_observed' then 'closing_missing'
      when 'closing_late' then 'closing_missing'
      when 'activity_after_closing' then 'reopened_activity'
      when 'session_duration_high' then 'session_long'
    end,
    case when d.severity in ('high','critical') then 'critical' else 'warning' end,
    'routine:' || d.id,
    d.title, d.summary, d.confidence,
    'Desvio confirmado em relação ao baseline operacional da própria câmera.',
    jsonb_build_object('lower', d.expected_lower, 'center', d.expected_center,
      'upper', d.expected_upper, 'unit', d.unit),
    'Confira a evidência e valide se houve exceção operacional conhecida.',
    jsonb_build_object('code', d.deviation_code, 'observedValue', d.observed_value,
      'deviationAmount', d.deviation_amount, 'observedAt', d.observed_at),
    d.evidence_event_ids, 'operational_deviation', d.id, d.observed_at, v_now
  )
  from public.operational_deviations d
  left join public.intelligent_alert_settings s on s.organization_id = d.organization_id
  where d.status = 'active'
    and d.deviation_code in (
      'opening_late','opening_not_observed','closing_not_observed','closing_late',
      'activity_after_closing','session_duration_high'
    )
    and coalesce(s.enabled, true)
    and d.confidence >= coalesce(s.minimum_confidence, 0.65)
    and case d.deviation_code
      when 'opening_late' then 'opening_late'
      when 'opening_not_observed' then 'opening_late'
      when 'closing_not_observed' then 'closing_missing'
      when 'closing_late' then 'closing_missing'
      when 'activity_after_closing' then 'reopened_activity'
      when 'session_duration_high' then 'session_long'
    end = any(coalesce(s.enabled_codes, array[
      'opening_late','closing_missing','reopened_activity','session_long'
    ]::text[]));

  perform private.upsert_intelligent_alert_v1(
    d.organization_id, d.site_id, d.camera_id, 'process_incomplete',
    case when d.severity in ('high','critical') then 'critical' else 'warning' end,
    'process:' || d.id, d.title, d.summary, d.confidence,
    'Uma etapa obrigatória, ordem ou duração ficou fora do processo configurado.',
    coalesce(d.data, '{}'::jsonb),
    'Revise as etapas observadas e confirme se o procedimento precisa ser concluído.',
    jsonb_build_object('code', d.deviation_code, 'observedAt', d.observed_at),
    d.evidence_event_ids, 'operational_process_deviation', d.id, d.observed_at, v_now
  )
  from public.operational_process_deviations d
  left join public.intelligent_alert_settings s on s.organization_id = d.organization_id
  where d.status = 'active'
    and d.deviation_code in ('missing_required_step','out_of_order_step','stalled','duration_high')
    and coalesce(s.enabled, true)
    and 'process_incomplete' = any(coalesce(s.enabled_codes, array['process_incomplete']::text[]))
    and d.confidence >= coalesce(s.minimum_confidence, 0.65);

  perform private.upsert_intelligent_alert_v1(
    h.organization_id, h.site_id, h.camera_id,
    case
      when h.incident_type = 'lens_obstructed' then 'camera_obstructed'
      when h.incident_type in ('frame_shifted','profile_drift') then 'camera_drift'
      else 'camera_low_quality'
    end,
    case when h.severity in ('high','critical') then 'critical' else 'warning' end,
    'camera_health:' || h.id, h.title, h.summary, h.confidence,
    'A saúde visual divergiu da referência aprovada da câmera.',
    jsonb_build_object('consecutiveObservations', h.consecutive_count),
    'Verifique lente, iluminação, enquadramento e conexão antes de recalibrar a referência.',
    jsonb_build_object('incidentType', h.incident_type, 'reasons', h.reasons,
      'observedAt', h.last_observed_at),
    '{}'::uuid[], 'camera_health_incident', h.id, h.last_observed_at, v_now
  )
  from public.camera_health_incidents h
  left join public.intelligent_alert_settings s on s.organization_id = h.organization_id
  where h.status = 'open'
    and coalesce(s.enabled, true)
    and h.confidence >= coalesce(s.minimum_confidence, 0.65)
    and case
      when h.incident_type = 'lens_obstructed' then 'camera_obstructed'
      when h.incident_type in ('frame_shifted','profile_drift') then 'camera_drift'
      else 'camera_low_quality'
    end = any(coalesce(s.enabled_codes, array[
      'camera_obstructed','camera_drift','camera_low_quality'
    ]::text[]));

  perform private.upsert_intelligent_alert_v1(
    session.organization_id, session.site_id, session.camera_id, 'restricted_access',
    case when session.confidence >= 0.85 then 'critical' else 'warning' end,
    'restricted:' || session.id, 'Acesso observado em área restrita',
    session.summary, session.confidence,
    'A sessão foi classificada pelo processo configurado como acesso a área restrita.',
    jsonb_build_object('minimumConfidence', coalesce(s.minimum_confidence, 0.65)),
    'Confira os capítulos da sessão e valide se o acesso estava autorizado.',
    jsonb_build_object('sessionStatus', session.status, 'startedAt', session.started_at),
    coalesce((select array_agg(ose.event_id) from public.operational_session_events ose
      where ose.session_id = session.id and ose.event_id is not null), '{}'),
    'operational_session', session.id, session.started_at, v_now
  )
  from public.operational_sessions session
  left join public.intelligent_alert_settings s on s.organization_id = session.organization_id
  where session.session_type = 'restricted_area_access'
    and session.updated_at >= v_now - interval '2 hours'
    and coalesce(s.enabled, true)
    and 'restricted_access' = any(coalesce(s.enabled_codes, array['restricted_access']::text[]))
    and session.confidence >= coalesce(s.minimum_confidence, 0.65);

  perform private.upsert_intelligent_alert_v1(
    e.organization_id, e.site_id, e.camera_id, 'object_removed',
    case when e.confidence >= 0.85 then 'critical' else 'warning' end,
    'object_removed:' || e.id, 'Objeto retirado da área monitorada',
    coalesce(nullif(e.summary, ''), 'O acontecimento indica retirada de objeto.'), e.confidence,
    'O evento contém sinal explícito de objeto removido.',
    jsonb_build_object('minimumConfidence', coalesce(s.minimum_confidence, 0.65)),
    'Confira a evidência e valide se a retirada fazia parte da operação esperada.',
    jsonb_build_object('eventType', e.primary_event_type, 'observedAt', e.started_at),
    array[e.id], 'event', e.id, e.started_at, v_now
  )
  from public.events e
  left join public.intelligent_alert_settings s on s.organization_id = e.organization_id
  where e.deleted_at is null and e.started_at >= v_now - interval '2 hours'
    and (e.primary_event_type = 'object_removed' or e.tags && array['object_removed','objeto_removido']::text[])
    and coalesce(s.enabled, true)
    and 'object_removed' = any(coalesce(s.enabled_codes, array['object_removed']::text[]))
    and e.confidence >= coalesce(s.minimum_confidence, 0.65);

  perform private.upsert_intelligent_alert_v1(
    t.organization_id, t.site_id, t.camera_id, 'equipment_after_hours',
    case when t.after_confirmed_closing then 'critical' else 'warning' end,
    'equipment_after_hours:' || t.id, 'Equipamento mudou fora do horário',
    format('%s mudou de %s para %s fora do horário declarado.', entity.name, t.from_state, t.to_state),
    t.confidence, 'Uma transição visível ocorreu fora do horário ou após fechamento confirmado.',
    jsonb_build_object('outsideDeclaredHours', true),
    'Confira a evidência e valide se havia atividade autorizada no local.',
    jsonb_build_object('entityName', entity.name, 'fromState', t.from_state,
      'toState', t.to_state, 'afterConfirmedClosing', t.after_confirmed_closing),
    array_remove(array[t.event_id], null::uuid),
    'visual_state_transition', t.id, t.occurred_at, v_now
  )
  from public.visual_state_transitions t
  join public.camera_visual_entities entity on entity.id = t.entity_id
  left join public.intelligent_alert_settings s on s.organization_id = t.organization_id
  where (t.outside_declared_hours or t.after_confirmed_closing)
    and t.occurred_at >= v_now - interval '2 hours'
    and entity.entity_type = 'equipment'
    and coalesce(s.enabled, true)
    and 'equipment_after_hours' = any(coalesce(s.enabled_codes, array['equipment_after_hours']::text[]))
    and t.confidence >= coalesce(s.minimum_confidence, 0.65);

  perform private.upsert_intelligent_alert_v1(
    e.organization_id, e.site_id, e.camera_id, 'queue_excessive',
    case when greatest(coalesce(e.probable_customer_count,0),coalesce(e.probable_people_count,0)) >= coalesce(s.queue_people_limit,5) * 2 then 'critical' else 'warning' end,
    'queue_excessive:' || e.id, 'Fila acima do limite',
    format('%s pessoas prováveis foram observadas em situação de fila.', greatest(coalesce(e.probable_customer_count,0),coalesce(e.probable_people_count,0))),
    e.confidence, 'A quantidade provável observada atingiu o limite configurado.',
    jsonb_build_object('queuePeopleLimit', coalesce(s.queue_people_limit,5)),
    'Confira a evidência e avalie reforço no atendimento.',
    jsonb_build_object('probablePeople', greatest(coalesce(e.probable_customer_count,0),coalesce(e.probable_people_count,0))),
    array[e.id], 'event', e.id, e.started_at, v_now
  )
  from public.events e
  left join public.intelligent_alert_settings s on s.organization_id = e.organization_id
  where e.deleted_at is null and e.started_at >= v_now - interval '2 hours'
    and (e.primary_event_type in ('queue','customer_queue') or e.tags && array['queue','customer_queue','fila']::text[])
    and greatest(coalesce(e.probable_customer_count,0),coalesce(e.probable_people_count,0)) >= coalesce(s.queue_people_limit,5)
    and coalesce(s.enabled, true)
    and 'queue_excessive' = any(coalesce(s.enabled_codes, array['queue_excessive']::text[]))
    and e.confidence >= coalesce(s.minimum_confidence, 0.65);

  perform private.upsert_intelligent_alert_v1(
    session.organization_id, session.site_id, session.camera_id, 'session_long',
    case when extract(epoch from (v_now - session.started_at))/60 >= coalesce(s.long_session_minutes,60) * 2 then 'critical' else 'warning' end,
    'session_long:' || session.id, 'Sessão acima da duração esperada',
    format('A sessão permanece aberta há aproximadamente %s minutos.', floor(extract(epoch from (v_now - session.started_at))/60)),
    session.confidence, 'A sessão aberta ultrapassou o limite configurado.',
    jsonb_build_object('longSessionMinutes', coalesce(s.long_session_minutes,60)),
    'Confira se a atividade continua ou se a sessão deve ser encerrada por inatividade.',
    jsonb_build_object('sessionType', session.session_type, 'startedAt', session.started_at),
    coalesce((select array_agg(ose.event_id) from public.operational_session_events ose
      where ose.session_id = session.id and ose.event_id is not null), '{}'),
    'operational_session', session.id, session.started_at, v_now
  )
  from public.operational_sessions session
  left join public.intelligent_alert_settings s on s.organization_id = session.organization_id
  where session.status = 'open'
    and session.started_at < v_now - make_interval(mins => coalesce(s.long_session_minutes,60))
    and coalesce(s.enabled, true)
    and 'session_long' = any(coalesce(s.enabled_codes, array['session_long']::text[]))
    and session.confidence >= coalesce(s.minimum_confidence, 0.65);

  update public.intelligent_alerts set status = 'resolved', resolved_at = v_now,
    resolution_reason = 'condition_cleared'
  where status in ('open','acknowledged') and last_evaluated_at < v_now;
  get diagnostics v_resolved = row_count;

  update public.operational_insights insight set status = 'resolved', valid_until = v_now,
    updated_at = v_now
  where insight.phase_source = 'int12' and insight.status = 'active'
    and exists (
      select 1 from public.intelligent_alerts alert
      where alert.insight_id = insight.id and alert.status = 'resolved'
    );

  select count(*) into v_after from public.intelligent_alerts
  where status in ('open','acknowledged');

  return jsonb_build_object(
    'evaluatedAt', v_now, 'opened', greatest(0, v_after - v_before + v_resolved),
    'resolved', v_resolved, 'active', v_after, 'additionalModelCalls', 0
  );
end;
$$;

revoke all on function public.refresh_intelligent_alerts_v1() from public, anon, authenticated;
grant execute on function public.refresh_intelligent_alerts_v1() to service_role;

create or replace function public.acknowledge_intelligent_alert_v1(p_alert_id uuid)
returns public.intelligent_alerts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_row public.intelligent_alerts;
begin
  select * into v_row from public.intelligent_alerts where id = p_alert_id;
  if v_row.id is null or not private.has_org_role(
    v_row.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then raise exception 'alert not found or forbidden' using errcode = '42501'; end if;
  update public.intelligent_alerts set status='acknowledged', acknowledged_at=now(),
    acknowledged_by=(select auth.uid()) where id=p_alert_id and status='open'
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.resolve_intelligent_alert_v1(p_alert_id uuid)
returns public.intelligent_alerts
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_row public.intelligent_alerts;
begin
  select * into v_row from public.intelligent_alerts where id = p_alert_id;
  if v_row.id is null or not private.has_org_role(
    v_row.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then raise exception 'alert not found or forbidden' using errcode = '42501'; end if;
  update public.intelligent_alerts set status='resolved', resolved_at=now(),
    resolution_reason='resolved_by_operator'
  where id=p_alert_id and status in ('open','acknowledged') returning * into v_row;
  if v_row.insight_id is not null then
    update public.operational_insights set status='resolved', valid_until=now()
    where id=v_row.insight_id;
  end if;
  return v_row;
end;
$$;

revoke all on function public.acknowledge_intelligent_alert_v1(uuid) from public, anon;
revoke all on function public.resolve_intelligent_alert_v1(uuid) from public, anon;
grant execute on function public.acknowledge_intelligent_alert_v1(uuid) to authenticated;
grant execute on function public.resolve_intelligent_alert_v1(uuid) to authenticated;

-- Evidências externas do gate. Nenhuma linha é criada automaticamente: uma
-- restauração ou homologação não pode ser declarada sem ter acontecido.
create table if not exists public.release_evidence (
  id uuid primary key default gen_random_uuid(),
  check_code text not null check (check_code in (
    'backup_restore','camera_compatibility','real_pix','agent_recovery'
  )),
  status text not null check (status in ('passed','failed','expired')),
  source text not null check (char_length(source) between 3 and 120),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  recorded_at timestamptz not null default now(),
  valid_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.release_evidence enable row level security;
revoke all on table public.release_evidence from public, anon, authenticated;
grant all on table public.release_evidence to service_role;

create table if not exists public.release_gate_runs (
  id uuid primary key default gen_random_uuid(),
  release_code text not null default 'phase12-production',
  commit_sha text,
  status text not null check (status in ('ready','blocked')),
  passed_count integer not null default 0,
  warning_count integer not null default 0,
  blocked_count integer not null default 0,
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks)='array'),
  evaluated_at timestamptz not null default now()
);
create index if not exists release_gate_runs_evaluated_idx
  on public.release_gate_runs(evaluated_at desc);
alter table public.release_gate_runs enable row level security;
revoke all on table public.release_gate_runs from public, anon, authenticated;
grant all on table public.release_gate_runs to service_role;

create or replace function public.evaluate_release_gate_v1(
  p_commit_sha text,
  p_build_ok boolean,
  p_tests_ok boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_checks jsonb := '[]'::jsonb;
  v_ok boolean;
  v_blocked integer;
  v_warning integer;
  v_passed integer;
  v_result jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','build','area','Build','status',case when p_build_ok then 'passed' else 'blocked' end,
    'detail',case when p_build_ok then 'Deployment atual compilado.' else 'Build atual não confirmado.' end));
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','tests','area','Testes','status',case when p_tests_ok then 'passed' else 'blocked' end,
    'detail',case when p_tests_ok then 'Suíte automatizada da release aprovada.' else 'Suíte automatizada não confirmada.' end));

  v_ok := to_regclass('public.intelligent_alerts') is not null
    and to_regclass('public.operational_alerts') is not null
    and to_regclass('public.privacy_requests') is not null
    and to_regprocedure('public.refresh_intelligent_alerts_v1()') is not null;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','migrations','area','Migrations','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Schema das fases 1 a 12 disponível.' else 'Objetos obrigatórios ausentes.' end));

  select count(*)=7 and coalesce(bool_and(c.relrowsecurity),false) into v_ok
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname in (
    'organizations','cameras','events','operational_alerts','intelligent_alerts',
    'cross_camera_journeys','privacy_requests'
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','rls','area','RLS','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'RLS ativo nas tabelas críticas.' else 'RLS incompleto.' end));

  v_ok := to_regprocedure('public.process_monitoria_trials()') is not null
    and to_regprocedure('public.prepare_monitoria_trial(uuid,uuid,text)') is not null
    and to_regprocedure('public.start_monitoria_trial(uuid)') is not null;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','trial','area','Trial','status',case when v_ok then 'passed' else 'blocked' end,
    'detail','Ciclo automático de preparação, início e processamento.'));

  v_ok := to_regprocedure('public.apply_confirmed_monitoria_pix_payment(uuid,text,integer,text,jsonb,timestamptz)') is not null
    and to_regprocedure('public.process_monitoria_billing_deadlines()') is not null;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','pix','area','Pix','status',case when v_ok then 'passed' else 'blocked' end,
    'detail','Confirmação idempotente e processamento de vencimentos disponíveis.'));

  select exists(select 1 from public.billing_pix_payments
      where status::text='confirmed' and confirmed_at is not null)
    or exists(select 1 from public.release_evidence
      where check_code='real_pix' and status='passed'
        and (valid_until is null or valid_until>now())) into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','real_pix','area','Pix real','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Confirmação real registrada.' else 'Nenhum Pix real confirmado foi registrado.' end));

  select exists(select 1 from public.agents
    where status::text='online' and version is not null
      and last_heartbeat_at>now()-interval '15 minutes') into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','agent','area','Agent','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Agent versionado e com heartbeat recente.' else 'Nenhum Agent versionado está online.' end));

  select exists(select 1 from public.release_evidence
    where check_code='agent_recovery' and status='passed'
      and recorded_at > now()-interval '90 days'
      and (valid_until is null or valid_until>now())) into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','agent_recovery','area','Recuperação do Agent','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Recuperação real do serviço registrada.' else 'Recuperação real do Agent ainda sem evidência registrada.' end));

  select coalesce(bool_and(metadata_retention_days=365),false)
    and coalesce(bool_and(not clip_enabled or clip_retention_days=30),false)
  into v_ok from public.camera_plan_catalog where is_active;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','retention','area','Retenção','status',case when v_ok then 'passed' else 'blocked' end,
    'detail','Metadados em 365 dias e clipes habilitados em 30 dias.'));

  v_ok := to_regprocedure('public.get_assistant_balance(uuid)') is not null
    and to_regclass('public.assistant_allowances') is not null
    and exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='billing_accounts'
        and column_name='monthly_assistant_allowance' and column_default like '90%')
    and exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='trial_runs'
        and column_name='interaction_limit' and column_default like '21%');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','assistant','area','Assistente','status',case when v_ok then 'passed' else 'blocked' end,
    'detail','Saldo e franquias de 90 interações mensais e 21 no trial disponíveis.'));

  select count(*)=3 and coalesce(bool_and(price.amount_cents = case catalog.code
      when 'basic' then 3990 when 'standard' then 7990 when 'intensive' then 14990 end),false)
  into v_ok
  from public.camera_plan_catalog catalog
  join public.camera_plan_price_versions price
    on price.plan_code=catalog.code and price.valid_to is null
  where catalog.is_active and catalog.code in ('basic','standard','intensive');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','pricing','area','Preços públicos','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Catálogo ativo em R$ 39,90, R$ 79,90 e R$ 149,90.' else 'Catálogo comercial diverge dos preços públicos.' end));

  v_ok := to_regclass('public.analysis_routing_decisions') is not null
    and to_regclass('public.usage_events') is not null
    and to_regclass('public.monitoria_capability_registry') is not null
    and to_regclass('public.mcp_tool_audit_logs') is not null;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','intelligence','area','Inteligência','status',case when v_ok then 'passed' else 'blocked' end,
    'detail','Roteamento, custos, capacidades MCP e auditoria estão registrados.'));

  select not exists(select 1 from public.ai_cost_alerts
    where status <> 'resolved' and severity='critical') into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','cogs','area','COGS','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Nenhum alerta crítico de custo ativo.' else 'Há custo crítico fora da meta.' end));

  select exists(select 1 from public.operational_refresh_runs
    where status='completed' and finished_at > now()-interval '20 minutes') into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','observability','area','Observabilidade','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Cron operacional recente e saudável.' else 'Cron operacional sem execução recente.' end));

  select exists(select 1 from public.release_evidence
    where check_code='backup_restore' and status='passed'
      and recorded_at > now()-interval '90 days'
      and (valid_until is null or valid_until > now())) into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','backup_restore','area','Backup','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Restauração real registrada nos últimos 90 dias.' else 'Restauração real ainda sem evidência registrada.' end));

  select exists(select 1 from public.device_compatibility where success_count>0)
    or exists(select 1 from public.release_evidence
      where check_code='camera_compatibility' and status='passed'
        and (valid_until is null or valid_until>now())) into v_ok;
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'code','compatibility','area','Compatibilidade','status',case when v_ok then 'passed' else 'blocked' end,
    'detail',case when v_ok then 'Compatibilidade real registrada.' else 'Catálogo ainda não recebeu uma validação real do Agent.' end));

  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object('code','legal','area','Jurídico','status','passed','detail','Textos legais e dados empresariais publicados.'),
    jsonb_build_object('code','support','area','Suporte','status','passed','detail','Ajuda, diagnóstico e página de status publicados.'),
    jsonb_build_object('code','privacy','area','Privacidade','status','passed','detail','Sem reconhecimento facial e com retenção explícita.')
  );

  select count(*) filter(where item->>'status'='blocked'),
         count(*) filter(where item->>'status'='warning'),
         count(*) filter(where item->>'status'='passed')
  into v_blocked,v_warning,v_passed from jsonb_array_elements(v_checks) item;

  insert into public.release_gate_runs(
    commit_sha,status,passed_count,warning_count,blocked_count,checks
  ) values (
    nullif(left(coalesce(p_commit_sha,''),80),''),
    case when v_blocked=0 then 'ready' else 'blocked' end,
    v_passed,v_warning,v_blocked,v_checks
  );

  delete from public.release_gate_runs where evaluated_at < now()-interval '90 days';
  v_result := jsonb_build_object(
    'status',case when v_blocked=0 then 'ready' else 'blocked' end,
    'passed',v_passed,'warnings',v_warning,'blocked',v_blocked,
    'checks',v_checks,'evaluatedAt',now()
  );
  return v_result;
end;
$$;

revoke all on function public.evaluate_release_gate_v1(text,boolean,boolean)
  from public,anon,authenticated;
grant execute on function public.evaluate_release_gate_v1(text,boolean,boolean)
  to service_role;

commit;

select to_regclass('public.intelligent_alerts') as intelligent_alerts,
       to_regclass('public.release_gate_runs') as release_gate_runs,
       to_regprocedure('public.refresh_intelligent_alerts_v1()') as refresh_intelligent_alerts;
