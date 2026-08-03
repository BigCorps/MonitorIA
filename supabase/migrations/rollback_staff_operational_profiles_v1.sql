-- MonitorIA — rollback INT-6
begin;

-- Remover das publicações apenas as tabelas criadas pela INT-6.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'staff_profile_candidates',
    'staff_profile_match_decisions',
    'staff_profile_update_proposals'
  ]
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', v_table);
    end if;
  end loop;
end
$$;

drop trigger if exists event_person_memory_links_enqueue_staff_profile on public.event_person_memory_links;
drop trigger if exists operational_session_events_enqueue_staff_profile on public.operational_session_events;
drop trigger if exists operational_process_instances_enqueue_staff_profile on public.operational_process_instances;

drop function if exists private.enqueue_staff_profile_from_person_link_v1();
drop function if exists private.enqueue_staff_profile_from_session_event_v1();
drop function if exists private.enqueue_staff_profile_from_process_v1();
drop function if exists private.enqueue_staff_profile_event_person_v1(uuid);
drop function if exists private.build_staff_profile_update_proposal_v1(uuid);
drop function if exists private.staff_candidate_shift_windows_v1(uuid);
drop function if exists private.staff_profile_recurring_appearance_v1(uuid);
drop function if exists private.staff_profile_shift_windows_v1(uuid);
drop function if exists private.staff_profile_snapshot_v1(uuid);
drop function if exists private.staff_schedule_score_v1(smallint[], jsonb, smallint, integer);
drop function if exists private.staff_text_array_overlap_score_v1(text[], text[]);
drop function if exists private.staff_uuid_array_overlap_score_v1(uuid[], uuid[]);

drop function if exists public.assistant_staff_operational_profile_summary_v1(uuid, uuid, uuid);
drop function if exists public.restore_staff_operational_profile_version_v1(uuid, uuid, integer, text);
drop function if exists public.save_staff_operational_profile_v1(uuid, uuid, integer, text, text, text, text, numeric, text);
drop function if exists public.review_staff_profile_update_proposal_v1(uuid, uuid, text, text);
drop function if exists public.review_staff_profile_match_v1(uuid, uuid, text, uuid, text);
drop function if exists public.review_staff_profile_candidate_v1(uuid, uuid, text, text, text, numeric, text);
drop function if exists public.refresh_all_staff_profile_intelligence_v1(uuid, uuid, timestamptz, timestamptz, integer);
drop function if exists public.process_staff_profile_learning_queue_v1(integer);
drop function if exists public.refresh_staff_profile_for_event_person_v1(uuid);

drop table if exists public.staff_profile_learning_runs cascade;
drop table if exists public.staff_profile_learning_queue cascade;
drop table if exists public.staff_profile_update_proposals cascade;
drop table if exists public.staff_profile_versions cascade;
drop table if exists public.staff_profile_match_decisions cascade;
drop table if exists public.staff_profile_observations cascade;
drop table if exists public.staff_profile_candidates cascade;

delete from public.monitoria_capability_registry where module = 'operational_profiles';

alter table public.camera_staff_profiles
  drop column if exists profile_status,
  drop column if exists profile_version,
  drop column if exists update_mode,
  drop column if exists habitual_zone_ids,
  drop column if exists habitual_action_codes,
  drop column if exists habitual_session_types,
  drop column if exists habitual_weekdays,
  drop column if exists shift_windows,
  drop column if exists recurring_appearance,
  drop column if exists observation_count,
  drop column if exists distinct_days_count,
  drop column if exists profile_confidence,
  drop column if exists last_observed_at,
  drop column if exists last_reviewed_at,
  drop column if exists last_reviewed_by,
  drop column if exists locked_fields,
  drop column if exists learning_metadata,
  drop column if exists retired_at;

alter table public.cameras
  drop column if exists staff_profile_intelligence_enabled,
  drop column if exists staff_profile_candidate_min_observations,
  drop column if exists staff_profile_candidate_min_days,
  drop column if exists staff_profile_candidate_retention_days,
  drop column if exists staff_profile_context_min_confidence,
  drop column if exists staff_profile_review_required;

commit;
