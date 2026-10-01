-- MonitorIA VIP — Gate 1: hardening de índices das FKs novas.

create index if not exists vip_plan_catalog_technical_plan_idx
  on public.vip_plan_catalog(technical_plan_code);

create index if not exists vip_project_status_events_actor_user_idx
  on public.vip_project_status_events(actor_user_id)
  where actor_user_id is not null;

create index if not exists vip_project_status_events_actor_operator_idx
  on public.vip_project_status_events(actor_sales_operator_id)
  where actor_sales_operator_id is not null;

create index if not exists vip_projects_created_by_idx
  on public.vip_projects(created_by)
  where created_by is not null;

create index if not exists vip_projects_selected_plan_idx
  on public.vip_projects(selected_plan_code);

create index if not exists vip_projects_technical_plan_idx
  on public.vip_projects(technical_plan_code);
