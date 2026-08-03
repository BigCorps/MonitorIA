do $block$
declare
  v_from date;
  v_month date;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  select least(
    coalesce((select min(started_at)::date from public.analysis_jobs), current_date),
    coalesce((select min(created_at)::date from public.usage_events), current_date)
  ) into v_from;
  perform public.refresh_monitoria_ai_usage_rollups(v_from, current_date);
  v_month := date_trunc('month', v_from)::date;
  while v_month <= date_trunc('month', current_date)::date loop
    perform public.refresh_monitoria_ai_cost_alerts(v_month);
    v_month := (v_month + interval '1 month')::date;
  end loop;
end;
$block$;
