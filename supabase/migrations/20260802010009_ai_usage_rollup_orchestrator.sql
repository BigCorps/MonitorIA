create or replace function public.refresh_monitoria_ai_usage_rollups(
  p_from date default (current_date - 3),
  p_to date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_from date := coalesce(p_from, current_date - 3);
  v_to date := coalesce(p_to, current_date);
  v_month_from date := date_trunc('month', coalesce(p_from, current_date - 3))::date;
  v_month_to date := date_trunc('month', coalesce(p_to, current_date))::date;
  v_daily bigint;
  v_monthly bigint;
  v_organization bigint;
  v_usd_to_brl numeric(10,4);
begin
  perform private.require_monitoria_service_role();

  v_daily := public.refresh_monitoria_ai_usage_daily(v_from, v_to);
  v_monthly := public.refresh_monitoria_ai_usage_monthly(v_month_from, v_month_to);
  v_organization := public.refresh_monitoria_ai_usage_organization(v_month_from, v_month_to);

  select settings.usd_to_brl
    into v_usd_to_brl
  from public.ai_cost_settings settings
  where settings.id = 1;

  return jsonb_build_object(
    'success', true,
    'from', v_from,
    'to', v_to,
    'dailyRows', v_daily,
    'monthlyRows', v_monthly,
    'organizationRows', v_organization,
    'usdToBrl', coalesce(v_usd_to_brl, 6.0000)
  );
end;
$function$;

revoke all on function public.refresh_monitoria_ai_usage_rollups(date, date)
  from public, anon, authenticated;
grant execute on function public.refresh_monitoria_ai_usage_rollups(date, date)
  to service_role;
