begin;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'camera_health_incidents'
  ) then alter publication supabase_realtime drop table public.camera_health_incidents; end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'camera_health_baselines'
  ) then alter publication supabase_realtime drop table public.camera_health_baselines; end if;
end
$$;

delete from public.operational_insights where phase_source = '7' and insight_type = 'camera_health';
update public.monitoria_capability_registry
set status = 'planned', updated_at = now()
where module = 'camera_health';

drop function if exists public.assistant_camera_health_summary_v1(uuid,uuid,uuid);
drop function if exists public.dismiss_camera_health_incident_v1(uuid,text);
drop function if exists public.reject_camera_health_baseline_v1(uuid,text);
drop function if exists public.approve_camera_health_baseline_v1(uuid,text);
drop function if exists public.evaluate_camera_health_staleness_v1(uuid);
drop function if exists public.process_camera_health_observation_v1(uuid);
drop function if exists private.resolve_camera_health_incident_v1(uuid,timestamptz,text);
drop function if exists private.upsert_camera_health_incident_v1(uuid,uuid,uuid,uuid,text,timestamptz,numeric,text,text[],uuid);
drop function if exists private.camera_health_incident_label(text);
drop function if exists private.camera_health_grid_distance(jsonb,jsonb);

drop index if exists public.operational_insights_camera_health_source_unique_idx;
drop table if exists public.camera_health_refresh_runs;
drop table if exists public.camera_health_incidents;
drop table if exists public.camera_health_observations;
drop table if exists public.camera_health_baselines;

alter table public.cameras
  drop column if exists health_intelligence_enabled,
  drop column if exists health_observation_interval_seconds,
  drop column if exists health_stale_multiplier,
  drop column if exists health_thresholds,
  drop column if exists health_last_observed_at,
  drop column if exists health_status;

commit;
