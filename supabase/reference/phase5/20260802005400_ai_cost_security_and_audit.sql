-- A camada de custos é interna. Nenhum usuário autenticado recebe acesso direto
-- às metas, configurações, alertas ou ao relatório de margem.

revoke all on public.ai_cost_settings from public, anon, authenticated;
revoke all on public.plan_margin_target_versions from public, anon, authenticated;
revoke all on public.ai_cost_alerts from public, anon, authenticated;
revoke all on public.ai_camera_monthly_cost_report from public, anon, authenticated;

revoke all on function public.refresh_monitoria_ai_usage_rollups(date, date)
  from public, anon, authenticated;
revoke all on function public.refresh_monitoria_ai_cost_alerts(date)
  from public, anon, authenticated;

grant all on public.ai_cost_settings to service_role;
grant all on public.plan_margin_target_versions to service_role;
grant all on public.ai_cost_alerts to service_role;
grant select on public.ai_camera_monthly_cost_report to service_role;
grant execute on function public.refresh_monitoria_ai_usage_rollups(date, date)
  to service_role;
grant execute on function public.refresh_monitoria_ai_cost_alerts(date)
  to service_role;
