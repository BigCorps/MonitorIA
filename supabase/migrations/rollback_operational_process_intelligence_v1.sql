begin;

-- Remove a publicação Realtime antes de apagar as tabelas.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_process_instances'
  ) then
    alter publication supabase_realtime drop table public.operational_process_instances;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operational_process_deviations'
  ) then
    alter publication supabase_realtime drop table public.operational_process_deviations;
  end if;
end
$$;

drop trigger if exists operational_session_events_enqueue_process_refresh on public.operational_session_events;
drop trigger if exists operational_sessions_enqueue_process_refresh on public.operational_sessions;

drop function if exists public.assistant_operational_process_summary_v1(uuid, timestamptz, timestamptz, uuid, uuid);
drop function if exists public.save_operational_process_definition_v1(uuid, text, text, text, text, text, uuid, text, jsonb);
drop function if exists public.refresh_all_operational_processes_v1(uuid, uuid, integer);
drop function if exists public.process_operational_process_refresh_queue_v1(integer);
drop function if exists public.refresh_operational_process_for_session_v1(uuid);
drop function if exists private.upsert_process_insight_v1(public.operational_process_instances, text, jsonb, uuid[]);
drop function if exists private.upsert_process_deviation_v1(public.operational_process_instances, uuid, text, text, text, text, text, numeric, timestamptz, uuid[], jsonb);
drop function if exists private.enqueue_operational_process_session_v1();
drop function if exists private.process_definition_scope_priority_v1(text);

insert into public.monitoria_capability_registry(
  module, status, introduced_phase, description
)
values (
  'processes',
  'planned',
  '5',
  'Processos operacionais configurados'
)
on conflict (module) do update set
  status = excluded.status,
  introduced_phase = excluded.introduced_phase,
  description = excluded.description,
  updated_at = now();

drop table if exists public.operational_process_refresh_runs;
drop table if exists public.operational_process_refresh_queue;
drop table if exists public.operational_process_deviations;
drop table if exists public.operational_process_instance_steps;
drop table if exists public.operational_process_instances;
drop table if exists public.operational_process_steps;
drop table if exists public.operational_process_definitions;

alter table public.cameras
  drop constraint if exists cameras_process_min_confidence_check,
  drop constraint if exists cameras_process_stall_minutes_check,
  drop constraint if exists cameras_process_max_unexpected_steps_check,
  drop column if exists process_intelligence_enabled,
  drop column if exists process_min_confidence,
  drop column if exists process_stall_minutes,
  drop column if exists process_max_unexpected_steps;

commit;
