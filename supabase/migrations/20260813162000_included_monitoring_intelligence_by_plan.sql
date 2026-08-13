-- MonitorIA — inteligências derivadas incluídas nos planos.
-- Estas funções reutilizam eventos já analisados ou métricas locais do Agent.
-- Não altera maximum_analysis_frames, escalonamento, verificação ou clipes.

begin;

create or replace function private.apply_monitoria_included_intelligence_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.analysis_plan_code in ('basic', 'standard', 'intensive') then
    new.visual_state_enabled := true;
    new.short_memory_enabled := true;
    new.operational_sessions_enabled := true;
    new.routine_intelligence_enabled := true;
    new.process_intelligence_enabled := true;
    new.staff_profile_intelligence_enabled := true;
    new.health_intelligence_enabled := true;
    new.vehicle_memory_enabled := true;
  end if;

  return new;
end;
$$;

drop trigger if exists cameras_apply_included_intelligence on public.cameras;
create trigger cameras_apply_included_intelligence
before update of analysis_plan_code
on public.cameras
for each row
execute function private.apply_monitoria_included_intelligence_v1();

update public.camera_plan_catalog
set features = coalesce(features, '{}'::jsonb) || jsonb_build_object(
  'operational_sessions', true,
  'routine_intelligence', true,
  'process_intelligence', true,
  'operational_profiles', true,
  'camera_health', true,
  'operational_alerts', true,
  'cross_camera', true,
  'derived_intelligence_included', true
),
updated_at = now()
where code in ('basic', 'standard', 'intensive');

commit;
