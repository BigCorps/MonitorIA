create or replace view public.ai_camera_monthly_cost_report
with (security_invoker = true)
as
with report_base as (
  select monthly.organization_id,
         monthly.camera_id,
         camera.name as camera_name,
         monthly.usage_month,
         coalesce(monthly.plan_code, subscription.plan_code, camera.analysis_plan_code, 'basic') as plan_code,
         plan.display_name as plan_name,
         coalesce(price.amount_cents, 0) as reference_price_cents,
         coalesce(revenue.actual_paid_revenue_cents, 0) as actual_paid_revenue_cents,
         coalesce(target.target_max_cogs_cents, 0) as target_max_cogs_cents,
         plan.maximum_escalation_percent,
         settings.warning_target_percent,
         settings.critical_target_percent,
         settings.usd_to_brl,
         monthly.jobs_count,
         monthly.completed_jobs,
         monthly.failed_jobs,
         monthly.relevant_events,
         monthly.review_required_events,
         monthly.total_model_calls,
         monthly.nano_calls,
         monthly.mini_calls,
         monthly.primary_calls,
         monthly.verifier_calls,
         monthly.experimental_calls,
         monthly.escalation_calls,
         monthly.input_tokens,
         monthly.cached_input_tokens,
         monthly.output_tokens,
         monthly.reasoning_tokens,
         monthly.estimated_ai_cost_usd,
         monthly.production_ai_cost_usd,
         monthly.experimental_ai_cost_usd,
         monthly.known_ai_cost_brl_cents,
         monthly.projected_30d_ai_cost_usd,
         monthly.projected_30d_ai_cost_brl_cents,
         monthly.avg_latency_ms,
         monthly.p95_latency_ms,
         monthly.avg_confidence,
         monthly.review_rate_basis_points,
         monthly.escalation_rate_basis_points,
         monthly.observed_from,
         monthly.observed_to,
         monthly.observation_hours,
         monthly.routing_telemetry_available,
         case
           when monthly.jobs_count > 0
             then round(monthly.failed_jobs::numeric * 10000 / monthly.jobs_count)::integer
           else 0
         end as failed_rate_basis_points,
         case
           when monthly.completed_jobs > 0
             then round(monthly.total_model_calls::numeric * 10000 / monthly.completed_jobs)::integer
           else 0
         end as model_calls_per_completed_job_basis_points
  from public.camera_usage_monthly monthly
  join public.cameras camera
    on camera.id = monthly.camera_id
  left join public.camera_subscriptions subscription
    on subscription.camera_id = monthly.camera_id
  left join public.camera_plan_catalog plan
    on plan.code = coalesce(monthly.plan_code, subscription.plan_code, camera.analysis_plan_code, 'basic')
  cross join public.ai_cost_settings settings
  left join lateral (
    select version.amount_cents
    from public.camera_plan_price_versions version
    where version.plan_code = coalesce(monthly.plan_code, subscription.plan_code, camera.analysis_plan_code, 'basic')
      and version.valid_from < (monthly.usage_month + interval '1 month')
      and (version.valid_to is null or version.valid_to >= monthly.usage_month)
    order by version.valid_from desc
    limit 1
  ) price on true
  left join lateral (
    select margin.target_max_cogs_cents
    from public.plan_margin_target_versions margin
    where margin.plan_code = coalesce(monthly.plan_code, subscription.plan_code, camera.analysis_plan_code, 'basic')
      and margin.valid_from < (monthly.usage_month + interval '1 month')
      and (margin.valid_to is null or margin.valid_to >= monthly.usage_month)
    order by margin.valid_from desc
    limit 1
  ) target on true
  left join lateral (
    select coalesce(sum(item.total_amount_cents), 0)::bigint as actual_paid_revenue_cents
    from public.billing_invoice_items item
    join public.billing_invoices invoice
      on invoice.id = item.invoice_id
     and invoice.status = 'paid'
    where item.camera_id = monthly.camera_id
      and item.item_type in ('camera_subscription', 'camera_upgrade')
      and coalesce(item.service_end, invoice.service_period_end) > monthly.usage_month
      and coalesce(item.service_start, invoice.service_period_start) < monthly.usage_month + interval '1 month'
  ) revenue on true
),
report_metrics as (
  select base.*,
         case
           when base.projected_30d_ai_cost_brl_cents is not null
            and base.target_max_cogs_cents > 0
             then round(
               base.projected_30d_ai_cost_brl_cents::numeric
               * 10000
               / base.target_max_cogs_cents
             )::integer
           else null
         end as projected_cost_target_utilization_basis_points,
         greatest(0, base.maximum_escalation_percent * 100) as escalation_limit_basis_points,
         case
           when coalesce(nullif(base.actual_paid_revenue_cents, 0), base.reference_price_cents) > 0
            and base.projected_30d_ai_cost_brl_cents is not null
             then round(
               (
                 coalesce(nullif(base.actual_paid_revenue_cents, 0), base.reference_price_cents)
                 - base.projected_30d_ai_cost_brl_cents
               )::numeric
               * 10000
               / coalesce(nullif(base.actual_paid_revenue_cents, 0), base.reference_price_cents)
             )::integer
           else null
         end as margin_after_projected_ai_basis_points
  from report_base base
),
report_status as (
  select metrics.*,
         case
           when metrics.projected_cost_target_utilization_basis_points is null then 'insufficient_data'
           when metrics.projected_cost_target_utilization_basis_points >= metrics.critical_target_percent * 100 then 'critical'
           when metrics.projected_cost_target_utilization_basis_points >= metrics.warning_target_percent * 100 then 'warning'
           else 'healthy'
         end as cost_status,
         case
           when metrics.maximum_escalation_percent = 0
            and metrics.escalation_rate_basis_points > 0 then 'critical'
           when metrics.maximum_escalation_percent > 0
            and metrics.escalation_rate_basis_points > metrics.escalation_limit_basis_points then 'critical'
           when metrics.maximum_escalation_percent > 0
            and metrics.escalation_rate_basis_points >= round(metrics.escalation_limit_basis_points * 0.8) then 'warning'
           else 'healthy'
         end as escalation_status,
         case
           when metrics.jobs_count >= 10
            and metrics.total_model_calls < metrics.completed_jobs then 'warning'
           when metrics.failed_rate_basis_points >= 1000 then 'warning'
           else 'healthy'
         end as data_quality_status
  from report_metrics metrics
)
select status.*,
       case
         when 'critical' in (status.cost_status, status.escalation_status) then 'critical'
         when 'warning' in (status.cost_status, status.escalation_status, status.data_quality_status) then 'warning'
         when status.cost_status = 'insufficient_data' then 'insufficient_data'
         else 'healthy'
       end as overall_status
from report_status status;

revoke all on public.ai_camera_monthly_cost_report from public, anon, authenticated;
grant select on public.ai_camera_monthly_cost_report to service_role;

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
