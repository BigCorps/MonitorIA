-- MonitorIA — rollback do Motor de Estados Visuais v1
-- Atenção: remove os dados de estados visuais criados após a implantação.

-- Restaura o perfil ativo que foi limpo pela migration principal.
update public.camera_profiles profile
set environment_description =
      entity.metadata #>> '{profileBackup,environmentDescription}',
    monitoring_goals =
      entity.metadata #> '{profileBackup,monitoringGoals}',
    profile_metadata =
      entity.metadata #> '{profileBackup,profileMetadata}',
    updated_at = now()
from public.camera_visual_entities entity
where entity.camera_profile_id = profile.id
  and entity.metadata->>'seed' = 'monitoria_visual_state_v1'
  and jsonb_typeof(entity.metadata->'profileBackup') = 'object';

drop trigger if exists trg_process_monitoria_visual_state_event
  on public.events;

drop function if exists private.process_monitoria_visual_state_event();
drop function if exists private.monitoria_after_confirmed_closing(uuid, timestamptz);
drop function if exists private.monitoria_is_outside_declared_hours(uuid, timestamptz);

drop function if exists public.assistant_visual_state_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
);

drop function if exists public.assistant_operating_hours_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
);

drop table if exists public.visual_state_reviews;
drop table if exists public.site_operating_sessions;
drop table if exists public.visual_state_transitions;
drop table if exists public.visual_entity_current_states;
drop table if exists public.visual_state_observations;
drop table if exists public.camera_visual_entities;

drop index if exists public.events_operational_context_idx;

alter table public.events
  drop column if exists outside_declared_hours,
  drop column if exists after_confirmed_closing;

alter table public.cameras
  drop column if exists visual_state_enabled;

alter table public.analysis_jobs
  drop column if exists prompt_hash;
