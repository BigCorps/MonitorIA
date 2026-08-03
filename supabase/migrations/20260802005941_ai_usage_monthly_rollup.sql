create or replace function public.refresh_monitoria_ai_usage_monthly(
  p_month_from date default date_trunc('month', current_date)::date,
  p_month_to date default date_trunc('month', current_date)::date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_month_from date := date_trunc('month', coalesce(p_month_from, current_date))::date;
  v_month_to date := date_trunc('month', coalesce(p_month_to, current_date))::date;
  v_usd_to_brl numeric(10,4);
  v_min_jobs integer;
  v_min_hours numeric(10,2);
  v_rows bigint := 0;
begin
  perform private.require_monitoria_service_role();

  if v_month_to < v_month_from then
    raise exception 'invalid_month_window';
  end if;

  if v_month_to > v_month_from + interval '24 months' then
    raise exception 'month_window_too_large';
  end if;

  select settings.usd_to_brl,
         settings.projection_min_jobs,
         settings.projection_min_hours
    into v_usd_to_brl, v_min_jobs, v_min_hours
  from public.ai_cost_settings settings
  where settings.id = 1;

  v_usd_to_brl := coalesce(v_usd_to_brl, 6.0000);
  v_min_jobs := coalesce(v_min_jobs, 10);
  v_min_hours := coalesce(v_min_hours, 2.00);

  update public.camera_usage_monthly monthly
  set plan_code = null,
      events_count = 0,
      nano_calls = 0,
      mini_calls = 0,
      escalation_calls = 0,
      input_tokens = 0,
      cached_input_tokens = 0,
      output_tokens = 0,
      reasoning_tokens = 0,
      estimated_ai_cost_usd = 0,
      jobs_count = 0,
      completed_jobs = 0,
      failed_jobs = 0,
      relevant_events = 0,
      review_required_events = 0,
      total_model_calls = 0,
      primary_calls = 0,
      verifier_calls = 0,
      experimental_calls = 0,
      production_ai_cost_usd = 0,
      experimental_ai_cost_usd = 0,
      avg_latency_ms = null,
      p95_latency_ms = null,
      avg_confidence = null,
      review_rate_basis_points = 0,
      escalation_rate_basis_points = 0,
      observed_from = null,
      observed_to = null,
      observation_hours = 0,
      known_ai_cost_brl_cents = 0,
      projected_30d_ai_cost_usd = null,
      projected_30d_ai_cost_brl_cents = null,
      routing_telemetry_available = false,
      updated_at = now()
  where monthly.usage_month between v_month_from and v_month_to;

  with monthly_raw as (
    select daily.organization_id,
           daily.camera_id,
           date_trunc('month', daily.usage_date)::date as usage_month,
           mode() within group (order by daily.plan_code)
             filter (where daily.plan_code is not null) as plan_code,
           sum(daily.events_count)::bigint as events_count,
           sum(daily.nano_calls)::bigint as nano_calls,
           sum(daily.mini_calls)::bigint as mini_calls,
           sum(daily.escalation_calls)::bigint as escalation_calls,
           sum(daily.input_tokens)::bigint as input_tokens,
           sum(daily.cached_input_tokens)::bigint as cached_input_tokens,
           sum(daily.output_tokens)::bigint as output_tokens,
           sum(daily.reasoning_tokens)::bigint as reasoning_tokens,
           sum(daily.estimated_ai_cost_usd)::numeric(20,10) as estimated_ai_cost_usd,
           sum(daily.jobs_count)::bigint as jobs_count,
           sum(daily.completed_jobs)::bigint as completed_jobs,
           sum(daily.failed_jobs)::bigint as failed_jobs,
           sum(daily.relevant_events)::bigint as relevant_events,
           sum(daily.review_required_events)::bigint as review_required_events,
           sum(daily.total_model_calls)::bigint as total_model_calls,
           sum(daily.primary_calls)::bigint as primary_calls,
           sum(daily.verifier_calls)::bigint as verifier_calls,
           sum(daily.experimental_calls)::bigint as experimental_calls,
           sum(daily.production_ai_cost_usd)::numeric(20,10) as production_ai_cost_usd,
           sum(daily.experimental_ai_cost_usd)::numeric(20,10) as experimental_ai_cost_usd,
           case
             when sum(daily.total_model_calls) > 0
               then sum(coalesce(daily.avg_latency_ms, 0) * daily.total_model_calls)
                    / sum(daily.total_model_calls)
             else null
           end::numeric(14,2) as avg_latency_ms,
           max(daily.p95_latency_ms)::numeric(14,2) as p95_latency_ms,
           case
             when sum(daily.relevant_events) > 0
               then sum(coalesce(daily.avg_confidence, 0) * daily.relevant_events)
                    / sum(daily.relevant_events)
             else null
           end::numeric(8,6) as avg_confidence,
           min(daily.observed_from) as observed_from,
           max(daily.observed_to) as observed_to
    from public.camera_usage_daily daily
    where daily.usage_date between v_month_from and (v_month_to + interval '1 month - 1 day')::date
    group by daily.organization_id, daily.camera_id, date_trunc('month', daily.usage_date)::date
  ),
  monthly_calculated as (
    select raw.*,
           greatest(
             0,
             extract(epoch from (raw.observed_to - raw.observed_from)) / 3600
           )::numeric(14,4) as observation_hours
    from monthly_raw raw
  )
  insert into public.camera_usage_monthly (
    organization_id,
    camera_id,
    usage_month,
    plan_code,
    events_count,
    nano_calls,
    mini_calls,
    escalation_calls,
    input_tokens,
    cached_input_tokens,
    output_tokens,
    reasoning_tokens,
    estimated_ai_cost_usd,
    jobs_count,
    completed_jobs,
    failed_jobs,
    relevant_events,
    review_required_events,
    total_model_calls,
    primary_calls,
    verifier_calls,
    experimental_calls,
    production_ai_cost_usd,
    experimental_ai_cost_usd,
    avg_latency_ms,
    p95_latency_ms,
    avg_confidence,
    review_rate_basis_points,
    escalation_rate_basis_points,
    observed_from,
    observed_to,
    observation_hours,
    known_ai_cost_brl_cents,
    projected_30d_ai_cost_usd,
    projected_30d_ai_cost_brl_cents,
    routing_telemetry_available,
    updated_at
  )
  select calculated.organization_id,
         calculated.camera_id,
         calculated.usage_month,
         calculated.plan_code,
         calculated.events_count,
         calculated.nano_calls,
         calculated.mini_calls,
         calculated.escalation_calls,
         calculated.input_tokens,
         calculated.cached_input_tokens,
         calculated.output_tokens,
         calculated.reasoning_tokens,
         calculated.estimated_ai_cost_usd,
         calculated.jobs_count,
         calculated.completed_jobs,
         calculated.failed_jobs,
         calculated.relevant_events,
         calculated.review_required_events,
         calculated.total_model_calls,
         calculated.primary_calls,
         calculated.verifier_calls,
         calculated.experimental_calls,
         calculated.production_ai_cost_usd,
         calculated.experimental_ai_cost_usd,
         calculated.avg_latency_ms,
         calculated.p95_latency_ms,
         calculated.avg_confidence,
         case
           when calculated.relevant_events > 0
             then round(calculated.review_required_events::numeric * 10000 / calculated.relevant_events)::integer
           else 0
         end,
         case
           when calculated.jobs_count > 0
             then round(calculated.escalation_calls::numeric * 10000 / calculated.jobs_count)::integer
           else 0
         end,
         calculated.observed_from,
         calculated.observed_to,
         calculated.observation_hours,
         round(calculated.estimated_ai_cost_usd * v_usd_to_brl * 100)::integer,
         case
           when calculated.jobs_count >= v_min_jobs
            and calculated.observation_hours >= v_min_hours
             then (calculated.production_ai_cost_usd / calculated.observation_hours * 720)::numeric(20,10)
           else null
         end,
         case
           when calculated.jobs_count >= v_min_jobs
            and calculated.observation_hours >= v_min_hours
             then round(
               calculated.production_ai_cost_usd
               / calculated.observation_hours
               * 720
               * v_usd_to_brl
               * 100
             )::integer
           else null
         end,
         false,
         now()
  from monthly_calculated calculated
  on conflict (camera_id, usage_month)
  do update set
    organization_id = excluded.organization_id,
    plan_code = excluded.plan_code,
    events_count = excluded.events_count,
    nano_calls = excluded.nano_calls,
    mini_calls = excluded.mini_calls,
    escalation_calls = excluded.escalation_calls,
    input_tokens = excluded.input_tokens,
    cached_input_tokens = excluded.cached_input_tokens,
    output_tokens = excluded.output_tokens,
    reasoning_tokens = excluded.reasoning_tokens,
    estimated_ai_cost_usd = excluded.estimated_ai_cost_usd,
    jobs_count = excluded.jobs_count,
    completed_jobs = excluded.completed_jobs,
    failed_jobs = excluded.failed_jobs,
    relevant_events = excluded.relevant_events,
    review_required_events = excluded.review_required_events,
    total_model_calls = excluded.total_model_calls,
    primary_calls = excluded.primary_calls,
    verifier_calls = excluded.verifier_calls,
    experimental_calls = excluded.experimental_calls,
    production_ai_cost_usd = excluded.production_ai_cost_usd,
    experimental_ai_cost_usd = excluded.experimental_ai_cost_usd,
    avg_latency_ms = excluded.avg_latency_ms,
    p95_latency_ms = excluded.p95_latency_ms,
    avg_confidence = excluded.avg_confidence,
    review_rate_basis_points = excluded.review_rate_basis_points,
    escalation_rate_basis_points = excluded.escalation_rate_basis_points,
    observed_from = excluded.observed_from,
    observed_to = excluded.observed_to,
    observation_hours = excluded.observation_hours,
    known_ai_cost_brl_cents = excluded.known_ai_cost_brl_cents,
    projected_30d_ai_cost_usd = excluded.projected_30d_ai_cost_usd,
    projected_30d_ai_cost_brl_cents = excluded.projected_30d_ai_cost_brl_cents,
    routing_telemetry_available = excluded.routing_telemetry_available,
    updated_at = now();

  get diagnostics v_rows = row_count;

  return v_rows;
end;
$function$;

revoke all on function public.refresh_monitoria_ai_usage_monthly(date, date)
  from public, anon, authenticated;
grant execute on function public.refresh_monitoria_ai_usage_monthly(date, date)
  to service_role;
