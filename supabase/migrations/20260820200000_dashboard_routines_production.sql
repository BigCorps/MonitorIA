-- MonitorIA — Dashboard de Produção — Etapa 4 — Rotinas
-- Base: main 1e03e514168b33ac5dea3e3eea835a654336f209
--
-- Objetivos:
-- 1. separar horário informado, padrão aprendido e comportamento observado;
-- 2. permitir owner/admin informar dias, abertura, fechamento, tolerância e exceções;
-- 3. manter o aprendizado intacto e em paralelo;
-- 4. reconciliar o aprendizado com as avaliações humanas das Etapas 2/3;
-- 5. corrigir a abertura em tempo real sem recalcular a janela inteira a cada cron;
-- 6. alimentar Dashboard, Pesquisa IA e MCP com a mesma fonte.

begin;

-- ---------------------------------------------------------------------------
-- Referência efetiva do dia
-- ---------------------------------------------------------------------------

create or replace function private.routine_day_reference_v2(
  p_camera_id uuid,
  p_local_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_dow smallint := extract(dow from p_local_date)::smallint;
  v_closed public.operational_expectations%rowtype;
  v_open public.operational_expectations%rowtype;
  v_close public.operational_expectations%rowtype;
  v_has_special boolean := false;
begin
  -- Datas especiais declaradas têm precedência sobre a semana normal.
  select exists (
    select 1
    from public.operational_expectations expectation
    where expectation.camera_id = p_camera_id
      and expectation.source = 'user'
      and expectation.status = 'active'
      and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
      and expectation.valid_from = p_local_date
      and expectation.valid_until = p_local_date
  )
  into v_has_special;

  if v_has_special then
    select *
    into v_closed
    from public.operational_expectations expectation
    where expectation.camera_id = p_camera_id
      and expectation.source = 'user'
      and expectation.status = 'active'
      and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
      and expectation.expectation_code = 'declared_closed_day'
      and expectation.valid_from = p_local_date
      and expectation.valid_until = p_local_date
    limit 1;

    if found then
      return jsonb_build_object(
        'configured', true,
        'closed', true,
        'reference', 'declared_schedule'
      );
    end if;

    select *
    into v_open
    from public.operational_expectations expectation
    where expectation.camera_id = p_camera_id
      and expectation.source = 'user'
      and expectation.status = 'active'
      and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
      and expectation.expectation_code = 'declared_open_minute'
      and expectation.valid_from = p_local_date
      and expectation.valid_until = p_local_date
    limit 1;

    select *
    into v_close
    from public.operational_expectations expectation
    where expectation.camera_id = p_camera_id
      and expectation.source = 'user'
      and expectation.status = 'active'
      and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
      and expectation.expectation_code = 'declared_close_minute'
      and expectation.valid_from = p_local_date
      and expectation.valid_until = p_local_date
    limit 1;

    if v_open.id is not null or v_close.id is not null then
      return jsonb_build_object(
        'configured', true,
        'closed', false,
        'reference', 'declared_schedule',
        'openExpectationId', v_open.id,
        'openBaselineId', v_open.baseline_id,
        'openLower', v_open.expected_lower,
        'openCenter', v_open.expected_center,
        'openUpper', v_open.expected_upper,
        'openGraceBefore', v_open.grace_before,
        'openGraceAfter', v_open.grace_after,
        'openConfidence', v_open.confidence,
        'closeExpectationId', v_close.id,
        'closeBaselineId', v_close.baseline_id,
        'closeLower', v_close.expected_lower,
        'closeCenter', v_close.expected_center,
        'closeUpper', v_close.expected_upper,
        'closeGraceBefore', v_close.grace_before,
        'closeGraceAfter', v_close.grace_after,
        'closeConfidence', v_close.confidence
      );
    end if;
  end if;

  -- Semana normal declarada.
  select *
  into v_closed
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.source = 'user'
    and expectation.status = 'active'
    and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
    and expectation.expectation_code = 'declared_closed_day'
    and expectation.valid_from is null
    and expectation.valid_until is null
    and expectation.day_of_week = v_dow
    and p_local_date <> all(expectation.exception_dates)
  limit 1;

  if found then
    return jsonb_build_object(
      'configured', true,
      'closed', true,
      'reference', 'declared_schedule'
    );
  end if;

  select *
  into v_open
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.source = 'user'
    and expectation.status = 'active'
    and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
    and expectation.expectation_code = 'declared_open_minute'
    and expectation.valid_from is null
    and expectation.valid_until is null
    and expectation.day_of_week = v_dow
    and p_local_date <> all(expectation.exception_dates)
  limit 1;

  select *
  into v_close
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.source = 'user'
    and expectation.status = 'active'
    and expectation.metadata->>'managedBy' = 'dashboard_production_v1'
    and expectation.expectation_code = 'declared_close_minute'
    and expectation.valid_from is null
    and expectation.valid_until is null
    and expectation.day_of_week = v_dow
    and p_local_date <> all(expectation.exception_dates)
  limit 1;

  if v_open.id is not null or v_close.id is not null then
    return jsonb_build_object(
      'configured', true,
      'closed', false,
      'reference', 'declared_schedule',
      'openExpectationId', v_open.id,
      'openBaselineId', v_open.baseline_id,
      'openLower', v_open.expected_lower,
      'openCenter', v_open.expected_center,
      'openUpper', v_open.expected_upper,
      'openGraceBefore', v_open.grace_before,
      'openGraceAfter', v_open.grace_after,
      'openConfidence', v_open.confidence,
      'closeExpectationId', v_close.id,
      'closeBaselineId', v_close.baseline_id,
      'closeLower', v_close.expected_lower,
      'closeCenter', v_close.expected_center,
      'closeUpper', v_close.expected_upper,
      'closeGraceBefore', v_close.grace_before,
      'closeGraceAfter', v_close.grace_after,
      'closeConfidence', v_close.confidence
    );
  end if;

  -- Sem horário declarado: usa somente a expectativa aprendida/ajustada
  -- vinculada ao baseline. Regras dashboard_production_v1 nunca entram aqui.
  select *
  into v_open
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.status = 'active'
    and expectation.expectation_code = 'operating_open_minute'
    and coalesce(expectation.metadata->>'managedBy', '') <> 'dashboard_production_v1'
    and expectation.day_of_week in (v_dow, -1)
    and (expectation.valid_from is null or expectation.valid_from <= p_local_date)
    and (expectation.valid_until is null or expectation.valid_until >= p_local_date)
    and p_local_date <> all(expectation.exception_dates)
  order by
    case when expectation.day_of_week = v_dow then 0 else 1 end,
    case expectation.source when 'user' then 0 when 'hybrid' then 1 else 2 end,
    expectation.confidence desc,
    expectation.updated_at desc
  limit 1;

  select *
  into v_close
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.status = 'active'
    and expectation.expectation_code = 'operating_close_minute'
    and coalesce(expectation.metadata->>'managedBy', '') <> 'dashboard_production_v1'
    and expectation.day_of_week in (v_dow, -1)
    and (expectation.valid_from is null or expectation.valid_from <= p_local_date)
    and (expectation.valid_until is null or expectation.valid_until >= p_local_date)
    and p_local_date <> all(expectation.exception_dates)
  order by
    case when expectation.day_of_week = v_dow then 0 else 1 end,
    case expectation.source when 'user' then 0 when 'hybrid' then 1 else 2 end,
    expectation.confidence desc,
    expectation.updated_at desc
  limit 1;

  if v_open.id is not null or v_close.id is not null then
    return jsonb_build_object(
      'configured', true,
      'closed', false,
      'reference', 'learned_pattern',
      'openExpectationId', v_open.id,
      'openBaselineId', v_open.baseline_id,
      'openLower', v_open.expected_lower,
      'openCenter', v_open.expected_center,
      'openUpper', v_open.expected_upper,
      'openGraceBefore', v_open.grace_before,
      'openGraceAfter', v_open.grace_after,
      'openConfidence', v_open.confidence,
      'closeExpectationId', v_close.id,
      'closeBaselineId', v_close.baseline_id,
      'closeLower', v_close.expected_lower,
      'closeCenter', v_close.expected_center,
      'closeUpper', v_close.expected_upper,
      'closeGraceBefore', v_close.grace_before,
      'closeGraceAfter', v_close.grace_after,
      'closeConfidence', v_close.confidence
    );
  end if;

  return jsonb_build_object(
    'configured', false,
    'closed', false,
    'reference', 'none'
  );
end;
$function$;

revoke all on function private.routine_day_reference_v2(uuid, date)
  from public, anon, authenticated, monitoria_mcp_readonly;

-- ---------------------------------------------------------------------------
-- Resolve somente desvios de abertura/fechamento que serão recalculados.
-- ---------------------------------------------------------------------------

create or replace function private.resolve_routine_deviations_v2(
  p_camera_id uuid,
  p_local_date date,
  p_codes text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_count integer := 0;
begin
  update public.operational_deviations deviation
  set status = 'resolved',
      resolved_at = coalesce(deviation.resolved_at, now()),
      updated_at = now()
  where deviation.camera_id = p_camera_id
    and deviation.local_date = p_local_date
    and deviation.deviation_code = any(p_codes)
    and deviation.status = 'active';

  get diagnostics v_count = row_count;

  update public.operational_insights insight
  set status = 'resolved',
      valid_until = coalesce(insight.valid_until, now()),
      updated_at = now()
  where insight.source_entity_type = 'operational_deviation'
    and insight.source_entity_id in (
      select deviation.id
      from public.operational_deviations deviation
      where deviation.camera_id = p_camera_id
        and deviation.local_date = p_local_date
        and deviation.deviation_code = any(p_codes)
        and deviation.status = 'resolved'
    )
    and insight.status = 'active';

  return v_count;
end;
$function$;

revoke all on function private.resolve_routine_deviations_v2(uuid, date, text[])
  from public, anon, authenticated, monitoria_mcp_readonly;

-- ---------------------------------------------------------------------------
-- Abertura/fechamento em tempo real.
--
-- O evaluator v1 usa routine_observations, que são materializadas. Este
-- overlay consulta site_operating_sessions diretamente para não deixar a
-- abertura do próprio dia presa até o próximo refresh completo.
-- ---------------------------------------------------------------------------

create or replace function private.apply_live_routine_open_close_v2(
  p_camera_id uuid,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera public.cameras%rowtype;
  v_site public.sites%rowtype;
  v_today date;
  v_previous date;
  v_today_ref jsonb;
  v_previous_ref jsonb;
  v_open public.site_operating_sessions%rowtype;
  v_close public.site_operating_sessions%rowtype;
  v_now_minute numeric;
  v_observed_minute numeric;
  v_lower numeric;
  v_center numeric;
  v_upper numeric;
  v_grace_before numeric;
  v_grace_after numeric;
  v_amount numeric;
  v_severity text;
  v_reference text;
  v_expectation_id uuid;
  v_baseline_id uuid;
  v_confidence numeric;
  v_event_ids uuid[];
  v_written integer := 0;
begin
  select *
  into v_camera
  from public.cameras
  where id = p_camera_id;

  if not found then raise exception 'camera_not_found'; end if;

  select *
  into v_site
  from public.sites
  where id = v_camera.site_id;

  if not found then raise exception 'site_not_found'; end if;

  v_today := (p_observed_at at time zone v_site.timezone)::date;
  v_previous := v_today - 1;
  v_now_minute := private.routine_local_minute(
    p_observed_at,
    v_site.timezone
  );

  -- ABERTURA DO DIA ATUAL
  v_today_ref := private.routine_day_reference_v2(
    p_camera_id,
    v_today
  );

  if coalesce((v_today_ref->>'configured')::boolean, false) then
    perform private.resolve_routine_deviations_v2(
      p_camera_id,
      v_today,
      array['opening_early', 'opening_late', 'opening_not_observed']
    );

    if not coalesce((v_today_ref->>'closed')::boolean, false)
       and nullif(v_today_ref->>'openExpectationId', '') is not null then
      v_reference := coalesce(v_today_ref->>'reference', 'learned_pattern');
      v_expectation_id := (v_today_ref->>'openExpectationId')::uuid;
      v_baseline_id := nullif(v_today_ref->>'openBaselineId', '')::uuid;
      v_lower := (v_today_ref->>'openLower')::numeric;
      v_center := (v_today_ref->>'openCenter')::numeric;
      v_upper := (v_today_ref->>'openUpper')::numeric;
      v_grace_before := coalesce((v_today_ref->>'openGraceBefore')::numeric, 0);
      v_grace_after := coalesce((v_today_ref->>'openGraceAfter')::numeric, 0);
      v_confidence := coalesce((v_today_ref->>'openConfidence')::numeric, 1);

      select operating.*
      into v_open
      from public.site_operating_sessions operating
      where operating.camera_id = p_camera_id
        and (
          operating.first_open_observed_at
          at time zone v_site.timezone
        )::date = v_today
        and (
          operating.opening_event_id is null
          or private.monitoria_event_visible_after_review(
            operating.opening_event_id,
            v_camera.organization_id
          )
        )
      order by operating.first_open_observed_at asc
      limit 1;

      if found then
        v_observed_minute := private.routine_local_minute(
          v_open.first_open_observed_at,
          v_site.timezone
        );
        v_event_ids := case
          when v_open.opening_event_id is null then '{}'::uuid[]
          else array[v_open.opening_event_id]
        end;

        if v_observed_minute > v_upper + v_grace_after then
          v_amount := v_observed_minute - v_upper;
          v_severity := private.routine_severity(
            'opening_late',
            v_amount,
            greatest(v_grace_after, 5)
          );

          perform private.upsert_operational_deviation_v1(
            v_camera.organization_id,
            v_camera.site_id,
            p_camera_id,
            v_baseline_id,
            v_expectation_id,
            v_today,
            'opening_late',
            'opening_late',
            'active',
            v_severity,
            case
              when v_reference = 'declared_schedule'
                then 'Abertura depois do horário informado'
              else 'Abertura fora do horário habitual'
            end,
            'A abertura visual ocorreu às '
              || private.routine_format_minute(v_observed_minute)
              || case
                  when v_reference = 'declared_schedule'
                    then '. O horário informado é '
                      || private.routine_format_minute(v_center)
                      || '.'
                  else '. A faixa habitual termina em '
                    || private.routine_format_minute(v_upper)
                    || '.'
                end,
            v_observed_minute,
            v_lower,
            v_center,
            v_upper,
            v_amount,
            'minute_of_day',
            least(1, greatest(0, v_confidence)),
            v_open.first_open_observed_at,
            v_event_ids,
            jsonb_build_object(
              'reference', v_reference,
              'comparison', 'late',
              'liveSource', 'site_operating_sessions'
            )
          );
          v_written := v_written + 1;

        elsif v_observed_minute < v_lower - v_grace_before then
          v_amount := v_lower - v_observed_minute;
          v_severity := private.routine_severity(
            'opening_early',
            v_amount,
            greatest(v_grace_before, 5)
          );

          perform private.upsert_operational_deviation_v1(
            v_camera.organization_id,
            v_camera.site_id,
            p_camera_id,
            v_baseline_id,
            v_expectation_id,
            v_today,
            'opening_early',
            'opening_early',
            'active',
            v_severity,
            case
              when v_reference = 'declared_schedule'
                then 'Abertura antes do horário informado'
              else 'Abertura antecipada em relação ao habitual'
            end,
            'A abertura visual ocorreu às '
              || private.routine_format_minute(v_observed_minute)
              || case
                  when v_reference = 'declared_schedule'
                    then '. O horário informado é '
                      || private.routine_format_minute(v_center)
                      || '.'
                  else '. A faixa habitual começa em '
                    || private.routine_format_minute(v_lower)
                    || '.'
                end,
            v_observed_minute,
            v_lower,
            v_center,
            v_upper,
            -v_amount,
            'minute_of_day',
            least(1, greatest(0, v_confidence)),
            v_open.first_open_observed_at,
            v_event_ids,
            jsonb_build_object(
              'reference', v_reference,
              'comparison', 'early',
              'liveSource', 'site_operating_sessions'
            )
          );
          v_written := v_written + 1;
        end if;

      elsif v_now_minute > v_upper + v_grace_after then
        v_amount := v_now_minute - v_upper;
        v_severity := private.routine_severity(
          'opening_not_observed',
          v_amount,
          greatest(v_grace_after, 10)
        );

        perform private.upsert_operational_deviation_v1(
          v_camera.organization_id,
          v_camera.site_id,
          p_camera_id,
          v_baseline_id,
          v_expectation_id,
          v_today,
          'opening_not_observed',
          'opening_not_observed',
          'active',
          v_severity,
          'Abertura ainda não confirmada',
          'Até '
            || private.routine_format_minute(v_now_minute)
            || ', nenhuma abertura visual foi confirmada. '
            || case
                when v_reference = 'declared_schedule'
                  then 'O horário informado é '
                    || private.routine_format_minute(v_center)
                    || '.'
                else 'A faixa habitual termina em '
                  || private.routine_format_minute(v_upper)
                  || '.'
              end,
          null,
          v_lower,
          v_center,
          v_upper,
          v_amount,
          'minute_of_day',
          least(1, greatest(0, v_confidence)),
          p_observed_at,
          '{}'::uuid[],
          jsonb_build_object(
            'reference', v_reference,
            'requiresVisualConfirmation', true,
            'liveSource', 'site_operating_sessions'
          )
        );
        v_written := v_written + 1;
      end if;
    end if;
  end if;

  -- FECHAMENTO DO DIA ANTERIOR
  v_previous_ref := private.routine_day_reference_v2(
    p_camera_id,
    v_previous
  );

  if coalesce((v_previous_ref->>'configured')::boolean, false) then
    perform private.resolve_routine_deviations_v2(
      p_camera_id,
      v_previous,
      array['closing_early', 'closing_late', 'closing_not_observed']
    );

    if not coalesce((v_previous_ref->>'closed')::boolean, false)
       and nullif(v_previous_ref->>'closeExpectationId', '') is not null then
      v_reference := coalesce(v_previous_ref->>'reference', 'learned_pattern');
      v_expectation_id := (v_previous_ref->>'closeExpectationId')::uuid;
      v_baseline_id := nullif(v_previous_ref->>'closeBaselineId', '')::uuid;
      v_lower := (v_previous_ref->>'closeLower')::numeric;
      v_center := (v_previous_ref->>'closeCenter')::numeric;
      v_upper := (v_previous_ref->>'closeUpper')::numeric;
      v_grace_before := coalesce((v_previous_ref->>'closeGraceBefore')::numeric, 0);
      v_grace_after := coalesce((v_previous_ref->>'closeGraceAfter')::numeric, 0);
      v_confidence := coalesce((v_previous_ref->>'closeConfidence')::numeric, 1);

      select operating.*
      into v_close
      from public.site_operating_sessions operating
      where operating.camera_id = p_camera_id
        and (
          operating.first_open_observed_at
          at time zone v_site.timezone
        )::date = v_previous
        and operating.closed_at is not null
        and (
          operating.closing_event_id is null
          or private.monitoria_event_visible_after_review(
            operating.closing_event_id,
            v_camera.organization_id
          )
        )
      order by operating.first_open_observed_at asc
      limit 1;

      if found then
        v_observed_minute := private.routine_local_minute_relative(
          v_close.closed_at,
          v_previous,
          v_site.timezone
        );
        v_event_ids := case
          when v_close.closing_event_id is null then '{}'::uuid[]
          else array[v_close.closing_event_id]
        end;

        if v_observed_minute > v_upper + v_grace_after then
          v_amount := v_observed_minute - v_upper;
          v_severity := private.routine_severity(
            'closing_late',
            v_amount,
            greatest(v_grace_after, 10)
          );

          perform private.upsert_operational_deviation_v1(
            v_camera.organization_id,
            v_camera.site_id,
            p_camera_id,
            v_baseline_id,
            v_expectation_id,
            v_previous,
            'closing_late',
            'closing_late',
            'active',
            v_severity,
            case
              when v_reference = 'declared_schedule'
                then 'Fechamento depois do horário informado'
              else 'Fechamento posterior ao horário habitual'
            end,
            'O fechamento visual ocorreu às '
              || private.routine_format_minute(v_observed_minute)
              || case
                  when v_reference = 'declared_schedule'
                    then '. O horário informado é '
                      || private.routine_format_minute(v_center)
                      || '.'
                  else '. A faixa habitual termina em '
                    || private.routine_format_minute(v_upper)
                    || '.'
                end,
            v_observed_minute,
            v_lower,
            v_center,
            v_upper,
            v_amount,
            'minute_of_day',
            least(1, greatest(0, v_confidence)),
            v_close.closed_at,
            v_event_ids,
            jsonb_build_object(
              'reference', v_reference,
              'comparison', 'late',
              'liveSource', 'site_operating_sessions'
            )
          );
          v_written := v_written + 1;

        elsif v_observed_minute < v_lower - v_grace_before then
          v_amount := v_lower - v_observed_minute;
          v_severity := private.routine_severity(
            'closing_early',
            v_amount,
            greatest(v_grace_before, 10)
          );

          perform private.upsert_operational_deviation_v1(
            v_camera.organization_id,
            v_camera.site_id,
            p_camera_id,
            v_baseline_id,
            v_expectation_id,
            v_previous,
            'closing_early',
            'closing_early',
            'active',
            v_severity,
            case
              when v_reference = 'declared_schedule'
                then 'Fechamento antes do horário informado'
              else 'Fechamento antecipado em relação ao habitual'
            end,
            'O fechamento visual ocorreu às '
              || private.routine_format_minute(v_observed_minute)
              || case
                  when v_reference = 'declared_schedule'
                    then '. O horário informado é '
                      || private.routine_format_minute(v_center)
                      || '.'
                  else '. A faixa habitual começa em '
                    || private.routine_format_minute(v_lower)
                    || '.'
                end,
            v_observed_minute,
            v_lower,
            v_center,
            v_upper,
            -v_amount,
            'minute_of_day',
            least(1, greatest(0, v_confidence)),
            v_close.closed_at,
            v_event_ids,
            jsonb_build_object(
              'reference', v_reference,
              'comparison', 'early',
              'liveSource', 'site_operating_sessions'
            )
          );
          v_written := v_written + 1;
        end if;

      else
        perform private.upsert_operational_deviation_v1(
          v_camera.organization_id,
          v_camera.site_id,
          p_camera_id,
          v_baseline_id,
          v_expectation_id,
          v_previous,
          'closing_not_observed',
          'closing_not_observed',
          'active',
          'medium',
          'Fechamento não confirmado',
          'Não foi encontrado fechamento visual confirmado para o dia. '
            || case
                when v_reference = 'declared_schedule'
                  then 'O horário informado era '
                    || private.routine_format_minute(v_center)
                    || '.'
                else 'A faixa habitual termina em '
                  || private.routine_format_minute(v_upper)
                  || '.'
              end,
          null,
          v_lower,
          v_center,
          v_upper,
          null,
          'minute_of_day',
          least(1, greatest(0, v_confidence)),
          p_observed_at,
          '{}'::uuid[],
          jsonb_build_object(
            'reference', v_reference,
            'requiresVisualConfirmation', true,
            'liveSource', 'site_operating_sessions'
          )
        );
        v_written := v_written + 1;
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'cameraId', p_camera_id,
    'openCloseDeviationsWritten', v_written,
    'evaluatedAt', p_observed_at
  );
end;
$function$;

revoke all on function private.apply_live_routine_open_close_v2(uuid, timestamptz)
  from public, anon, authenticated, monitoria_mcp_readonly;

-- ---------------------------------------------------------------------------
-- Evaluador v2: mantém todos os cálculos v1 e corrige abertura/fechamento
-- com a referência explícita e a fonte observada em tempo real.
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_camera_routine_deviations_v2(
  p_camera_id uuid,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_learned jsonb;
  v_live jsonb;
begin
  v_learned := public.evaluate_camera_routine_deviations_v1(
    p_camera_id,
    p_observed_at
  );

  v_live := private.apply_live_routine_open_close_v2(
    p_camera_id,
    p_observed_at
  );

  return jsonb_build_object(
    'cameraId', p_camera_id,
    'baseEvaluation', v_learned,
    'liveOpenClose', v_live,
    'evaluatedAt', p_observed_at
  );
end;
$function$;

create or replace function public.evaluate_all_routine_deviations_v2(
  p_observed_at timestamptz default now(),
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  for v_camera in
    select camera.id
    from public.cameras camera
    where camera.routine_intelligence_enabled
    order by camera.created_at, camera.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  loop
    begin
      perform public.evaluate_camera_routine_deviations_v2(
        v_camera.id,
        coalesce(p_observed_at, now())
      );
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object(
          'cameraId', v_camera.id,
          'sqlState', sqlstate,
          'error', left(sqlerrm, 300)
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'mode', 'evaluate_v2',
    'processed', v_processed,
    'failed', v_failed,
    'failures', v_failures,
    'executedAt', coalesce(p_observed_at, now())
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Horário informado pelo cliente.
--
-- Usa códigos declared_* próprios. Eles permanecem na mesma tabela de
-- expectativas, mas nunca concorrem com operating_* usados pelo aprendizado.
-- ---------------------------------------------------------------------------

create or replace function public.save_camera_routine_schedule_v1(
  p_camera_id uuid,
  p_working_days integer[],
  p_open_minute integer,
  p_close_minute integer,
  p_sensitivity text default 'balanced',
  p_exceptions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera public.cameras%rowtype;
  v_day integer;
  v_close_value integer;
  v_grace numeric;
  v_exception jsonb;
  v_exception_date date;
  v_exception_open integer;
  v_exception_close integer;
  v_exception_close_value integer;
  v_exception_dates date[] := '{}'::date[];
begin
  select *
  into v_camera
  from public.cameras
  where id = p_camera_id
  for update;

  if not found then raise exception 'camera_not_found'; end if;

  if not private.has_org_role(
    v_camera.organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
    raise exception 'not_authorized';
  end if;

  if p_sensitivity not in ('conservative', 'balanced', 'sensitive') then
    raise exception 'invalid_sensitivity';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_working_days, '{}'::integer[])) item(day)
    where item.day < 0 or item.day > 6
  ) then
    raise exception 'invalid_working_days';
  end if;

  if cardinality(coalesce(p_working_days, '{}'::integer[])) > 0
     and (
       p_open_minute is null
       or p_close_minute is null
       or p_open_minute < 0
       or p_open_minute > 1439
       or p_close_minute < 0
       or p_close_minute > 1439
     ) then
    raise exception 'invalid_schedule_time';
  end if;

  if jsonb_typeof(coalesce(p_exceptions, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_exceptions, '[]'::jsonb)) > 40 then
    raise exception 'invalid_exceptions';
  end if;

  update public.cameras
  set routine_deviation_sensitivity = p_sensitivity,
      updated_at = now()
  where id = p_camera_id;

  select coalesce(
    array_agg(distinct (item->>'date')::date),
    '{}'::date[]
  )
  into v_exception_dates
  from jsonb_array_elements(coalesce(p_exceptions, '[]'::jsonb)) item
  where coalesce(item->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';

  delete from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.source = 'user'
    and expectation.metadata->>'managedBy' = 'dashboard_production_v1';

  v_grace := private.routine_grace_value(
    'operating_open_minute',
    p_sensitivity,
    v_camera.routine_grace_minutes
  );

  for v_day in 0..6 loop
    if v_day = any(coalesce(p_working_days, '{}'::integer[])) then
      v_close_value := case
        when p_close_minute <= p_open_minute
          then p_close_minute + 1440
        else p_close_minute
      end;

      insert into public.operational_expectations (
        organization_id,
        site_id,
        camera_id,
        baseline_id,
        expectation_key,
        expectation_code,
        source,
        status,
        day_of_week,
        bucket_hour,
        session_type,
        expected_center,
        expected_lower,
        expected_upper,
        unit,
        grace_before,
        grace_after,
        valid_from,
        valid_until,
        exception_dates,
        known_exceptions,
        confidence,
        confirmed_by,
        confirmed_at,
        metadata
      ) values
      (
        v_camera.organization_id,
        v_camera.site_id,
        p_camera_id,
        null,
        'declared:open:dow:' || v_day,
        'declared_open_minute',
        'user',
        'active',
        v_day,
        -1,
        '',
        p_open_minute,
        p_open_minute,
        p_open_minute,
        'minute_of_day',
        v_grace,
        v_grace,
        null,
        null,
        v_exception_dates,
        '[]'::jsonb,
        1,
        auth.uid(),
        now(),
        jsonb_build_object(
          'managedBy', 'dashboard_production_v1',
          'scheduleKind', 'weekly'
        )
      ),
      (
        v_camera.organization_id,
        v_camera.site_id,
        p_camera_id,
        null,
        'declared:close:dow:' || v_day,
        'declared_close_minute',
        'user',
        'active',
        v_day,
        -1,
        '',
        v_close_value,
        v_close_value,
        v_close_value,
        'minute_of_day',
        v_grace,
        v_grace,
        null,
        null,
        v_exception_dates,
        '[]'::jsonb,
        1,
        auth.uid(),
        now(),
        jsonb_build_object(
          'managedBy', 'dashboard_production_v1',
          'scheduleKind', 'weekly'
        )
      );
    else
      insert into public.operational_expectations (
        organization_id,
        site_id,
        camera_id,
        expectation_key,
        expectation_code,
        source,
        status,
        day_of_week,
        bucket_hour,
        session_type,
        expected_center,
        expected_lower,
        expected_upper,
        unit,
        grace_before,
        grace_after,
        exception_dates,
        known_exceptions,
        confidence,
        confirmed_by,
        confirmed_at,
        metadata
      ) values (
        v_camera.organization_id,
        v_camera.site_id,
        p_camera_id,
        'declared:closed:dow:' || v_day,
        'declared_closed_day',
        'user',
        'active',
        v_day,
        -1,
        '',
        0,
        0,
        0,
        'count',
        0,
        0,
        v_exception_dates,
        '[]'::jsonb,
        1,
        auth.uid(),
        now(),
        jsonb_build_object(
          'managedBy', 'dashboard_production_v1',
          'scheduleKind', 'weekly'
        )
      );
    end if;
  end loop;

  for v_exception in
    select item
    from jsonb_array_elements(coalesce(p_exceptions, '[]'::jsonb)) item
  loop
    if coalesce(v_exception->>'date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      continue;
    end if;

    v_exception_date := (v_exception->>'date')::date;

    if coalesce((v_exception->>'closed')::boolean, false) then
      insert into public.operational_expectations (
        organization_id,
        site_id,
        camera_id,
        expectation_key,
        expectation_code,
        source,
        status,
        day_of_week,
        bucket_hour,
        session_type,
        expected_center,
        expected_lower,
        expected_upper,
        unit,
        grace_before,
        grace_after,
        valid_from,
        valid_until,
        confidence,
        confirmed_by,
        confirmed_at,
        metadata
      ) values (
        v_camera.organization_id,
        v_camera.site_id,
        p_camera_id,
        'declared:closed:date:' || v_exception_date,
        'declared_closed_day',
        'user',
        'active',
        extract(dow from v_exception_date)::smallint,
        -1,
        '',
        0,
        0,
        0,
        'count',
        0,
        0,
        v_exception_date,
        v_exception_date,
        1,
        auth.uid(),
        now(),
        jsonb_build_object(
          'managedBy', 'dashboard_production_v1',
          'scheduleKind', 'date'
        )
      );
    else
      v_exception_open := (v_exception->>'openMinute')::integer;
      v_exception_close := (v_exception->>'closeMinute')::integer;

      if v_exception_open < 0 or v_exception_open > 1439
         or v_exception_close < 0 or v_exception_close > 1439 then
        raise exception 'invalid_exception_time';
      end if;

      v_exception_close_value := case
        when v_exception_close <= v_exception_open
          then v_exception_close + 1440
        else v_exception_close
      end;

      insert into public.operational_expectations (
        organization_id,
        site_id,
        camera_id,
        expectation_key,
        expectation_code,
        source,
        status,
        day_of_week,
        bucket_hour,
        session_type,
        expected_center,
        expected_lower,
        expected_upper,
        unit,
        grace_before,
        grace_after,
        valid_from,
        valid_until,
        confidence,
        confirmed_by,
        confirmed_at,
        metadata
      ) values
      (
        v_camera.organization_id,
        v_camera.site_id,
        p_camera_id,
        'declared:open:date:' || v_exception_date,
        'declared_open_minute',
        'user',
        'active',
        extract(dow from v_exception_date)::smallint,
        -1,
        '',
        v_exception_open,
        v_exception_open,
        v_exception_open,
        'minute_of_day',
        v_grace,
        v_grace,
        v_exception_date,
        v_exception_date,
        1,
        auth.uid(),
        now(),
        jsonb_build_object(
          'managedBy', 'dashboard_production_v1',
          'scheduleKind', 'date'
        )
      ),
      (
        v_camera.organization_id,
        v_camera.site_id,
        p_camera_id,
        'declared:close:date:' || v_exception_date,
        'declared_close_minute',
        'user',
        'active',
        extract(dow from v_exception_date)::smallint,
        -1,
        '',
        v_exception_close_value,
        v_exception_close_value,
        v_exception_close_value,
        'minute_of_day',
        v_grace,
        v_grace,
        v_exception_date,
        v_exception_date,
        1,
        auth.uid(),
        now(),
        jsonb_build_object(
          'managedBy', 'dashboard_production_v1',
          'scheduleKind', 'date'
        )
      );
    end if;
  end loop;

  -- Reavalia imediatamente com a nova referência, sem esperar o cron.
  perform public.evaluate_camera_routine_deviations_v2(
    p_camera_id,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'cameraId', p_camera_id,
    'workingDays', coalesce(p_working_days, '{}'::integer[]),
    'sensitivity', p_sensitivity,
    'exceptionCount', jsonb_array_length(coalesce(p_exceptions, '[]'::jsonb))
  );
end;
$function$;

create or replace function public.clear_camera_routine_schedule_v1(
  p_camera_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera public.cameras%rowtype;
  v_deleted integer := 0;
begin
  select *
  into v_camera
  from public.cameras
  where id = p_camera_id;

  if not found then raise exception 'camera_not_found'; end if;

  if not private.has_org_role(
    v_camera.organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
    raise exception 'not_authorized';
  end if;

  delete from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.source = 'user'
    and expectation.metadata->>'managedBy' = 'dashboard_production_v1';

  get diagnostics v_deleted = row_count;

  -- Remove qualquer desvio cuja referência explícita deixou de existir.
  update public.operational_deviations deviation
  set status = 'resolved',
      resolved_at = coalesce(deviation.resolved_at, now()),
      updated_at = now()
  where deviation.camera_id = p_camera_id
    and deviation.status = 'active'
    and deviation.data->>'reference' = 'declared_schedule';

  update public.operational_insights insight
  set status = 'resolved',
      valid_until = coalesce(insight.valid_until, now()),
      updated_at = now()
  where insight.source_entity_type = 'operational_deviation'
    and insight.source_entity_id in (
      select deviation.id
      from public.operational_deviations deviation
      where deviation.camera_id = p_camera_id
        and deviation.status = 'resolved'
        and deviation.data->>'reference' = 'declared_schedule'
    )
    and insight.status = 'active';

  -- Recalcula imediatamente contra o padrão aprendido, se já existir.
  perform public.evaluate_camera_routine_deviations_v2(
    p_camera_id,
    now()
  );

  return jsonb_build_object(
    'ok', true,
    'cameraId', p_camera_id,
    'removed', v_deleted
  );
end;
$function$;

revoke all on function public.save_camera_routine_schedule_v1(
  uuid, integer[], integer, integer, text, jsonb
) from public, anon;
grant execute on function public.save_camera_routine_schedule_v1(
  uuid, integer[], integer, integer, text, jsonb
) to authenticated;

revoke all on function public.clear_camera_routine_schedule_v1(uuid)
  from public, anon;
grant execute on function public.clear_camera_routine_schedule_v1(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Reconciliação do aprendizado com avaliações humanas.
-- ---------------------------------------------------------------------------

create or replace function private.reconcile_routine_observations_reviews_v2(
  p_camera_id uuid,
  p_reference_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera public.cameras%rowtype;
  v_site public.sites%rowtype;
  v_to date;
  v_from date;
begin
  select *
  into v_camera
  from public.cameras
  where id = p_camera_id;

  if not found then raise exception 'camera_not_found'; end if;

  select *
  into v_site
  from public.sites
  where id = v_camera.site_id;

  if not found then raise exception 'site_not_found'; end if;

  v_to := coalesce(
    p_reference_date,
    (now() at time zone v_site.timezone)::date
  );
  v_from := v_to - (v_camera.routine_learning_window_days - 1);

  -- Qualquer observação cuja evidência tenha ficado totalmente irrelevante
  -- deixa de participar do aprendizado.
  delete from public.routine_observations observation
  where observation.camera_id = p_camera_id
    and observation.local_date between v_from and v_to
    and cardinality(observation.evidence_event_ids) > 0
    and not exists (
      select 1
      from public.events event
      where event.id = any(observation.evidence_event_ids)
        and event.organization_id = v_camera.organization_id
        and event.deleted_at is null
        and event.human_verdict is distinct from 'irrelevant'
    );

  -- Métricas derivadas de Períodos/acontecimentos são reconstruídas usando
  -- somente registros ainda visíveis após a avaliação humana.
  delete from public.routine_observations observation
  where observation.camera_id = p_camera_id
    and observation.local_date between v_from and v_to
    and observation.metric_code in (
      'daily_session_count',
      'hourly_session_count',
      'session_duration_seconds',
      'first_activity_delay_minutes',
      'last_activity_lead_minutes',
      'after_close_event_count'
    );

  -- Volume diário.
  with daily as (
    select
      (session.started_at at time zone v_site.timezone)::date as local_date,
      count(*)::numeric as activity_count,
      min(session.started_at) as first_started_at,
      max(coalesce(session.ended_at, session.last_event_at)) as last_ended_at,
      array_agg(session.id order by session.started_at) as period_ids
    from public.operational_sessions session
    where session.camera_id = p_camera_id
      and session.chapter_count > 0
      and private.monitoria_session_has_visible_event(
        session.id,
        v_camera.organization_id
      )
      and (session.started_at at time zone v_site.timezone)::date
        between v_from and v_to
      and session.session_type not in (
        'opening_procedure',
        'closing_procedure'
      )
    group by (session.started_at at time zone v_site.timezone)::date
  )
  insert into public.routine_observations (
    organization_id,
    site_id,
    camera_id,
    local_date,
    day_of_week,
    metric_code,
    dimension_key,
    observed_value,
    unit,
    observed_at,
    source_started_at,
    source_ended_at,
    confidence,
    metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    daily.local_date,
    extract(dow from daily.local_date)::smallint,
    'daily_session_count',
    '',
    daily.activity_count,
    'count',
    daily.first_started_at,
    daily.first_started_at,
    daily.last_ended_at,
    0.90,
    jsonb_build_object(
      'source', 'review_reconciled_periods',
      'periodIds', daily.period_ids
    )
  from daily;

  -- Volume por hora.
  with hourly as (
    select
      (session.started_at at time zone v_site.timezone)::date as local_date,
      extract(
        hour from session.started_at at time zone v_site.timezone
      )::smallint as bucket_hour,
      count(*)::numeric as activity_count,
      min(session.started_at) as observed_at
    from public.operational_sessions session
    where session.camera_id = p_camera_id
      and session.chapter_count > 0
      and private.monitoria_session_has_visible_event(
        session.id,
        v_camera.organization_id
      )
      and (session.started_at at time zone v_site.timezone)::date
        between v_from and v_to
      and session.session_type not in (
        'opening_procedure',
        'closing_procedure'
      )
    group by
      (session.started_at at time zone v_site.timezone)::date,
      extract(hour from session.started_at at time zone v_site.timezone)
  )
  insert into public.routine_observations (
    organization_id,
    site_id,
    camera_id,
    local_date,
    day_of_week,
    metric_code,
    dimension_key,
    bucket_hour,
    observed_value,
    unit,
    observed_at,
    confidence,
    metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    hourly.local_date,
    extract(dow from hourly.local_date)::smallint,
    'hourly_session_count',
    '',
    hourly.bucket_hour,
    hourly.activity_count,
    'count',
    hourly.observed_at,
    0.88,
    jsonb_build_object('source', 'review_reconciled_periods')
  from hourly;

  -- Duração dos Períodos ainda relevantes.
  insert into public.routine_observations (
    organization_id,
    site_id,
    camera_id,
    local_date,
    day_of_week,
    metric_code,
    dimension_key,
    session_type,
    observed_value,
    unit,
    observed_at,
    source_started_at,
    source_ended_at,
    evidence_event_ids,
    confidence,
    metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    (session.started_at at time zone v_site.timezone)::date,
    extract(dow from session.started_at at time zone v_site.timezone)::smallint,
    'session_duration_seconds',
    session.id::text,
    session.session_type,
    greatest(0, session.duration_seconds),
    'seconds',
    coalesce(session.ended_at, session.last_event_at),
    session.started_at,
    coalesce(session.ended_at, session.last_event_at),
    coalesce(
      (
        select array_agg(chapter.event_id order by chapter.chapter_order)
        from public.operational_session_events chapter
        join public.events event
          on event.id = chapter.event_id
        where chapter.session_id = session.id
          and chapter.is_key_chapter
          and event.deleted_at is null
          and event.human_verdict is distinct from 'irrelevant'
      ),
      '{}'::uuid[]
    ),
    session.confidence,
    jsonb_build_object(
      'source', 'review_reconciled_period',
      'status', session.status
    )
  from public.operational_sessions session
  where session.camera_id = p_camera_id
    and session.chapter_count > 0
    and private.monitoria_session_has_visible_event(
      session.id,
      v_camera.organization_id
    )
    and (session.started_at at time zone v_site.timezone)::date
      between v_from and v_to
    and session.status <> 'open'
    and session.session_type not in (
      'opening_procedure',
      'closing_procedure'
    );

  -- Primeira atividade visível depois da abertura.
  with operating as (
    select distinct on (
      (session.first_open_observed_at at time zone v_site.timezone)::date
    )
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date
        as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and (session.first_open_observed_at at time zone v_site.timezone)::date
        between v_from and v_to
    order by
      (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  ), first_visible as (
    select
      operating.*,
      activity.started_at as first_activity_at,
      activity.evidence_event_ids
    from operating
    left join lateral (
      select
        session.started_at,
        coalesce(
          (
            select array_agg(chapter.event_id order by chapter.chapter_order)
            from public.operational_session_events chapter
            join public.events event
              on event.id = chapter.event_id
            where chapter.session_id = session.id
              and event.deleted_at is null
              and event.human_verdict is distinct from 'irrelevant'
          ),
          '{}'::uuid[]
        ) as evidence_event_ids
      from public.operational_sessions session
      where session.camera_id = p_camera_id
        and session.chapter_count > 0
        and private.monitoria_session_has_visible_event(
          session.id,
          v_camera.organization_id
        )
        and session.session_type not in (
          'opening_procedure',
          'closing_procedure'
        )
        and session.started_at >= operating.first_open_observed_at
        and session.started_at < coalesce(
          operating.closed_at,
          ((operating.local_date + 1)::timestamp at time zone v_site.timezone)
        )
      order by session.started_at asc
      limit 1
    ) activity on true
  )
  insert into public.routine_observations (
    organization_id,
    site_id,
    camera_id,
    local_date,
    day_of_week,
    metric_code,
    dimension_key,
    observed_value,
    unit,
    observed_at,
    source_started_at,
    source_ended_at,
    evidence_event_ids,
    confidence,
    metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    first_visible.local_date,
    extract(dow from first_visible.local_date)::smallint,
    'first_activity_delay_minutes',
    first_visible.id::text,
    greatest(
      0,
      extract(
        epoch from first_visible.first_activity_at
          - first_visible.first_open_observed_at
      ) / 60
    ),
    'minutes',
    first_visible.first_activity_at,
    first_visible.first_open_observed_at,
    first_visible.first_activity_at,
    first_visible.evidence_event_ids,
    0.82,
    jsonb_build_object('source', 'review_reconciled_periods')
  from first_visible
  where first_visible.first_activity_at is not null;

  -- Última atividade visível antes do fechamento.
  with operating as (
    select distinct on (
      (session.first_open_observed_at at time zone v_site.timezone)::date
    )
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date
        as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and session.closed_at is not null
      and (session.first_open_observed_at at time zone v_site.timezone)::date
        between v_from and v_to
    order by
      (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  ), last_visible as (
    select
      operating.*,
      activity.ended_at as last_activity_at,
      activity.evidence_event_ids
    from operating
    left join lateral (
      select
        coalesce(session.ended_at, session.last_event_at) as ended_at,
        coalesce(
          (
            select array_agg(chapter.event_id order by chapter.chapter_order desc)
            from public.operational_session_events chapter
            join public.events event
              on event.id = chapter.event_id
            where chapter.session_id = session.id
              and event.deleted_at is null
              and event.human_verdict is distinct from 'irrelevant'
          ),
          '{}'::uuid[]
        ) as evidence_event_ids
      from public.operational_sessions session
      where session.camera_id = p_camera_id
        and session.chapter_count > 0
        and private.monitoria_session_has_visible_event(
          session.id,
          v_camera.organization_id
        )
        and session.session_type not in (
          'opening_procedure',
          'closing_procedure'
        )
        and session.started_at >= operating.first_open_observed_at
        and coalesce(session.ended_at, session.last_event_at)
          <= operating.closed_at
      order by coalesce(session.ended_at, session.last_event_at) desc
      limit 1
    ) activity on true
  )
  insert into public.routine_observations (
    organization_id,
    site_id,
    camera_id,
    local_date,
    day_of_week,
    metric_code,
    dimension_key,
    observed_value,
    unit,
    observed_at,
    source_started_at,
    source_ended_at,
    evidence_event_ids,
    confidence,
    metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    last_visible.local_date,
    extract(dow from last_visible.local_date)::smallint,
    'last_activity_lead_minutes',
    last_visible.id::text,
    greatest(
      0,
      extract(
        epoch from last_visible.closed_at - last_visible.last_activity_at
      ) / 60
    ),
    'minutes',
    last_visible.closed_at,
    last_visible.last_activity_at,
    last_visible.closed_at,
    last_visible.evidence_event_ids,
    0.80,
    jsonb_build_object('source', 'review_reconciled_periods')
  from last_visible
  where last_visible.last_activity_at is not null;

  -- Atividade visual após fechamento: conta somente acontecimentos que ainda
  -- são relevantes após avaliação humana.
  with operating as (
    select distinct on (
      (session.first_open_observed_at at time zone v_site.timezone)::date
    )
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date
        as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and session.closed_at is not null
      and (session.first_open_observed_at at time zone v_site.timezone)::date
        between v_from and v_to
    order by
      (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  ), activity as (
    select
      operating.id,
      operating.local_date,
      operating.closed_at,
      count(event.id)::numeric as event_count,
      coalesce(
        array_agg(event.id order by event.started_at)
          filter (where event.id is not null),
        '{}'::uuid[]
      ) as evidence_event_ids
    from operating
    left join public.events event
      on event.camera_id = p_camera_id
      and event.organization_id = v_camera.organization_id
      and event.deleted_at is null
      and event.human_verdict is distinct from 'irrelevant'
      and event.started_at > operating.closed_at
      and event.started_at < (
        (operating.local_date + 1)::timestamp at time zone v_site.timezone
      )
    group by operating.id, operating.local_date, operating.closed_at
  )
  insert into public.routine_observations (
    organization_id,
    site_id,
    camera_id,
    local_date,
    day_of_week,
    metric_code,
    dimension_key,
    observed_value,
    unit,
    observed_at,
    source_started_at,
    source_ended_at,
    evidence_event_ids,
    confidence,
    metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    activity.local_date,
    extract(dow from activity.local_date)::smallint,
    'after_close_event_count',
    activity.id::text,
    activity.event_count,
    'count',
    activity.closed_at,
    activity.closed_at,
    ((activity.local_date + 1)::timestamp at time zone v_site.timezone),
    activity.evidence_event_ids[1:20],
    0.90,
    jsonb_build_object('source', 'review_reconciled_events')
  from activity;

  return jsonb_build_object(
    'cameraId', p_camera_id,
    'from', v_from,
    'to', v_to,
    'reviewReconciled', true
  );
end;
$function$;

revoke all on function private.reconcile_routine_observations_reviews_v2(uuid, date)
  from public, anon, authenticated, monitoria_mcp_readonly;

-- ---------------------------------------------------------------------------
-- Refresh completo v2.
-- ---------------------------------------------------------------------------

create or replace function public.refresh_camera_routine_intelligence_v2(
  p_camera_id uuid,
  p_reference_date date default null,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera public.cameras%rowtype;
  v_site public.sites%rowtype;
  v_reference date;
  v_run_id uuid;
  v_observations jsonb;
  v_reconciled jsonb;
  v_baselines jsonb;
  v_insights jsonb;
  v_deviations jsonb;
begin
  select *
  into v_camera
  from public.cameras
  where id = p_camera_id;

  if not found then raise exception 'camera_not_found'; end if;

  select *
  into v_site
  from public.sites
  where id = v_camera.site_id;

  if not found then raise exception 'site_not_found'; end if;

  v_reference := coalesce(
    p_reference_date,
    (p_observed_at at time zone v_site.timezone)::date
  );

  insert into public.routine_refresh_runs (
    organization_id,
    camera_id,
    reference_date,
    status,
    metadata
  ) values (
    v_camera.organization_id,
    p_camera_id,
    v_reference,
    'running',
    jsonb_build_object(
      'phase', 'dashboard-production-4',
      'method', 'routine_v2'
    )
  )
  returning id into v_run_id;

  begin
    v_observations := public.refresh_camera_routine_observations_v1(
      p_camera_id,
      v_reference
    );

    v_reconciled := private.reconcile_routine_observations_reviews_v2(
      p_camera_id,
      v_reference
    );

    v_baselines := public.refresh_camera_behavior_baselines_v1(
      p_camera_id,
      v_reference
    );

    v_insights := public.refresh_camera_routine_insights_v1(
      p_camera_id
    );

    v_deviations := public.evaluate_camera_routine_deviations_v2(
      p_camera_id,
      p_observed_at
    );

    update public.routine_refresh_runs
    set status = 'completed',
        observations_written = coalesce(
          (v_observations->>'observationsWritten')::integer,
          0
        ),
        baselines_written = coalesce(
          (v_baselines->>'baselinesWritten')::integer,
          0
        ),
        deviations_written = coalesce(
          (v_deviations->'baseEvaluation'->>'deviationsWritten')::integer,
          0
        ) + coalesce(
          (v_deviations->'liveOpenClose'->>'openCloseDeviationsWritten')::integer,
          0
        ),
        completed_at = now(),
        metadata = metadata || jsonb_build_object(
          'routineInsightsWritten',
          coalesce(
            (v_insights->>'routineInsightsWritten')::integer,
            0
          ),
          'reviewReconciled',
          coalesce(
            (v_reconciled->>'reviewReconciled')::boolean,
            false
          )
        )
    where id = v_run_id;

    return jsonb_build_object(
      'ok', true,
      'runId', v_run_id,
      'cameraId', p_camera_id,
      'referenceDate', v_reference,
      'observations', v_observations,
      'reconciled', v_reconciled,
      'baselines', v_baselines,
      'insights', v_insights,
      'deviations', v_deviations
    );
  exception when others then
    update public.routine_refresh_runs
    set status = 'failed',
        error_code = sqlstate,
        completed_at = now(),
        metadata = metadata || jsonb_build_object(
          'error', left(sqlerrm, 500)
        )
    where id = v_run_id;

    raise;
  end;
end;
$function$;

create or replace function public.refresh_all_routine_intelligence_v2(
  p_reference_date date default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera record;
  v_processed integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  for v_camera in
    select camera.id
    from public.cameras camera
    where camera.routine_intelligence_enabled
    order by camera.created_at, camera.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  loop
    begin
      perform public.refresh_camera_routine_intelligence_v2(
        v_camera.id,
        p_reference_date,
        now()
      );
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object(
          'cameraId', v_camera.id,
          'sqlState', sqlstate,
          'error', left(sqlerrm, 300)
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'mode', 'full_v2',
    'processed', v_processed,
    'failed', v_failed,
    'failures', v_failures,
    'executedAt', now()
  );
end;
$function$;

-- Faz um refresh completo uma vez por dia por câmera. Se uma avaliação humana
-- acontecer depois do último refresh completo do dia, a câmera volta para a
-- fila e é reconciliada novamente no próximo ciclo.
create or replace function public.refresh_pending_routine_intelligence_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera record;
  v_reference date;
  v_processed integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  for v_camera in
    select
      camera.id,
      site.timezone,
      last_run.completed_at as last_completed_at
    from public.cameras camera
    join public.sites site
      on site.id = camera.site_id
    left join lateral (
      select max(run.completed_at) as completed_at
      from public.routine_refresh_runs run
      where run.camera_id = camera.id
        and run.status = 'completed'
        and run.reference_date = (
          now() at time zone site.timezone
        )::date
    ) last_run on true
    where camera.routine_intelligence_enabled
      and (
        last_run.completed_at is null
        or exists (
          select 1
          from public.events event
          where event.camera_id = camera.id
            and event.organization_id = camera.organization_id
            and event.human_reviewed_at is not null
            and event.human_reviewed_at > last_run.completed_at
            and event.started_at >= now() - interval '180 days'
        )
      )
    order by camera.created_at, camera.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    begin
      v_reference := (now() at time zone v_camera.timezone)::date;

      perform public.refresh_camera_routine_intelligence_v2(
        v_camera.id,
        v_reference,
        now()
      );

      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object(
          'cameraId', v_camera.id,
          'sqlState', sqlstate,
          'error', left(sqlerrm, 300)
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'mode', 'pending_daily_v2',
    'processed', v_processed,
    'failed', v_failed,
    'failures', v_failures,
    'executedAt', now()
  );
end;
$function$;

-- Funções de cron: somente service_role.
revoke all on function public.evaluate_camera_routine_deviations_v2(uuid, timestamptz)
  from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function public.evaluate_all_routine_deviations_v2(timestamptz, integer, integer)
  from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function public.refresh_camera_routine_intelligence_v2(uuid, date, timestamptz)
  from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function public.refresh_all_routine_intelligence_v2(date, integer, integer)
  from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function public.refresh_pending_routine_intelligence_v2(integer)
  from public, anon, authenticated, monitoria_mcp_readonly;

grant execute on function public.evaluate_camera_routine_deviations_v2(uuid, timestamptz)
  to service_role;
grant execute on function public.evaluate_all_routine_deviations_v2(timestamptz, integer, integer)
  to service_role;
grant execute on function public.refresh_camera_routine_intelligence_v2(uuid, date, timestamptz)
  to service_role;
grant execute on function public.refresh_all_routine_intelligence_v2(date, integer, integer)
  to service_role;
grant execute on function public.refresh_pending_routine_intelligence_v2(integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- Pesquisa IA + MCP: um único contrato de rotinas.
-- ---------------------------------------------------------------------------

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
          order by
            expectation.camera_id,
            expectation.valid_from nulls first,
            expectation.day_of_week,
            expectation.expectation_code
        )
        from public.operational_expectations expectation
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
      ), '[]'::jsonb),
      'deviations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', deviation.id,
            'observed_at', deviation.observed_at,
            'local_date', deviation.local_date,
            'camera_id', deviation.camera_id,
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
            'reference', coalesce(
              deviation.data->>'reference',
              'learned_pattern'
            ),
            'data', deviation.data
          )
          order by deviation.observed_at desc
        )
        from public.operational_deviations deviation
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
) to authenticated, monitoria_mcp_readonly, service_role;

commit;
