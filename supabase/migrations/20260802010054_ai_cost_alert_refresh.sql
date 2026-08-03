create or replace function public.refresh_monitoria_ai_cost_alerts(
  p_month date default date_trunc('month', current_date)::date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_month date := date_trunc('month', coalesce(p_month, current_date))::date;
  v_upserted bigint := 0;
  v_resolved bigint := 0;
  v_now timestamptz := now();
begin
  perform private.require_monitoria_service_role();

  with breached as (
    select report.organization_id,
           report.camera_id,
           report.usage_month,
           'projected_ai_cost'::text as alert_type,
           case when report.cost_status = 'critical' then 'critical' else 'warning' end as severity,
           report.projected_30d_ai_cost_brl_cents::numeric as observed_value,
           case
             when report.cost_status = 'critical'
               then report.target_max_cogs_cents::numeric
             else round(report.target_max_cogs_cents * report.warning_target_percent / 100.0)::numeric
           end as threshold_value,
           'BRL_CENTS'::text as unit,
           jsonb_build_object(
             'planCode', report.plan_code,
             'planName', report.plan_name,
             'targetMaxCogsCents', report.target_max_cogs_cents,
             'projectedAiCostBrlCents', report.projected_30d_ai_cost_brl_cents,
             'utilizationBasisPoints', report.projected_cost_target_utilization_basis_points,
             'productionCostUsd', report.production_ai_cost_usd,
             'experimentalCostUsd', report.experimental_ai_cost_usd,
             'observationHours', report.observation_hours,
             'scope', 'known_ai_cost_against_total_cogs_target'
           ) as details
    from public.ai_camera_monthly_cost_report report
    where report.usage_month = v_month
      and report.cost_status in ('warning', 'critical')

    union all

    select report.organization_id,
           report.camera_id,
           report.usage_month,
           'escalation_rate'::text,
           case when report.escalation_status = 'critical' then 'critical' else 'warning' end,
           report.escalation_rate_basis_points::numeric,
           report.escalation_limit_basis_points::numeric,
           'BASIS_POINTS'::text,
           jsonb_build_object(
             'planCode', report.plan_code,
             'maximumEscalationPercent', report.maximum_escalation_percent,
             'escalatedJobs', report.escalation_calls,
             'jobs', report.jobs_count,
             'routingTelemetryAvailable', report.routing_telemetry_available,
             'scope', 'commercial_limit_only'
           )
    from public.ai_camera_monthly_cost_report report
    where report.usage_month = v_month
      and report.escalation_status in ('warning', 'critical')

    union all

    select report.organization_id,
           report.camera_id,
           report.usage_month,
           'usage_data_quality'::text,
           'warning'::text,
           report.total_model_calls::numeric,
           report.completed_jobs::numeric,
           'CALLS'::text,
           jsonb_build_object(
             'jobs', report.jobs_count,
             'completedJobs', report.completed_jobs,
             'failedJobs', report.failed_jobs,
             'totalModelCalls', report.total_model_calls,
             'failedRateBasisPoints', report.failed_rate_basis_points,
             'routingTelemetryAvailable', report.routing_telemetry_available
           )
    from public.ai_camera_monthly_cost_report report
    where report.usage_month = v_month
      and report.data_quality_status = 'warning'
  )
  insert into public.ai_cost_alerts (
    organization_id,
    camera_id,
    usage_month,
    alert_type,
    severity,
    status,
    observed_value,
    threshold_value,
    unit,
    first_seen_at,
    last_seen_at,
    acknowledged_at,
    acknowledged_by,
    resolved_at,
    details,
    updated_at
  )
  select breached.organization_id,
         breached.camera_id,
         breached.usage_month,
         breached.alert_type,
         breached.severity,
         'open',
         breached.observed_value,
         breached.threshold_value,
         breached.unit,
         v_now,
         v_now,
         null,
         null,
         null,
         breached.details,
         v_now
  from breached
  on conflict (organization_id, camera_id, usage_month, alert_type)
  do update set
    severity = excluded.severity,
    status = case
      when public.ai_cost_alerts.status = 'acknowledged'
       and public.ai_cost_alerts.severity = excluded.severity
        then 'acknowledged'
      else 'open'
    end,
    observed_value = excluded.observed_value,
    threshold_value = excluded.threshold_value,
    unit = excluded.unit,
    last_seen_at = v_now,
    acknowledged_at = case
      when public.ai_cost_alerts.status = 'acknowledged'
       and public.ai_cost_alerts.severity = excluded.severity
        then public.ai_cost_alerts.acknowledged_at
      else null
    end,
    acknowledged_by = case
      when public.ai_cost_alerts.status = 'acknowledged'
       and public.ai_cost_alerts.severity = excluded.severity
        then public.ai_cost_alerts.acknowledged_by
      else null
    end,
    resolved_at = null,
    details = excluded.details,
    updated_at = v_now;

  get diagnostics v_upserted = row_count;

  update public.ai_cost_alerts alert
  set status = 'resolved',
      resolved_at = v_now,
      updated_at = v_now
  where alert.usage_month = v_month
    and alert.status <> 'resolved'
    and not exists (
      select 1
      from public.ai_camera_monthly_cost_report report
      where report.organization_id = alert.organization_id
        and report.camera_id = alert.camera_id
        and report.usage_month = alert.usage_month
        and (
          (alert.alert_type = 'projected_ai_cost' and report.cost_status in ('warning', 'critical'))
          or (alert.alert_type = 'escalation_rate' and report.escalation_status in ('warning', 'critical'))
          or (alert.alert_type = 'usage_data_quality' and report.data_quality_status = 'warning')
        )
    );

  get diagnostics v_resolved = row_count;

  return jsonb_build_object(
    'success', true,
    'month', v_month,
    'upserted', v_upserted,
    'resolved', v_resolved
  );
end;
$function$;

revoke all on function public.refresh_monitoria_ai_cost_alerts(date)
  from public, anon, authenticated;
grant execute on function public.refresh_monitoria_ai_cost_alerts(date)
  to service_role;
