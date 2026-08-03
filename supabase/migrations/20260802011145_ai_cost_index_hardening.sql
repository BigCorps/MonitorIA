drop index if exists public.camera_usage_daily_org_date_ai_idx;
drop index if exists public.camera_usage_monthly_org_month_ai_idx;

create index if not exists ai_cost_alerts_camera_idx
  on public.ai_cost_alerts(camera_id);

create index if not exists ai_cost_alerts_acknowledged_by_idx
  on public.ai_cost_alerts(acknowledged_by)
  where acknowledged_by is not null;

create index if not exists ai_cost_settings_updated_by_idx
  on public.ai_cost_settings(updated_by)
  where updated_by is not null;
