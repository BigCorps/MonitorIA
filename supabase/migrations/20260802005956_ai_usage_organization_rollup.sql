create or replace function public.refresh_monitoria_ai_usage_organization(
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
  v_rows bigint := 0;
begin
  perform private.require_monitoria_service_role();

  if v_month_to < v_month_from then
    raise exception 'invalid_month_window';
  end if;

  insert into public.organization_usage_monthly (
    organization_id,
    usage_month,
    active_cameras,
    events_count,
    assistant_interactions,
    estimated_ai_cost_usd,
    storage_bytes,
    estimated_egress_bytes,
    total_model_calls,
    production_ai_cost_usd,
    experimental_ai_cost_usd,
    projected_30d_ai_cost_usd,
    known_ai_cost_brl_cents,
    projected_30d_ai_cost_brl_cents,
    updated_at
  )
  select monthly.organization_id,
         monthly.usage_month,
         count(*) filter (where monthly.jobs_count > 0)::integer,
         sum(monthly.events_count)::bigint,
         coalesce(existing.assistant_interactions, 0),
         sum(monthly.estimated_ai_cost_usd)::numeric,
         coalesce(existing.storage_bytes, 0),
         coalesce(existing.estimated_egress_bytes, 0),
         sum(monthly.total_model_calls)::bigint,
         sum(monthly.production_ai_cost_usd)::numeric(20,10),
         sum(monthly.experimental_ai_cost_usd)::numeric(20,10),
         sum(coalesce(monthly.projected_30d_ai_cost_usd, 0))::numeric(20,10),
         sum(monthly.known_ai_cost_brl_cents)::bigint,
         sum(coalesce(monthly.projected_30d_ai_cost_brl_cents, 0))::bigint,
         now()
  from public.camera_usage_monthly monthly
  left join public.organization_usage_monthly existing
    on existing.organization_id = monthly.organization_id
   and existing.usage_month = monthly.usage_month
  where monthly.usage_month between v_month_from and v_month_to
  group by monthly.organization_id,
           monthly.usage_month,
           existing.assistant_interactions,
           existing.storage_bytes,
           existing.estimated_egress_bytes
  on conflict (organization_id, usage_month)
  do update set
    active_cameras = excluded.active_cameras,
    events_count = excluded.events_count,
    estimated_ai_cost_usd = excluded.estimated_ai_cost_usd,
    total_model_calls = excluded.total_model_calls,
    production_ai_cost_usd = excluded.production_ai_cost_usd,
    experimental_ai_cost_usd = excluded.experimental_ai_cost_usd,
    projected_30d_ai_cost_usd = excluded.projected_30d_ai_cost_usd,
    known_ai_cost_brl_cents = excluded.known_ai_cost_brl_cents,
    projected_30d_ai_cost_brl_cents = excluded.projected_30d_ai_cost_brl_cents,
    updated_at = now();

  get diagnostics v_rows = row_count;

  return v_rows;
end;
$function$;

revoke all on function public.refresh_monitoria_ai_usage_organization(date, date)
  from public, anon, authenticated;
grant execute on function public.refresh_monitoria_ai_usage_organization(date, date)
  to service_role;
