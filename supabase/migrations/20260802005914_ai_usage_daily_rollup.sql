create or replace function public.refresh_monitoria_ai_usage_daily(
  p_from date default (current_date - 3),
  p_to date default current_date
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_from date := coalesce(p_from, current_date - 3);
  v_to date := coalesce(p_to, current_date);
  v_rows bigint := 0;
begin
  perform private.require_monitoria_service_role();

  if v_to < v_from then
    raise exception 'invalid_usage_window';
  end if;

  if v_to - v_from > 400 then
    raise exception 'usage_window_too_large';
  end if;

  update public.camera_usage_daily daily
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
      updated_at = now()
  where daily.usage_date between v_from and v_to;

  with normalized_usage as (
    select usage.organization_id,
           usage.camera_id,
           usage.analysis_job_id,
           usage.model,
           coalesce(usage.metadata->>'role', 'unknown') as usage_role,
           usage.input_tokens,
           usage.cached_input_tokens,
           usage.output_tokens,
           usage.reasoning_tokens,
           coalesce(usage.estimated_cost_usd, 0)::numeric as estimated_cost_usd,
           case
             when coalesce(usage.metadata->>'latency_ms', '') ~ '^[0-9]+([.][0-9]+)?$'
               then (usage.metadata->>'latency_ms')::numeric
             else null
           end as latency_ms,
           usage.created_at,
           usage.created_at::date as usage_date,
           usage.analysis_plan_code
    from public.usage_events usage
    where usage.camera_id is not null
      and usage.created_at::date between v_from and v_to
  ),
  job_daily as (
    select job.organization_id,
           job.camera_id,
           job.started_at::date as usage_date,
           mode() within group (order by job.analysis_plan_code)
             filter (where job.analysis_plan_code is not null) as plan_code,
           count(*)::integer as jobs_count,
           count(*) filter (where job.status = 'completed')::integer as completed_jobs,
           count(*) filter (where job.status = 'failed')::integer as failed_jobs,
           count(event.id)::integer as relevant_events,
           count(event.id) filter (where event.requires_review)::integer as review_required_events,
           count(*) filter (
             where jsonb_path_exists(
               coalesce(job.model_chain, '[]'::jsonb),
               '$[*] ? (@.role == "escalation")'
             )
           )::integer as escalated_jobs,
           avg(event.confidence)::numeric(8,6) as avg_confidence,
           min(job.started_at) as observed_from,
           max(job.ended_at) as observed_to
    from public.analysis_jobs job
    left join public.events event
      on event.analysis_job_id = job.id
     and event.deleted_at is null
    where job.started_at::date between v_from and v_to
    group by job.organization_id, job.camera_id, job.started_at::date
  ),
  usage_daily as (
    select usage.organization_id,
           usage.camera_id,
           usage.usage_date,
           mode() within group (order by usage.analysis_plan_code)
             filter (where usage.analysis_plan_code is not null) as plan_code,
           count(*)::integer as total_model_calls,
           count(*) filter (where usage.model ilike '%nano%')::integer as nano_calls,
           count(*) filter (where usage.model ilike '%mini%')::integer as mini_calls,
           count(*) filter (where usage.usage_role = 'primary')::integer as primary_calls,
           count(*) filter (where usage.usage_role = 'verifier')::integer as verifier_calls,
           count(*) filter (where usage.usage_role = 'ab_candidate')::integer as experimental_calls,
           sum(usage.input_tokens)::bigint as input_tokens,
           sum(usage.cached_input_tokens)::bigint as cached_input_tokens,
           sum(usage.output_tokens)::bigint as output_tokens,
           sum(usage.reasoning_tokens)::bigint as reasoning_tokens,
           sum(usage.estimated_cost_usd)::numeric(20,10) as estimated_ai_cost_usd,
           sum(usage.estimated_cost_usd) filter (
             where usage.usage_role <> 'ab_candidate'
           )::numeric(20,10) as production_ai_cost_usd,
           sum(usage.estimated_cost_usd) filter (
             where usage.usage_role = 'ab_candidate'
           )::numeric(20,10) as experimental_ai_cost_usd,
           avg(usage.latency_ms)::numeric(14,2) as avg_latency_ms,
           (percentile_cont(0.95) within group (order by usage.latency_ms)
             filter (where usage.latency_ms is not null))::numeric(14,2) as p95_latency_ms,
           min(usage.created_at) as observed_from,
           max(usage.created_at) as observed_to
    from normalized_usage usage
    group by usage.organization_id, usage.camera_id, usage.usage_date
  ),
  combined as (
    select coalesce(job.organization_id, usage.organization_id) as organization_id,
           coalesce(job.camera_id, usage.camera_id) as camera_id,
           coalesce(job.usage_date, usage.usage_date) as usage_date,
           coalesce(job.plan_code, usage.plan_code, camera.analysis_plan_code) as plan_code,
           coalesce(job.jobs_count, 0) as jobs_count,
           coalesce(job.completed_jobs, 0) as completed_jobs,
           coalesce(job.failed_jobs, 0) as failed_jobs,
           coalesce(job.relevant_events, 0) as relevant_events,
           coalesce(job.review_required_events, 0) as review_required_events,
           coalesce(job.escalated_jobs, 0) as escalated_jobs,
           coalesce(usage.total_model_calls, 0) as total_model_calls,
           coalesce(usage.nano_calls, 0) as nano_calls,
           coalesce(usage.mini_calls, 0) as mini_calls,
           coalesce(usage.primary_calls, 0) as primary_calls,
           coalesce(usage.verifier_calls, 0) as verifier_calls,
           coalesce(usage.experimental_calls, 0) as experimental_calls,
           coalesce(usage.input_tokens, 0) as input_tokens,
           coalesce(usage.cached_input_tokens, 0) as cached_input_tokens,
           coalesce(usage.output_tokens, 0) as output_tokens,
           coalesce(usage.reasoning_tokens, 0) as reasoning_tokens,
           coalesce(usage.estimated_ai_cost_usd, 0) as estimated_ai_cost_usd,
           coalesce(usage.production_ai_cost_usd, 0) as production_ai_cost_usd,
           coalesce(usage.experimental_ai_cost_usd, 0) as experimental_ai_cost_usd,
           usage.avg_latency_ms,
           usage.p95_latency_ms,
           job.avg_confidence,
           least(coalesce(job.observed_from, usage.observed_from), coalesce(usage.observed_from, job.observed_from)) as observed_from,
           greatest(coalesce(job.observed_to, usage.observed_to), coalesce(usage.observed_to, job.observed_to)) as observed_to
    from job_daily job
    full join usage_daily usage
      on usage.camera_id = job.camera_id
     and usage.usage_date = job.usage_date
    join public.cameras camera
      on camera.id = coalesce(job.camera_id, usage.camera_id)
  )
  insert into public.camera_usage_daily (
    organization_id,
    camera_id,
    usage_date,
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
    updated_at
  )
  select combined.organization_id,
         combined.camera_id,
         combined.usage_date,
         combined.plan_code,
         combined.relevant_events,
         combined.nano_calls,
         combined.mini_calls,
         combined.escalated_jobs,
         combined.input_tokens,
         combined.cached_input_tokens,
         combined.output_tokens,
         combined.reasoning_tokens,
         combined.estimated_ai_cost_usd,
         combined.jobs_count,
         combined.completed_jobs,
         combined.failed_jobs,
         combined.relevant_events,
         combined.review_required_events,
         combined.total_model_calls,
         combined.primary_calls,
         combined.verifier_calls,
         combined.experimental_calls,
         combined.production_ai_cost_usd,
         combined.experimental_ai_cost_usd,
         combined.avg_latency_ms,
         combined.p95_latency_ms,
         combined.avg_confidence,
         case
           when combined.relevant_events > 0
             then round(combined.review_required_events::numeric * 10000 / combined.relevant_events)::integer
           else 0
         end,
         case
           when combined.jobs_count > 0
             then round(combined.escalated_jobs::numeric * 10000 / combined.jobs_count)::integer
           else 0
         end,
         combined.observed_from,
         combined.observed_to,
         now()
  from combined
  on conflict (camera_id, usage_date)
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
    updated_at = now();

  get diagnostics v_rows = row_count;

  return v_rows;
end;
$function$;

revoke all on function public.refresh_monitoria_ai_usage_daily(date, date)
  from public, anon, authenticated;
grant execute on function public.refresh_monitoria_ai_usage_daily(date, date)
  to service_role;
