create or replace view public.ai_camera_monthly_cost_report_internal
with (security_invoker = true)
as
select report.*, organization.name as organization_name
from public.ai_camera_monthly_cost_report report
join public.organizations organization on organization.id = report.organization_id;
revoke all on public.ai_camera_monthly_cost_report_internal from public, anon, authenticated;
grant select on public.ai_camera_monthly_cost_report_internal to service_role;
