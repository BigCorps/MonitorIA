create or replace function private.touch_ai_cost_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists ai_cost_settings_touch_updated_at
  on public.ai_cost_settings;
create trigger ai_cost_settings_touch_updated_at
before update on public.ai_cost_settings
for each row execute function private.touch_ai_cost_updated_at();

drop trigger if exists ai_cost_alerts_touch_updated_at
  on public.ai_cost_alerts;
create trigger ai_cost_alerts_touch_updated_at
before update on public.ai_cost_alerts
for each row execute function private.touch_ai_cost_updated_at();
