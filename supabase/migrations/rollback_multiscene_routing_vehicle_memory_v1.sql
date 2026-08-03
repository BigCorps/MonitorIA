-- Rollback da Fase 3.5 do MonitorIA.
-- Remove dados de roteamento e memória de veículos criados por esta fase.

begin;

drop function if exists public.assistant_vehicle_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
);
drop function if exists public.process_event_vehicle_memory_v1(uuid);
drop function if exists private.jsonb_text_array_overlap(jsonb, jsonb);

alter table public.analysis_jobs
  drop constraint if exists analysis_jobs_routing_decision_id_fkey,
  drop column if exists routing_decision_id;

alter table public.event_vehicles
  drop constraint if exists event_vehicles_vehicle_instance_id_fkey;

drop table if exists public.event_vehicle_memory_links;
drop table if exists public.vehicle_memory_instances;
drop table if exists public.analysis_routing_decisions;

alter table public.event_vehicles
  drop constraint if exists event_vehicles_appearance_object_check,
  drop constraint if exists event_vehicles_appearance_confidence_check,
  drop column if exists vehicle_instance_id,
  drop column if exists vehicle_similarity,
  drop column if exists appearance_confidence,
  drop column if exists appearance;

alter table public.events
  drop constraint if exists events_scene_complexity_object_check,
  drop constraint if exists events_routing_summary_object_check,
  drop constraint if exists events_multiscene_counts_check,
  drop column if exists probable_distinct_vehicle_count,
  drop column if exists entity_relation_count,
  drop column if exists routing_summary,
  drop column if exists scene_complexity;

alter table public.cameras
  drop constraint if exists cameras_intelligence_mode_check,
  drop constraint if exists cameras_scene_density_check,
  drop constraint if exists cameras_complexity_strong_threshold_check,
  drop constraint if exists cameras_verification_threshold_check,
  drop constraint if exists cameras_vehicle_memory_window_check,
  drop constraint if exists cameras_vehicle_similarity_threshold_check,
  drop column if exists vehicle_similarity_threshold,
  drop column if exists vehicle_memory_window_minutes,
  drop column if exists verification_threshold,
  drop column if exists complexity_strong_threshold,
  drop column if exists verification_enabled,
  drop column if exists complexity_routing_enabled,
  drop column if exists vehicle_memory_enabled,
  drop column if exists multi_entity_enabled,
  drop column if exists scene_density,
  drop column if exists intelligence_mode;

commit;
