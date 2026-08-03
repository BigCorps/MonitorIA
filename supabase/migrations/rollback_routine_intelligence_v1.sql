-- Rollback da INT-4 — Rotinas e desvios operacionais v1.
-- Remove apenas estruturas introduzidas pela INT-4.

begin;

revoke all on function public.review_routine_expectation_v1(uuid, text, numeric, numeric, numeric, numeric, numeric, text)
  from public, anon, authenticated;
revoke all on function public.assistant_routine_deviation_summary(uuid, timestamptz, timestamptz, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.refresh_all_routine_intelligence_v1(date, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.evaluate_all_routine_deviations_v1(timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_camera_routine_intelligence_v1(uuid, date, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.evaluate_camera_routine_deviations_v1(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_camera_routine_insights_v1(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_camera_behavior_baselines_v1(uuid, date)
  from public, anon, authenticated, service_role;
revoke all on function public.refresh_camera_routine_observations_v1(uuid, date)
  from public, anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    revoke all on function public.assistant_routine_deviation_summary(uuid, timestamptz, timestamptz, uuid, uuid)
      from monitoria_mcp_readonly;
  end if;
end
$$;

drop function if exists public.review_routine_expectation_v1(uuid, text, numeric, numeric, numeric, numeric, numeric, text);
drop function if exists public.assistant_routine_deviation_summary(uuid, timestamptz, timestamptz, uuid, uuid);
drop function if exists public.refresh_all_routine_intelligence_v1(date, integer, integer);
drop function if exists public.evaluate_all_routine_deviations_v1(timestamptz, integer, integer);
drop function if exists public.refresh_camera_routine_intelligence_v1(uuid, date, timestamptz);
drop function if exists public.evaluate_camera_routine_deviations_v1(uuid, timestamptz);
drop function if exists public.refresh_camera_routine_insights_v1(uuid);
drop function if exists public.refresh_camera_behavior_baselines_v1(uuid, date);
drop function if exists public.refresh_camera_routine_observations_v1(uuid, date);

drop function if exists private.upsert_operational_deviation_v1(
  uuid, uuid, uuid, uuid, uuid, date, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, numeric, text, numeric, timestamptz, uuid[], jsonb
);
drop function if exists private.upsert_routine_insight_v1(
  uuid, uuid, uuid, text, text, text, text, text, numeric, timestamptz,
  timestamptz, text, uuid, uuid[], jsonb
);
drop function if exists private.routine_severity(text, numeric, numeric);
drop function if exists private.routine_grace_value(text, text, integer);
drop function if exists private.routine_confidence(integer, integer, numeric, numeric);
drop function if exists private.routine_format_minute(numeric);
drop function if exists private.routine_local_minute_relative(timestamptz, date, text);
drop function if exists private.routine_local_minute(timestamptz, text);

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'camera_behavior_baselines',
      'operational_deviations'
    ]
    loop
      if exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime drop table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;

delete from public.operational_insights
where phase_source = 'int-4-routines-v1';

update public.monitoria_capability_registry
set status = 'planned',
    description = case module
      when 'routines' then 'Rotinas e padrões operacionais'
      when 'deviations' then 'Desvios em relação ao padrão observado'
      else description
    end,
    updated_at = now()
where module in ('routines', 'deviations');

drop table if exists public.routine_refresh_runs cascade;
drop table if exists public.operational_deviations cascade;
drop table if exists public.operational_expectations cascade;
drop table if exists public.camera_behavior_baselines cascade;
drop table if exists public.routine_observations cascade;

alter table public.cameras
  drop constraint if exists cameras_routine_grace_check,
  drop constraint if exists cameras_routine_sensitivity_check,
  drop constraint if exists cameras_routine_minimum_days_check,
  drop constraint if exists cameras_routine_learning_window_check;

alter table public.cameras
  drop column if exists routine_grace_minutes,
  drop column if exists routine_deviation_sensitivity,
  drop column if exists routine_minimum_days,
  drop column if exists routine_learning_window_days,
  drop column if exists routine_intelligence_enabled;

commit;
