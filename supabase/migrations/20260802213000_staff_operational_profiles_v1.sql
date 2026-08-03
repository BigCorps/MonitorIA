-- MonitorIA — INT-6
-- Perfis operacionais de funcionários v1.
-- Requer INT-2, INT-3, INT-3.8 e INT-5.
-- Não usa reconhecimento facial, embeddings biométricos ou identidade civil automática.

begin;

do $$
begin
  if to_regclass('public.camera_staff_profiles') is null then
    raise exception 'monitoria_int_2_required';
  end if;
  if to_regclass('public.event_person_memory_links') is null then
    raise exception 'monitoria_int_2_person_links_required';
  end if;
  if to_regclass('public.operational_sessions') is null then
    raise exception 'monitoria_int_3_required';
  end if;
  if to_regclass('public.operational_insights') is null then
    raise exception 'monitoria_int_3_8_required';
  end if;
  if to_regclass('public.operational_process_instances') is null then
    raise exception 'monitoria_int_5_required';
  end if;
  if to_regprocedure('private.monitoria_appearance_similarity(jsonb,jsonb)') is null then
    raise exception 'monitoria_int_2_similarity_required';
  end if;
end
$$;

alter table public.cameras
  add column if not exists staff_profile_intelligence_enabled boolean not null default false,
  add column if not exists staff_profile_candidate_min_observations integer not null default 5,
  add column if not exists staff_profile_candidate_min_days integer not null default 2,
  add column if not exists staff_profile_candidate_retention_days integer not null default 30,
  add column if not exists staff_profile_context_min_confidence numeric(4,3) not null default 0.720,
  add column if not exists staff_profile_review_required boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cameras_staff_profile_candidate_observations_check') then
    alter table public.cameras add constraint cameras_staff_profile_candidate_observations_check
      check (staff_profile_candidate_min_observations between 2 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cameras_staff_profile_candidate_days_check') then
    alter table public.cameras add constraint cameras_staff_profile_candidate_days_check
      check (staff_profile_candidate_min_days between 1 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cameras_staff_profile_candidate_retention_check') then
    alter table public.cameras add constraint cameras_staff_profile_candidate_retention_check
      check (staff_profile_candidate_retention_days between 7 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cameras_staff_profile_context_confidence_check') then
    alter table public.cameras add constraint cameras_staff_profile_context_confidence_check
      check (staff_profile_context_min_confidence between 0.5 and 1);
  end if;
end
$$;

comment on column public.cameras.staff_profile_intelligence_enabled is
  'Ativa aprendizado conservador de perfis operacionais não biométricos nesta câmera.';
comment on column public.cameras.staff_profile_review_required is
  'Quando true, candidatos e alterações de perfil exigem revisão humana antes de se tornarem ativos.';

alter table public.camera_staff_profiles
  add column if not exists profile_status text not null default 'active',
  add column if not exists profile_version integer not null default 1,
  add column if not exists update_mode text not null default 'manual',
  add column if not exists habitual_zone_ids uuid[] not null default '{}',
  add column if not exists habitual_action_codes text[] not null default '{}',
  add column if not exists habitual_session_types text[] not null default '{}',
  add column if not exists habitual_weekdays smallint[] not null default '{}',
  add column if not exists shift_windows jsonb not null default '[]'::jsonb,
  add column if not exists recurring_appearance jsonb not null default '{}'::jsonb,
  add column if not exists observation_count integer not null default 0,
  add column if not exists distinct_days_count integer not null default 0,
  add column if not exists profile_confidence numeric(5,4) not null default 0,
  add column if not exists last_observed_at timestamptz null,
  add column if not exists last_reviewed_at timestamptz null,
  add column if not exists last_reviewed_by uuid null references auth.users(id) on delete set null,
  add column if not exists locked_fields text[] not null default '{}',
  add column if not exists learning_metadata jsonb not null default '{}'::jsonb,
  add column if not exists retired_at timestamptz null;

update public.camera_staff_profiles
set
  habitual_zone_ids = case when cardinality(habitual_zone_ids) = 0 then zone_ids else habitual_zone_ids end,
  recurring_appearance = case
    when recurring_appearance = '{}'::jsonb then appearance_signature
    else recurring_appearance
  end,
  last_reviewed_at = coalesce(last_reviewed_at, approved_at),
  last_reviewed_by = coalesce(last_reviewed_by, approved_by)
where true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_status_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_status_check_v1
      check (profile_status in ('active', 'paused', 'retired'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_version_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_version_check_v1
      check (profile_version >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_update_mode_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_update_mode_check_v1
      check (update_mode in ('manual', 'reviewed_learning'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_weekdays_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_weekdays_check_v1
      check (habitual_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_shift_windows_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_shift_windows_check_v1
      check (jsonb_typeof(shift_windows) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_recurring_appearance_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_recurring_appearance_check_v1
      check (jsonb_typeof(recurring_appearance) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_learning_metadata_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_learning_metadata_check_v1
      check (jsonb_typeof(learning_metadata) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_counts_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_counts_check_v1
      check (observation_count >= 0 and distinct_days_count >= 0 and distinct_days_count <= observation_count);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'camera_staff_profiles_profile_confidence_check_v1') then
    alter table public.camera_staff_profiles add constraint camera_staff_profiles_profile_confidence_check_v1
      check (profile_confidence between 0 and 1);
  end if;
end
$$;

create index if not exists camera_staff_profiles_learning_idx
  on public.camera_staff_profiles(camera_id, profile_status, update_mode, last_observed_at desc);

create table if not exists public.staff_profile_candidates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  status text not null default 'learning',
  suggested_label text not null,
  canonical_appearance jsonb not null default '{}'::jsonb,
  zone_ids uuid[] not null default '{}',
  action_codes text[] not null default '{}',
  session_types text[] not null default '{}',
  weekdays smallint[] not null default '{}',
  shift_windows jsonb not null default '[]'::jsonb,
  observation_count integer not null default 0,
  distinct_days_count integer not null default 0,
  confidence numeric(5,4) not null default 0,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  evidence_event_ids uuid[] not null default '{}',
  approved_profile_id uuid null references public.camera_staff_profiles(id) on delete set null,
  merged_into_candidate_id uuid null references public.staff_profile_candidates(id) on delete set null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  review_notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profile_candidates_status_check check (
    status in ('learning', 'pending_review', 'approved', 'rejected', 'expired', 'merged')
  ),
  constraint staff_profile_candidates_appearance_check check (jsonb_typeof(canonical_appearance) = 'object'),
  constraint staff_profile_candidates_weekdays_check check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  constraint staff_profile_candidates_shift_check check (jsonb_typeof(shift_windows) = 'array'),
  constraint staff_profile_candidates_counts_check check (
    observation_count >= 0 and distinct_days_count >= 0 and distinct_days_count <= observation_count
  ),
  constraint staff_profile_candidates_confidence_check check (confidence between 0 and 1),
  constraint staff_profile_candidates_time_check check (
    last_seen_at >= first_seen_at and expires_at >= last_seen_at
  ),
  constraint staff_profile_candidates_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists staff_profile_candidates_camera_status_idx
  on public.staff_profile_candidates(camera_id, status, last_seen_at desc);
create index if not exists staff_profile_candidates_expiry_idx
  on public.staff_profile_candidates(expires_at)
  where status in ('learning', 'pending_review');

create table if not exists public.staff_profile_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  staff_profile_id uuid null references public.camera_staff_profiles(id) on delete set null,
  candidate_id uuid null references public.staff_profile_candidates(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  event_person_id uuid not null references public.event_people(id) on delete cascade,
  person_instance_id uuid null references public.person_memory_instances(id) on delete set null,
  operational_session_id uuid null references public.operational_sessions(id) on delete set null,
  process_instance_id uuid null references public.operational_process_instances(id) on delete set null,
  observed_at timestamptz not null,
  local_date date not null,
  weekday smallint not null,
  local_minute integer not null,
  probable_role text not null default 'unknown',
  appearance jsonb not null default '{}'::jsonb,
  zone_ids uuid[] not null default '{}',
  action_codes text[] not null default '{}',
  session_types text[] not null default '{}',
  appearance_confidence numeric(5,4) not null default 0,
  source_confidence numeric(5,4) not null default 0,
  match_score numeric(5,4) not null default 0,
  decision_status text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint staff_profile_observations_target_check check (
    staff_profile_id is not null or candidate_id is not null or decision_status in ('ambiguous', 'ignored')
  ),
  constraint staff_profile_observations_weekday_check check (weekday between 0 and 6),
  constraint staff_profile_observations_minute_check check (local_minute between 0 and 1439),
  constraint staff_profile_observations_role_check check (
    probable_role in ('staff', 'customer', 'delivery_person', 'visitor', 'unknown')
  ),
  constraint staff_profile_observations_scores_check check (
    appearance_confidence between 0 and 1 and source_confidence between 0 and 1 and match_score between 0 and 1
  ),
  constraint staff_profile_observations_decision_check check (
    decision_status in ('profile_match', 'candidate_match', 'candidate_created', 'ambiguous', 'ignored')
  ),
  constraint staff_profile_observations_appearance_check check (jsonb_typeof(appearance) = 'object'),
  constraint staff_profile_observations_evidence_check check (jsonb_typeof(evidence) = 'object')
);

create unique index if not exists staff_profile_observations_event_person_uidx
  on public.staff_profile_observations(event_person_id);
create index if not exists staff_profile_observations_profile_time_idx
  on public.staff_profile_observations(staff_profile_id, observed_at desc)
  where staff_profile_id is not null;
create index if not exists staff_profile_observations_candidate_time_idx
  on public.staff_profile_observations(candidate_id, observed_at desc)
  where candidate_id is not null;

create table if not exists public.staff_profile_match_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_person_id uuid not null references public.event_people(id) on delete cascade,
  person_instance_id uuid null references public.person_memory_instances(id) on delete set null,
  staff_profile_id uuid null references public.camera_staff_profiles(id) on delete set null,
  candidate_id uuid null references public.staff_profile_candidates(id) on delete set null,
  decision text not null,
  review_status text not null default 'not_required',
  appearance_score numeric(5,4) not null default 0,
  zone_score numeric(5,4) not null default 0,
  action_score numeric(5,4) not null default 0,
  schedule_score numeric(5,4) not null default 0,
  source_score numeric(5,4) not null default 0,
  total_score numeric(5,4) not null default 0,
  reasons jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profile_match_decisions_decision_check check (
    decision in ('matched', 'candidate', 'review_required', 'unknown', 'not_staff')
  ),
  constraint staff_profile_match_decisions_review_check check (
    review_status in ('not_required', 'pending', 'confirmed', 'reassigned', 'rejected', 'not_staff', 'uncertain')
  ),
  constraint staff_profile_match_decisions_scores_check check (
    appearance_score between 0 and 1 and zone_score between 0 and 1
    and action_score between 0 and 1 and schedule_score between 0 and 1
    and source_score between 0 and 1 and total_score between 0 and 1
  ),
  constraint staff_profile_match_decisions_reasons_check check (jsonb_typeof(reasons) = 'object')
);

create unique index if not exists staff_profile_match_decisions_person_uidx
  on public.staff_profile_match_decisions(event_person_id);
create index if not exists staff_profile_match_decisions_review_idx
  on public.staff_profile_match_decisions(organization_id, review_status, observed_at desc);

create table if not exists public.staff_profile_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  staff_profile_id uuid not null references public.camera_staff_profiles(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  change_source text not null,
  change_summary text not null default '',
  source_candidate_id uuid null references public.staff_profile_candidates(id) on delete set null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint staff_profile_versions_version_check check (version >= 1),
  constraint staff_profile_versions_snapshot_check check (jsonb_typeof(snapshot) = 'object'),
  constraint staff_profile_versions_source_check check (
    change_source in ('migration', 'candidate_approval', 'manual_edit', 'learning_proposal', 'restore')
  )
);

create unique index if not exists staff_profile_versions_profile_version_uidx
  on public.staff_profile_versions(staff_profile_id, version);
create index if not exists staff_profile_versions_profile_time_idx
  on public.staff_profile_versions(staff_profile_id, created_at desc);

create table if not exists public.staff_profile_update_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  staff_profile_id uuid not null references public.camera_staff_profiles(id) on delete cascade,
  base_version integer not null,
  status text not null default 'pending',
  proposed_zone_ids uuid[] not null default '{}',
  proposed_action_codes text[] not null default '{}',
  proposed_session_types text[] not null default '{}',
  proposed_weekdays smallint[] not null default '{}',
  proposed_shift_windows jsonb not null default '[]'::jsonb,
  proposed_recurring_appearance jsonb not null default '{}'::jsonb,
  observation_count integer not null default 0,
  distinct_days_count integer not null default 0,
  confidence numeric(5,4) not null default 0,
  reason text not null,
  evidence_event_ids uuid[] not null default '{}',
  valid_until timestamptz not null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profile_update_proposals_status_check check (
    status in ('pending', 'applied', 'rejected', 'expired')
  ),
  constraint staff_profile_update_proposals_weekdays_check check (
    proposed_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint staff_profile_update_proposals_shift_check check (
    jsonb_typeof(proposed_shift_windows) = 'array'
  ),
  constraint staff_profile_update_proposals_appearance_check check (
    jsonb_typeof(proposed_recurring_appearance) = 'object'
  ),
  constraint staff_profile_update_proposals_counts_check check (
    observation_count >= 0 and distinct_days_count >= 0 and distinct_days_count <= observation_count
  ),
  constraint staff_profile_update_proposals_confidence_check check (confidence between 0 and 1),
  constraint staff_profile_update_proposals_time_check check (valid_until >= created_at)
);

create unique index if not exists staff_profile_update_proposals_pending_uidx
  on public.staff_profile_update_proposals(staff_profile_id)
  where status = 'pending';
create index if not exists staff_profile_update_proposals_org_status_idx
  on public.staff_profile_update_proposals(organization_id, status, created_at desc);

create table if not exists public.staff_profile_learning_queue (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_person_id uuid not null references public.event_people(id) on delete cascade,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  processing_started_at timestamptz null,
  processed_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staff_profile_learning_queue_status_check check (
    status in ('queued', 'processing', 'completed', 'failed', 'ignored')
  ),
  constraint staff_profile_learning_queue_attempt_check check (attempt_count >= 0)
);

create unique index if not exists staff_profile_learning_queue_person_uidx
  on public.staff_profile_learning_queue(event_person_id);
create index if not exists staff_profile_learning_queue_ready_idx
  on public.staff_profile_learning_queue(status, available_at, id)
  where status in ('queued', 'failed');

create table if not exists public.staff_profile_learning_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  camera_id uuid null references public.cameras(id) on delete cascade,
  mode text not null,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  queued_count integer not null default 0,
  processed_count integer not null default 0,
  failed_count integer not null default 0,
  candidate_count integer not null default 0,
  proposal_count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  constraint staff_profile_learning_runs_mode_check check (mode in ('queue', 'full')),
  constraint staff_profile_learning_runs_status_check check (status in ('running', 'completed', 'failed')),
  constraint staff_profile_learning_runs_counts_check check (
    queued_count >= 0 and processed_count >= 0 and failed_count >= 0
    and candidate_count >= 0 and proposal_count >= 0
  ),
  constraint staff_profile_learning_runs_details_check check (jsonb_typeof(details) = 'object')
);

-- Novas tabelas são administrativas. Membros comuns recebem apenas resumos pelas RPCs.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'staff_profile_candidates',
    'staff_profile_observations',
    'staff_profile_match_decisions',
    'staff_profile_versions',
    'staff_profile_update_proposals',
    'staff_profile_learning_queue',
    'staff_profile_learning_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_select_admin', v_table);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.has_org_role(organization_id, array[''owner''::public.organization_role, ''admin''::public.organization_role]))',
      v_table || '_select_admin', v_table
    );
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('grant all on public.%I to service_role', v_table);
  end loop;
end
$$;

do $$
begin
  if to_regclass('public.staff_profile_learning_queue_id_seq') is not null then
    grant usage, select on sequence public.staff_profile_learning_queue_id_seq to service_role;
  end if;
end
$$;


-- Funções auxiliares.
create or replace function private.staff_uuid_array_overlap_score_v1(
  p_left uuid[],
  p_right uuid[]
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when cardinality(coalesce(p_left, '{}'::uuid[])) = 0
      or cardinality(coalesce(p_right, '{}'::uuid[])) = 0 then 0.5
    else greatest(0, least(1,
      (
        select count(distinct item)::numeric
        from pg_catalog.unnest(p_left) item
        where item = any(p_right)
      ) / greatest(1, least(cardinality(p_left), cardinality(p_right)))::numeric
    ))
  end;
$$;

create or replace function private.staff_text_array_overlap_score_v1(
  p_left text[],
  p_right text[]
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when cardinality(coalesce(p_left, '{}'::text[])) = 0
      or cardinality(coalesce(p_right, '{}'::text[])) = 0 then 0.5
    else greatest(0, least(1,
      (
        select count(distinct lower(trim(item)))::numeric
        from pg_catalog.unnest(p_left) item
        where lower(trim(item)) = any(
          select lower(trim(other_item)) from pg_catalog.unnest(p_right) other_item
        )
      ) / greatest(1, least(cardinality(p_left), cardinality(p_right)))::numeric
    ))
  end;
$$;

create or replace function private.staff_schedule_score_v1(
  p_weekdays smallint[],
  p_shift_windows jsonb,
  p_weekday smallint,
  p_local_minute integer
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_window jsonb;
  v_start integer;
  v_end integer;
  v_distance integer;
begin
  if cardinality(coalesce(p_weekdays, '{}'::smallint[])) > 0
     and not p_weekday = any(p_weekdays) then
    return 0;
  end if;

  if jsonb_typeof(coalesce(p_shift_windows, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(p_shift_windows, '[]'::jsonb)) = 0 then
    return case when cardinality(coalesce(p_weekdays, '{}'::smallint[])) = 0 then 0.5 else 0.75 end;
  end if;

  for v_window in select value from jsonb_array_elements(p_shift_windows)
  loop
    if coalesce((v_window->>'weekday')::integer, -1) <> p_weekday then
      continue;
    end if;
    v_start := greatest(0, least(1439, coalesce((v_window->>'startMinute')::integer, 0)));
    v_end := greatest(0, least(1439, coalesce((v_window->>'endMinute')::integer, 1439)));

    if p_local_minute between v_start and v_end then
      return 1;
    end if;

    v_distance := least(abs(p_local_minute - v_start), abs(p_local_minute - v_end));
    if v_distance <= 60 then return 0.75; end if;
    if v_distance <= 120 then return 0.5; end if;
  end loop;

  return 0;
end;
$$;

create or replace function private.staff_profile_snapshot_v1(
  p_profile_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', profile.id,
    'cameraId', profile.camera_id,
    'label', profile.label,
    'description', profile.description,
    'appearanceSignature', profile.appearance_signature,
    'zoneIds', profile.zone_ids,
    'minSimilarity', profile.min_similarity,
    'enabled', profile.enabled,
    'profileStatus', profile.profile_status,
    'profileVersion', profile.profile_version,
    'updateMode', profile.update_mode,
    'habitualZoneIds', profile.habitual_zone_ids,
    'habitualActionCodes', profile.habitual_action_codes,
    'habitualSessionTypes', profile.habitual_session_types,
    'habitualWeekdays', profile.habitual_weekdays,
    'shiftWindows', profile.shift_windows,
    'recurringAppearance', profile.recurring_appearance,
    'observationCount', profile.observation_count,
    'distinctDaysCount', profile.distinct_days_count,
    'profileConfidence', profile.profile_confidence,
    'lastObservedAt', profile.last_observed_at,
    'lockedFields', profile.locked_fields,
    'learningMetadata', profile.learning_metadata
  )
  from public.camera_staff_profiles profile
  where profile.id = p_profile_id;
$$;

create or replace function private.staff_profile_shift_windows_v1(
  p_profile_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with grouped as (
    select
      observation.weekday,
      percentile_cont(0.10) within group (order by observation.local_minute)::integer as start_minute,
      percentile_cont(0.50) within group (order by observation.local_minute)::integer as median_minute,
      percentile_cont(0.90) within group (order by observation.local_minute)::integer as end_minute,
      count(*)::integer as observations
    from public.staff_profile_observations observation
    where observation.staff_profile_id = p_profile_id
      and observation.decision_status = 'profile_match'
    group by observation.weekday
    having count(*) >= 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', weekday,
        'startMinute', start_minute,
        'medianMinute', median_minute,
        'endMinute', end_minute,
        'observations', observations
      ) order by weekday
    ),
    '[]'::jsonb
  )
  from grouped;
$$;

create or replace function private.staff_profile_recurring_appearance_v1(
  p_profile_id uuid
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_key text;
  v_value text;
  v_features jsonb := '[]'::jsonb;
begin
  foreach v_key in array array[
    'upperClothingColor',
    'lowerClothingColor',
    'upperClothingType',
    'lowerClothingType',
    'hairColor',
    'hairLength',
    'facialHair',
    'eyewear',
    'bodyBuild',
    'headwear'
  ]
  loop
    select normalized_value into v_value
    from (
      select
        private.monitoria_normalized_appearance_value(observation.appearance, v_key) as normalized_value,
        count(*) as occurrences
      from public.staff_profile_observations observation
      where observation.staff_profile_id = p_profile_id
        and observation.decision_status = 'profile_match'
      group by private.monitoria_normalized_appearance_value(observation.appearance, v_key)
    ) frequency
    where normalized_value is not null
    order by occurrences desc, normalized_value
    limit 1;

    if v_value is not null then
      v_result := v_result || jsonb_build_object(v_key, v_value);
    end if;
  end loop;

  with features as (
    select lower(trim(feature)) as feature, count(*) as occurrences
    from public.staff_profile_observations observation,
      lateral jsonb_array_elements_text(
        case
          when jsonb_typeof(observation.appearance->'distinctiveVisibleFeatures') = 'array'
            then observation.appearance->'distinctiveVisibleFeatures'
          else '[]'::jsonb
        end
      ) feature
    where observation.staff_profile_id = p_profile_id
      and observation.decision_status = 'profile_match'
      and nullif(trim(feature), '') is not null
    group by lower(trim(feature))
    having count(*) >= 2
    order by occurrences desc, feature
    limit 8
  )
  select coalesce(jsonb_agg(feature), '[]'::jsonb) into v_features from features;

  if jsonb_array_length(v_features) > 0 then
    v_result := v_result || jsonb_build_object('distinctiveVisibleFeatures', v_features);
  end if;

  return v_result;
end;
$$;

create or replace function private.enqueue_staff_profile_event_person_v1(
  p_event_person_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select
    person.id as event_person_id,
    event.id as event_id,
    event.organization_id,
    event.camera_id
  into v_row
  from public.event_people person
  join public.events event on event.id = person.event_id
  where person.id = p_event_person_id
    and event.deleted_at is null;

  if not found then return; end if;

  insert into public.staff_profile_learning_queue(
    organization_id, camera_id, event_id, event_person_id, status, available_at, updated_at
  ) values (
    v_row.organization_id, v_row.camera_id, v_row.event_id, v_row.event_person_id, 'queued', now(), now()
  )
  on conflict (event_person_id) do update set
    status = case
      when public.staff_profile_learning_queue.status = 'processing' then 'processing'
      else 'queued'
    end,
    available_at = now(),
    last_error = null,
    updated_at = now();
end;
$$;

create or replace function private.enqueue_staff_profile_from_person_link_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_staff_profile_event_person_v1(new.event_person_id);
  return new;
end;
$$;

drop trigger if exists event_person_memory_links_enqueue_staff_profile on public.event_person_memory_links;
create trigger event_person_memory_links_enqueue_staff_profile
after insert or update of staff_profile_id, person_instance_id, reasoning
on public.event_person_memory_links
for each row execute function private.enqueue_staff_profile_from_person_link_v1();

create or replace function private.enqueue_staff_profile_from_session_event_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
begin
  for v_person in
    select person.id
    from public.event_people person
    where person.event_id = new.event_id
  loop
    perform private.enqueue_staff_profile_event_person_v1(v_person.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists operational_session_events_enqueue_staff_profile on public.operational_session_events;
create trigger operational_session_events_enqueue_staff_profile
after insert or update of chapter_type, confidence, signal_summary
on public.operational_session_events
for each row execute function private.enqueue_staff_profile_from_session_event_v1();

create or replace function private.enqueue_staff_profile_from_process_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
begin
  for v_person in
    select distinct person.id
    from public.operational_session_events chapter
    join public.event_people person on person.event_id = chapter.event_id
    where chapter.session_id = new.operational_session_id
  loop
    perform private.enqueue_staff_profile_event_person_v1(v_person.id);
  end loop;
  return new;
end;
$$;

drop trigger if exists operational_process_instances_enqueue_staff_profile on public.operational_process_instances;
create trigger operational_process_instances_enqueue_staff_profile
after insert or update of status, result_code, confidence
on public.operational_process_instances
for each row execute function private.enqueue_staff_profile_from_process_v1();

create or replace function private.build_staff_profile_update_proposal_v1(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_camera record;
  v_site_id uuid;
  v_observation_count integer;
  v_days integer;
  v_confidence numeric;
  v_zone_ids uuid[];
  v_actions text[];
  v_session_types text[];
  v_weekdays smallint[];
  v_shift_windows jsonb;
  v_appearance jsonb;
  v_evidence uuid[];
  v_proposal_id uuid;
begin
  select * into v_profile
  from public.camera_staff_profiles
  where id = p_profile_id
  for update;

  if not found or v_profile.profile_status <> 'active' or v_profile.update_mode <> 'reviewed_learning' then
    return null;
  end if;

  select camera.*, camera.site_id into v_camera
  from public.cameras camera
  where camera.id = v_profile.camera_id;
  v_site_id := v_camera.site_id;

  select
    count(*)::integer,
    count(distinct observation.local_date)::integer,
    coalesce(avg(observation.match_score), 0),
    coalesce(array_agg(distinct observation.weekday), '{}'::smallint[]),
    coalesce(array_agg(distinct observation.event_id) filter (where observation.event_id is not null), '{}'::uuid[])
  into
    v_observation_count, v_days, v_confidence, v_weekdays, v_evidence
  from public.staff_profile_observations observation
  where observation.staff_profile_id = p_profile_id
    and observation.decision_status = 'profile_match'
    and observation.observed_at >= coalesce(v_profile.last_reviewed_at, '-infinity'::timestamptz);

  select coalesce(array_agg(distinct zone_id), '{}'::uuid[])
  into v_zone_ids
  from public.staff_profile_observations observation,
    lateral unnest(observation.zone_ids) zone_id
  where observation.staff_profile_id = p_profile_id
    and observation.decision_status = 'profile_match'
    and observation.observed_at >= coalesce(v_profile.last_reviewed_at, '-infinity'::timestamptz);

  select coalesce(array_agg(distinct action_code), '{}'::text[])
  into v_actions
  from public.staff_profile_observations observation,
    lateral unnest(observation.action_codes) action_code
  where observation.staff_profile_id = p_profile_id
    and observation.decision_status = 'profile_match'
    and observation.observed_at >= coalesce(v_profile.last_reviewed_at, '-infinity'::timestamptz);

  select coalesce(array_agg(distinct session_type), '{}'::text[])
  into v_session_types
  from public.staff_profile_observations observation,
    lateral unnest(observation.session_types) session_type
  where observation.staff_profile_id = p_profile_id
    and observation.decision_status = 'profile_match'
    and observation.observed_at >= coalesce(v_profile.last_reviewed_at, '-infinity'::timestamptz);

  if v_observation_count < v_camera.staff_profile_candidate_min_observations
     or v_days < v_camera.staff_profile_candidate_min_days then
    return null;
  end if;

  if exists (
    select 1 from public.staff_profile_update_proposals
    where staff_profile_id = p_profile_id and status = 'pending'
  ) then
    return null;
  end if;

  v_shift_windows := private.staff_profile_shift_windows_v1(p_profile_id);
  v_appearance := private.staff_profile_recurring_appearance_v1(p_profile_id);

  insert into public.staff_profile_update_proposals(
    organization_id, site_id, camera_id, staff_profile_id, base_version,
    proposed_zone_ids, proposed_action_codes, proposed_session_types,
    proposed_weekdays, proposed_shift_windows, proposed_recurring_appearance,
    observation_count, distinct_days_count, confidence, reason,
    evidence_event_ids, valid_until
  ) values (
    v_profile.organization_id, v_site_id, v_profile.camera_id, p_profile_id, v_profile.profile_version,
    v_zone_ids, v_actions, v_session_types, v_weekdays, v_shift_windows, v_appearance,
    v_observation_count, v_days, greatest(0, least(1, v_confidence)),
    format('%s observações em %s dias sugerem atualização dos padrões operacionais.', v_observation_count, v_days),
    v_evidence[1:20], now() + interval '30 days'
  ) returning id into v_proposal_id;

  return v_proposal_id;
end;
$$;

create or replace function private.staff_candidate_shift_windows_v1(
  p_candidate_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with grouped as (
    select
      observation.weekday,
      percentile_cont(0.10) within group (order by observation.local_minute)::integer as start_minute,
      percentile_cont(0.50) within group (order by observation.local_minute)::integer as median_minute,
      percentile_cont(0.90) within group (order by observation.local_minute)::integer as end_minute,
      count(*)::integer as observations
    from public.staff_profile_observations observation
    where observation.candidate_id = p_candidate_id
      and observation.decision_status in ('candidate_match', 'candidate_created')
    group by observation.weekday
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'weekday', weekday,
        'startMinute', start_minute,
        'medianMinute', median_minute,
        'endMinute', end_minute,
        'observations', observations
      ) order by weekday
    ),
    '[]'::jsonb
  )
  from grouped;
$$;

create or replace function public.refresh_staff_profile_for_event_person_v1(
  p_event_person_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person record;
  v_event record;
  v_camera record;
  v_site record;
  v_link record;
  v_instance record;
  v_session record;
  v_process record;
  v_actions text[] := '{}';
  v_session_types text[] := '{}';
  v_local_timestamp timestamp;
  v_local_date date;
  v_weekday smallint;
  v_local_minute integer;
  v_role text := 'unknown';
  v_source_score numeric := 0;
  v_best_profile record;
  v_existing_profile_id uuid;
  v_threshold numeric;
  v_decision text;
  v_review_status text;
  v_candidate_id uuid;
  v_candidate_status text;
  v_candidate_similarity numeric := 0;
  v_candidate_zone_score numeric := 0;
  v_candidate_schedule_score numeric := 0;
  v_observation_status text;
  v_decision_id uuid;
  v_observation_id uuid;
  v_proposal_id uuid;
  v_reason_items jsonb;
begin
  select person.* into v_person
  from public.event_people person
  where person.id = p_event_person_id;
  if not found then return jsonb_build_object('status', 'ignored', 'reason', 'event_person_not_found'); end if;

  select event.* into v_event
  from public.events event
  where event.id = v_person.event_id and event.deleted_at is null;
  if not found then return jsonb_build_object('status', 'ignored', 'reason', 'event_not_found'); end if;

  select camera.* into v_camera
  from public.cameras camera
  where camera.id = v_event.camera_id;
  if not found or not v_camera.staff_profile_intelligence_enabled then
    return jsonb_build_object('status', 'ignored', 'reason', 'camera_feature_disabled');
  end if;

  select site.* into v_site from public.sites site where site.id = v_event.site_id;

  select link.* into v_link
  from public.event_person_memory_links link
  where link.event_person_id = p_event_person_id;

  if found then
    v_existing_profile_id := v_link.staff_profile_id;
    select instance.* into v_instance
    from public.person_memory_instances instance
    where instance.id = v_link.person_instance_id;
  end if;

  if v_event.operational_session_id is not null then
    select session.* into v_session
    from public.operational_sessions session
    where session.id = v_event.operational_session_id;

    select coalesce(array_agg(distinct chapter.chapter_type), '{}') into v_actions
    from public.operational_session_events chapter
    where chapter.session_id = v_event.operational_session_id;

    if v_session.id is not null then
      v_session_types := array[v_session.session_type];
    end if;

    select process.* into v_process
    from public.operational_process_instances process
    where process.operational_session_id = v_event.operational_session_id;
  end if;

  v_local_timestamp := v_event.started_at at time zone coalesce(v_site.timezone, 'UTC');
  v_local_date := v_local_timestamp::date;
  v_weekday := extract(dow from v_local_timestamp)::smallint;
  v_local_minute := extract(hour from v_local_timestamp)::integer * 60
    + extract(minute from v_local_timestamp)::integer;

  v_role := coalesce(nullif(v_instance.probable_role, ''), nullif(v_person.role, ''), 'unknown');
  if v_existing_profile_id is not null then v_role := 'staff'; end if;

  v_source_score := greatest(
    coalesce(v_person.role_confidence, 0),
    coalesce(v_person.appearance_confidence, 0),
    coalesce(v_link.continuity_score, 0),
    coalesce(v_instance.appearance_confidence, 0)
  );

  select candidate_profile.* into v_best_profile
  from (
    select
      profile.*,
      scores.appearance_score,
      scores.zone_score,
      scores.action_score,
      scores.schedule_score,
      greatest(0, least(1,
        scores.appearance_score * 0.55
        + scores.zone_score * 0.15
        + scores.action_score * 0.10
        + scores.schedule_score * 0.10
        + v_source_score * 0.10
      )) as total_score
    from public.camera_staff_profiles profile
    cross join lateral (
      select
        private.monitoria_appearance_similarity(
          v_person.appearance,
          case
            when profile.recurring_appearance <> '{}'::jsonb then profile.recurring_appearance
            else profile.appearance_signature
          end
        ) as appearance_score,
        private.staff_uuid_array_overlap_score_v1(
          v_person.zone_ids,
          case when cardinality(profile.habitual_zone_ids) > 0 then profile.habitual_zone_ids else profile.zone_ids end
        ) as zone_score,
        private.staff_text_array_overlap_score_v1(v_actions, profile.habitual_action_codes) as action_score,
        private.staff_schedule_score_v1(
          profile.habitual_weekdays,
          profile.shift_windows,
          v_weekday,
          v_local_minute
        ) as schedule_score
    ) scores
    where profile.organization_id = v_event.organization_id
      and profile.camera_id = v_event.camera_id
      and profile.enabled
      and profile.profile_status = 'active'
  ) candidate_profile
  order by candidate_profile.total_score desc, candidate_profile.appearance_score desc, candidate_profile.sort_order
  limit 1;

  if v_role <> 'staff'
     and v_existing_profile_id is null
     and coalesce(v_best_profile.appearance_score, 0) < 0.80 then
    v_decision := 'not_staff';
    v_review_status := 'not_required';
    v_observation_status := 'ignored';
  elsif v_best_profile.id is not null then
    v_threshold := greatest(v_camera.staff_profile_context_min_confidence, v_best_profile.min_similarity);

    if v_existing_profile_id is not null and v_existing_profile_id <> v_best_profile.id then
      v_decision := 'review_required';
      v_review_status := 'pending';
      v_observation_status := 'ambiguous';
    elsif v_best_profile.total_score >= v_threshold then
      if v_camera.staff_profile_review_required and v_best_profile.total_score < v_threshold + 0.06 then
        v_decision := 'review_required';
        v_review_status := 'pending';
        v_observation_status := 'ambiguous';
      else
        v_decision := 'matched';
        v_review_status := 'not_required';
        v_observation_status := 'profile_match';
      end if;
    elsif v_best_profile.total_score >= v_threshold - 0.08
       and v_best_profile.appearance_score >= 0.55 then
      v_decision := 'review_required';
      v_review_status := 'pending';
      v_observation_status := 'ambiguous';
    else
      v_decision := 'candidate';
      v_review_status := 'not_required';
      v_observation_status := 'candidate_created';
    end if;
  else
    v_decision := 'candidate';
    v_review_status := 'not_required';
    v_observation_status := 'candidate_created';
  end if;

  if v_decision = 'candidate' then
    select
      candidate.id,
      private.monitoria_appearance_similarity(v_person.appearance, candidate.canonical_appearance),
      private.staff_uuid_array_overlap_score_v1(v_person.zone_ids, candidate.zone_ids),
      private.staff_schedule_score_v1(candidate.weekdays, candidate.shift_windows, v_weekday, v_local_minute)
    into v_candidate_id, v_candidate_similarity, v_candidate_zone_score, v_candidate_schedule_score
    from public.staff_profile_candidates candidate
    where candidate.organization_id = v_event.organization_id
      and candidate.camera_id = v_event.camera_id
      and candidate.status in ('learning', 'pending_review')
      and candidate.expires_at > now()
      and private.monitoria_appearance_similarity(v_person.appearance, candidate.canonical_appearance)
        >= greatest(0.60, v_camera.staff_profile_context_min_confidence - 0.12)
    order by
      private.monitoria_appearance_similarity(v_person.appearance, candidate.canonical_appearance) desc,
      candidate.last_seen_at desc
    limit 1;

    if v_candidate_id is null then
      insert into public.staff_profile_candidates(
        organization_id, site_id, camera_id, status, suggested_label,
        canonical_appearance, zone_ids, action_codes, session_types, weekdays,
        observation_count, distinct_days_count, confidence,
        first_seen_at, last_seen_at, expires_at, evidence_event_ids, metadata
      ) values (
        v_event.organization_id, v_event.site_id, v_event.camera_id, 'learning',
        'Perfil operacional provável ' || (
          1 + (select count(*) from public.staff_profile_candidates candidate where candidate.camera_id = v_event.camera_id)
        ),
        coalesce(v_person.appearance, '{}'::jsonb),
        coalesce(v_person.zone_ids, '{}'),
        coalesce(v_actions, '{}'),
        coalesce(v_session_types, '{}'),
        array[v_weekday],
        0, 0, greatest(0, least(1, v_source_score)),
        v_event.started_at, v_event.started_at,
        v_event.started_at + make_interval(days => v_camera.staff_profile_candidate_retention_days),
        array[v_event.id],
        jsonb_build_object('createdFromEventPersonId', p_event_person_id)
      ) returning id into v_candidate_id;
      v_observation_status := 'candidate_created';
      v_candidate_similarity := greatest(0, least(1, coalesce(v_person.appearance_confidence, 0)));
    else
      v_observation_status := 'candidate_match';
      update public.staff_profile_candidates candidate set
        canonical_appearance = case
          when coalesce(v_person.appearance_confidence, 0) > candidate.confidence then v_person.appearance
          else candidate.canonical_appearance
        end,
        zone_ids = array(select distinct item from unnest(candidate.zone_ids || coalesce(v_person.zone_ids, '{}')) item),
        action_codes = array(select distinct item from unnest(candidate.action_codes || coalesce(v_actions, '{}')) item),
        session_types = array(select distinct item from unnest(candidate.session_types || coalesce(v_session_types, '{}')) item),
        weekdays = array(select distinct item from unnest(candidate.weekdays || array[v_weekday]) item)::smallint[],
        last_seen_at = greatest(candidate.last_seen_at, v_event.started_at),
        expires_at = greatest(candidate.expires_at, v_event.started_at + make_interval(days => v_camera.staff_profile_candidate_retention_days)),
        evidence_event_ids = (array(select distinct item from unnest(candidate.evidence_event_ids || array[v_event.id]) item))[1:20],
        confidence = greatest(0, least(1, (candidate.confidence * greatest(candidate.observation_count, 1) + v_candidate_similarity) / (greatest(candidate.observation_count, 1) + 1))),
        updated_at = now()
      where candidate.id = v_candidate_id;
    end if;
  end if;

  v_reason_items := jsonb_build_array(
    format('aparência não biométrica: %s%%', round(coalesce(v_best_profile.appearance_score, v_candidate_similarity, 0) * 100)),
    format('compatibilidade de zona: %s%%', round(coalesce(v_best_profile.zone_score, v_candidate_zone_score, 0) * 100)),
    format('compatibilidade de ação: %s%%', round(coalesce(v_best_profile.action_score, 0) * 100)),
    format('compatibilidade de horário: %s%%', round(coalesce(v_best_profile.schedule_score, v_candidate_schedule_score, 0) * 100)),
    'A correspondência é operacional e probabilística; não confirma identidade.'
  );

  insert into public.staff_profile_match_decisions(
    organization_id, site_id, camera_id, event_id, event_person_id,
    person_instance_id, staff_profile_id, candidate_id, decision, review_status,
    appearance_score, zone_score, action_score, schedule_score, source_score,
    total_score, reasons, observed_at, updated_at
  ) values (
    v_event.organization_id, v_event.site_id, v_event.camera_id, v_event.id, p_event_person_id,
    v_link.person_instance_id,
    case when v_decision in ('matched', 'review_required') then v_best_profile.id else null end,
    v_candidate_id, v_decision, v_review_status,
    coalesce(v_best_profile.appearance_score, v_candidate_similarity, 0),
    coalesce(v_best_profile.zone_score, v_candidate_zone_score, 0),
    coalesce(v_best_profile.action_score, 0),
    coalesce(v_best_profile.schedule_score, v_candidate_schedule_score, 0),
    v_source_score,
    case
      when v_best_profile.id is not null then coalesce(v_best_profile.total_score, 0)
      else greatest(0, least(1, v_candidate_similarity * 0.7 + v_candidate_zone_score * 0.15 + v_candidate_schedule_score * 0.15))
    end,
    jsonb_build_object('items', v_reason_items),
    v_event.started_at, now()
  )
  on conflict (event_person_id) do update set
    staff_profile_id = excluded.staff_profile_id,
    candidate_id = excluded.candidate_id,
    decision = excluded.decision,
    review_status = case
      when public.staff_profile_match_decisions.review_status in ('confirmed', 'reassigned', 'not_staff')
        then public.staff_profile_match_decisions.review_status
      else excluded.review_status
    end,
    appearance_score = excluded.appearance_score,
    zone_score = excluded.zone_score,
    action_score = excluded.action_score,
    schedule_score = excluded.schedule_score,
    source_score = excluded.source_score,
    total_score = excluded.total_score,
    reasons = excluded.reasons,
    observed_at = excluded.observed_at,
    updated_at = now()
  returning id into v_decision_id;

  insert into public.staff_profile_observations(
    organization_id, site_id, camera_id, staff_profile_id, candidate_id,
    event_id, event_person_id, person_instance_id, operational_session_id,
    process_instance_id, observed_at, local_date, weekday, local_minute,
    probable_role, appearance, zone_ids, action_codes, session_types,
    appearance_confidence, source_confidence, match_score, decision_status, evidence
  ) values (
    v_event.organization_id, v_event.site_id, v_event.camera_id,
    case when v_observation_status = 'profile_match' then v_best_profile.id else null end,
    v_candidate_id,
    v_event.id, p_event_person_id, v_link.person_instance_id, v_event.operational_session_id,
    v_process.id, v_event.started_at, v_local_date, v_weekday, v_local_minute,
    v_role, coalesce(v_person.appearance, '{}'::jsonb), coalesce(v_person.zone_ids, '{}'),
    coalesce(v_actions, '{}'), coalesce(v_session_types, '{}'),
    coalesce(v_person.appearance_confidence, 0), v_source_score,
    case when v_best_profile.id is not null then coalesce(v_best_profile.total_score, 0) else v_candidate_similarity end,
    v_observation_status,
    jsonb_build_object('decisionId', v_decision_id, 'processCode', v_process.process_code)
  )
  on conflict (event_person_id) do update set
    staff_profile_id = excluded.staff_profile_id,
    candidate_id = excluded.candidate_id,
    operational_session_id = excluded.operational_session_id,
    process_instance_id = excluded.process_instance_id,
    action_codes = excluded.action_codes,
    session_types = excluded.session_types,
    match_score = excluded.match_score,
    decision_status = excluded.decision_status,
    evidence = excluded.evidence
  returning id into v_observation_id;

  if v_observation_status = 'profile_match' and v_best_profile.id is not null then
    update public.event_person_memory_links set
      staff_profile_id = v_best_profile.id,
      link_kind = 'staff_profile_continuation',
      reasoning = coalesce(reasoning, '{}'::jsonb) || jsonb_build_object(
        'int6DecisionId', v_decision_id,
        'contextScore', v_best_profile.total_score,
        'contextualMatch', true
      )
    where event_person_id = p_event_person_id
      and (staff_profile_id is null or staff_profile_id = v_best_profile.id);

    update public.person_memory_instances set
      staff_profile_id = v_best_profile.id,
      probable_role = 'staff',
      updated_at = now()
    where id = v_link.person_instance_id
      and (staff_profile_id is null or staff_profile_id = v_best_profile.id);

    update public.operational_session_participants set
      staff_profile_id = v_best_profile.id,
      participant_role = 'staff',
      updated_at = now()
    where session_id = v_event.operational_session_id
      and person_instance_id = v_link.person_instance_id
      and (staff_profile_id is null or staff_profile_id = v_best_profile.id);

    update public.camera_staff_profiles profile set
      observation_count = aggregate.observation_count,
      distinct_days_count = aggregate.distinct_days_count,
      profile_confidence = aggregate.profile_confidence,
      last_observed_at = aggregate.last_observed_at,
      learning_metadata = coalesce(profile.learning_metadata, '{}'::jsonb) || jsonb_build_object(
        'lastDecisionId', v_decision_id,
        'lastObservationId', v_observation_id
      ),
      updated_at = now()
    from (
      select
        count(*)::integer as observation_count,
        count(distinct local_date)::integer as distinct_days_count,
        greatest(0, least(1, coalesce(avg(match_score), 0))) as profile_confidence,
        max(observed_at) as last_observed_at
      from public.staff_profile_observations
      where staff_profile_id = v_best_profile.id
        and decision_status = 'profile_match'
    ) aggregate
    where profile.id = v_best_profile.id;

    v_proposal_id := private.build_staff_profile_update_proposal_v1(v_best_profile.id);
  elsif v_candidate_id is not null then
    update public.staff_profile_candidates candidate set
      observation_count = aggregate.observation_count,
      distinct_days_count = aggregate.distinct_days_count,
      shift_windows = private.staff_candidate_shift_windows_v1(candidate.id),
      status = case
        when aggregate.observation_count >= v_camera.staff_profile_candidate_min_observations
          and aggregate.distinct_days_count >= v_camera.staff_profile_candidate_min_days
          then 'pending_review'
        else candidate.status
      end,
      updated_at = now()
    from (
      select count(*)::integer as observation_count,
        count(distinct local_date)::integer as distinct_days_count
      from public.staff_profile_observations
      where candidate_id = v_candidate_id
        and decision_status in ('candidate_match', 'candidate_created')
    ) aggregate
    where candidate.id = v_candidate_id;
  end if;

  return jsonb_build_object(
    'status', 'processed',
    'decision', v_decision,
    'reviewStatus', v_review_status,
    'decisionId', v_decision_id,
    'observationId', v_observation_id,
    'staffProfileId', case when v_best_profile.id is not null then v_best_profile.id else null end,
    'candidateId', v_candidate_id,
    'proposalId', v_proposal_id
  );
end;
$$;

create or replace function public.process_staff_profile_learning_queue_v1(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_item record;
  v_result jsonb;
  v_processed integer := 0;
  v_failed integer := 0;
  v_candidates integer := 0;
  v_proposals integer := 0;
begin
  insert into public.staff_profile_learning_runs(mode, status)
  values ('queue', 'running') returning id into v_run_id;

  for v_item in
    select queue.*
    from public.staff_profile_learning_queue queue
    where queue.status in ('queued', 'failed')
      and queue.available_at <= now()
      and queue.attempt_count < 6
    order by queue.available_at, queue.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  loop
    update public.staff_profile_learning_queue set
      status = 'processing',
      processing_started_at = now(),
      attempt_count = attempt_count + 1,
      updated_at = now()
    where id = v_item.id;

    begin
      v_result := public.refresh_staff_profile_for_event_person_v1(v_item.event_person_id);
      update public.staff_profile_learning_queue set
        status = case when v_result->>'status' = 'ignored' then 'ignored' else 'completed' end,
        processed_at = now(),
        last_error = null,
        updated_at = now()
      where id = v_item.id;
      v_processed := v_processed + 1;
      if v_result->>'candidateId' is not null then v_candidates := v_candidates + 1; end if;
      if v_result->>'proposalId' is not null then v_proposals := v_proposals + 1; end if;
    exception when others then
      update public.staff_profile_learning_queue set
        status = 'failed',
        available_at = now() + make_interval(mins => least(60, greatest(1, attempt_count * 5))),
        last_error = left(sqlerrm, 1000),
        updated_at = now()
      where id = v_item.id;
      v_failed := v_failed + 1;
    end;
  end loop;

  update public.staff_profile_candidates set
    status = 'expired',
    updated_at = now()
  where status in ('learning', 'pending_review')
    and expires_at < now();

  update public.staff_profile_update_proposals set
    status = 'expired',
    updated_at = now()
  where status = 'pending'
    and valid_until < now();

  update public.staff_profile_learning_runs set
    status = 'completed',
    completed_at = now(),
    processed_count = v_processed,
    failed_count = v_failed,
    candidate_count = v_candidates,
    proposal_count = v_proposals,
    details = jsonb_build_object('limit', p_limit)
  where id = v_run_id;

  return jsonb_build_object(
    'runId', v_run_id,
    'processed', v_processed,
    'failed', v_failed,
    'candidateResults', v_candidates,
    'proposalsCreated', v_proposals
  );
end;
$$;

create or replace function public.refresh_all_staff_profile_intelligence_v1(
  p_organization_id uuid default null,
  p_camera_id uuid default null,
  p_from timestamptz default now() - interval '30 days',
  p_to timestamptz default now(),
  p_limit integer default 2000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_queued integer := 0;
  v_queue_result jsonb;
begin
  insert into public.staff_profile_learning_runs(
    organization_id, camera_id, mode, status, started_at
  ) values (
    p_organization_id, p_camera_id, 'full', 'running', now()
  ) returning id into v_run_id;

  insert into public.staff_profile_learning_queue(
    organization_id, camera_id, event_id, event_person_id, status, available_at, updated_at
  )
  select
    event.organization_id,
    event.camera_id,
    event.id,
    person.id,
    'queued',
    now(),
    now()
  from public.events event
  join public.event_people person on person.event_id = event.id
  left join public.event_person_memory_links link on link.event_person_id = person.id
  left join public.person_memory_instances instance on instance.id = link.person_instance_id
  join public.cameras camera on camera.id = event.camera_id
  where event.deleted_at is null
    and event.started_at >= p_from
    and event.started_at < p_to
    and camera.staff_profile_intelligence_enabled
    and (p_organization_id is null or event.organization_id = p_organization_id)
    and (p_camera_id is null or event.camera_id = p_camera_id)
    and (
      person.role = 'staff'
      or instance.probable_role = 'staff'
      or link.staff_profile_id is not null
    )
  order by event.started_at desc
  limit greatest(1, least(coalesce(p_limit, 2000), 10000))
  on conflict (event_person_id) do update set
    status = case
      when public.staff_profile_learning_queue.status = 'processing' then 'processing'
      else 'queued'
    end,
    available_at = now(),
    last_error = null,
    updated_at = now();

  get diagnostics v_queued = row_count;
  v_queue_result := public.process_staff_profile_learning_queue_v1(least(v_queued, 500));

  update public.staff_profile_learning_runs set
    status = 'completed',
    completed_at = now(),
    queued_count = v_queued,
    processed_count = coalesce((v_queue_result->>'processed')::integer, 0),
    failed_count = coalesce((v_queue_result->>'failed')::integer, 0),
    candidate_count = coalesce((v_queue_result->>'candidateResults')::integer, 0),
    proposal_count = coalesce((v_queue_result->>'proposalsCreated')::integer, 0),
    details = jsonb_build_object('from', p_from, 'to', p_to, 'queueResult', v_queue_result)
  where id = v_run_id;

  return jsonb_build_object('runId', v_run_id, 'queued', v_queued, 'queueResult', v_queue_result);
exception when others then
  if v_run_id is not null then
    update public.staff_profile_learning_runs set
      status = 'failed', completed_at = now(), details = jsonb_build_object('error', sqlerrm)
    where id = v_run_id;
  end if;
  raise;
end;
$$;

create or replace function public.review_staff_profile_candidate_v1(
  p_organization_id uuid,
  p_candidate_id uuid,
  p_action text,
  p_label text default null,
  p_description text default null,
  p_min_similarity numeric default 0.740,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate record;
  v_profile_id uuid;
  v_version integer;
begin
  if not private.has_org_role(
    p_organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then
    raise exception 'not_authorized';
  end if;

  select candidate.* into v_candidate
  from public.staff_profile_candidates candidate
  where candidate.id = p_candidate_id
    and candidate.organization_id = p_organization_id
  for update;

  if not found then raise exception 'candidate_not_found'; end if;
  if v_candidate.status not in ('learning', 'pending_review') then raise exception 'candidate_not_reviewable'; end if;
  if p_action not in ('approve', 'reject', 'keep_learning') then raise exception 'invalid_action'; end if;

  if p_action = 'reject' then
    update public.staff_profile_candidates set
      status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_notes = coalesce(p_notes, ''), updated_at = now()
    where id = p_candidate_id;
    return jsonb_build_object('status', 'rejected', 'candidateId', p_candidate_id);
  end if;

  if p_action = 'keep_learning' then
    update public.staff_profile_candidates set
      status = 'learning',
      expires_at = greatest(expires_at, now() + interval '14 days'),
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = coalesce(p_notes, ''), updated_at = now()
    where id = p_candidate_id;
    return jsonb_build_object('status', 'learning', 'candidateId', p_candidate_id);
  end if;

  if nullif(trim(coalesce(p_label, '')), '') is null then raise exception 'label_required'; end if;

  insert into public.camera_staff_profiles(
    organization_id, camera_id, label, description, appearance_signature,
    zone_ids, min_similarity, enabled, sort_order, metadata,
    approved_by, approved_at, profile_status, profile_version, update_mode,
    habitual_zone_ids, habitual_action_codes, habitual_session_types,
    habitual_weekdays, shift_windows, recurring_appearance,
    observation_count, distinct_days_count, profile_confidence,
    last_observed_at, last_reviewed_at, last_reviewed_by,
    learning_metadata
  ) values (
    v_candidate.organization_id, v_candidate.camera_id, trim(p_label), coalesce(p_description, ''),
    v_candidate.canonical_appearance, v_candidate.zone_ids,
    greatest(0.5, least(1, coalesce(p_min_similarity, 0.740))),
    true,
    (select coalesce(max(profile.sort_order), -1) + 1 from public.camera_staff_profiles profile where profile.camera_id = v_candidate.camera_id),
    jsonb_build_object('source', 'int6_candidate', 'candidateId', v_candidate.id),
    auth.uid(), now(), 'active', 1, 'reviewed_learning',
    v_candidate.zone_ids, v_candidate.action_codes, v_candidate.session_types,
    v_candidate.weekdays, v_candidate.shift_windows, v_candidate.canonical_appearance,
    v_candidate.observation_count, v_candidate.distinct_days_count, v_candidate.confidence,
    v_candidate.last_seen_at, now(), auth.uid(),
    jsonb_build_object('approvedFromCandidateId', v_candidate.id)
  ) returning id, profile_version into v_profile_id, v_version;

  insert into public.staff_profile_versions(
    organization_id, camera_id, staff_profile_id, version, snapshot,
    change_source, change_summary, source_candidate_id, created_by
  ) values (
    p_organization_id, v_candidate.camera_id, v_profile_id, v_version,
    private.staff_profile_snapshot_v1(v_profile_id), 'candidate_approval',
    coalesce(p_notes, 'Perfil criado a partir de candidato revisado.'), v_candidate.id, auth.uid()
  );

  update public.staff_profile_candidates set
    status = 'approved', approved_profile_id = v_profile_id,
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = coalesce(p_notes, ''), updated_at = now()
  where id = v_candidate.id;

  update public.staff_profile_observations set
    staff_profile_id = v_profile_id,
    candidate_id = null,
    decision_status = 'profile_match'
  where candidate_id = v_candidate.id;

  update public.staff_profile_match_decisions set
    staff_profile_id = v_profile_id,
    candidate_id = null,
    decision = 'matched',
    review_status = 'confirmed',
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = coalesce(p_notes, ''), updated_at = now()
  where candidate_id = v_candidate.id;

  update public.event_person_memory_links link set
    staff_profile_id = v_profile_id,
    link_kind = 'staff_profile_continuation',
    reasoning = coalesce(link.reasoning, '{}'::jsonb) || jsonb_build_object('approvedCandidateId', v_candidate.id)
  from public.staff_profile_observations observation
  where observation.event_person_id = link.event_person_id
    and observation.staff_profile_id = v_profile_id;

  update public.person_memory_instances instance set
    staff_profile_id = v_profile_id, probable_role = 'staff', updated_at = now()
  where instance.id in (
    select observation.person_instance_id
    from public.staff_profile_observations observation
    where observation.staff_profile_id = v_profile_id
      and observation.person_instance_id is not null
  );

  update public.operational_session_participants participant set
    staff_profile_id = v_profile_id, participant_role = 'staff', updated_at = now()
  where participant.person_instance_id in (
    select observation.person_instance_id
    from public.staff_profile_observations observation
    where observation.staff_profile_id = v_profile_id
      and observation.person_instance_id is not null
  );

  return jsonb_build_object('status', 'approved', 'candidateId', p_candidate_id, 'staffProfileId', v_profile_id);
end;
$$;

create or replace function public.review_staff_profile_match_v1(
  p_organization_id uuid,
  p_decision_id uuid,
  p_verdict text,
  p_target_profile_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision record;
  v_profile_id uuid;
  v_observation record;
begin
  if not private.has_org_role(
    p_organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then raise exception 'not_authorized'; end if;

  select decision.* into v_decision
  from public.staff_profile_match_decisions decision
  where decision.id = p_decision_id and decision.organization_id = p_organization_id
  for update;
  if not found then raise exception 'decision_not_found'; end if;
  if p_verdict not in ('confirm', 'reassign', 'not_staff', 'uncertain', 'reject') then raise exception 'invalid_verdict'; end if;

  if p_verdict = 'confirm' then
    v_profile_id := v_decision.staff_profile_id;
    if v_profile_id is null then raise exception 'profile_required'; end if;
  elsif p_verdict = 'reassign' then
    v_profile_id := p_target_profile_id;
    if v_profile_id is null then raise exception 'target_profile_required'; end if;
  end if;

  if v_profile_id is not null and not exists (
    select 1 from public.camera_staff_profiles profile
    where profile.id = v_profile_id
      and profile.organization_id = p_organization_id
      and profile.camera_id = v_decision.camera_id
      and profile.profile_status = 'active'
  ) then raise exception 'invalid_target_profile'; end if;

  select observation.* into v_observation
  from public.staff_profile_observations observation
  where observation.event_person_id = v_decision.event_person_id;

  if p_verdict in ('confirm', 'reassign') then
    update public.event_person_memory_links set
      staff_profile_id = v_profile_id,
      link_kind = 'staff_profile_continuation',
      reasoning = coalesce(reasoning, '{}'::jsonb) || jsonb_build_object(
        'humanReviewed', true, 'decisionId', p_decision_id, 'verdict', p_verdict
      )
    where event_person_id = v_decision.event_person_id;

    update public.person_memory_instances set
      staff_profile_id = v_profile_id, probable_role = 'staff', updated_at = now()
    where id = v_decision.person_instance_id;

    update public.operational_session_participants set
      staff_profile_id = v_profile_id, participant_role = 'staff', updated_at = now()
    where person_instance_id = v_decision.person_instance_id
      and session_id = v_observation.operational_session_id;

    update public.staff_profile_observations set
      staff_profile_id = v_profile_id, candidate_id = null,
      decision_status = 'profile_match'
    where event_person_id = v_decision.event_person_id;
  elsif p_verdict = 'not_staff' then
    update public.event_person_memory_links set
      staff_profile_id = null,
      reasoning = coalesce(reasoning, '{}'::jsonb) || jsonb_build_object(
        'humanReviewed', true, 'decisionId', p_decision_id, 'verdict', 'not_staff'
      )
    where event_person_id = v_decision.event_person_id;

    update public.person_memory_instances set
      staff_profile_id = null,
      probable_role = 'unknown',
      updated_at = now()
    where id = v_decision.person_instance_id;

    update public.staff_profile_observations set
      staff_profile_id = null, candidate_id = null, decision_status = 'ignored'
    where event_person_id = v_decision.event_person_id;
  end if;

  update public.staff_profile_match_decisions set
    staff_profile_id = case when p_verdict in ('confirm', 'reassign') then v_profile_id else staff_profile_id end,
    decision = case
      when p_verdict in ('confirm', 'reassign') then 'matched'
      when p_verdict = 'not_staff' then 'not_staff'
      when p_verdict = 'reject' then 'unknown'
      else decision
    end,
    review_status = case
      when p_verdict = 'confirm' then 'confirmed'
      when p_verdict = 'reassign' then 'reassigned'
      when p_verdict = 'not_staff' then 'not_staff'
      when p_verdict = 'reject' then 'rejected'
      else 'uncertain'
    end,
    reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = coalesce(p_notes, ''), updated_at = now()
  where id = p_decision_id;

  if v_profile_id is not null then
    perform private.build_staff_profile_update_proposal_v1(v_profile_id);
  end if;

  return jsonb_build_object('status', p_verdict, 'decisionId', p_decision_id, 'staffProfileId', v_profile_id);
end;
$$;

create or replace function public.review_staff_profile_update_proposal_v1(
  p_organization_id uuid,
  p_proposal_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal record;
  v_profile record;
  v_new_version integer;
begin
  if not private.has_org_role(
    p_organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then raise exception 'not_authorized'; end if;

  if p_action not in ('apply', 'reject') then raise exception 'invalid_action'; end if;

  select proposal.* into v_proposal
  from public.staff_profile_update_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.organization_id = p_organization_id
  for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if v_proposal.status <> 'pending' then raise exception 'proposal_not_pending'; end if;

  if p_action = 'reject' then
    update public.staff_profile_update_proposals set
      status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(),
      review_notes = coalesce(p_notes, ''), updated_at = now()
    where id = p_proposal_id;
    return jsonb_build_object('status', 'rejected', 'proposalId', p_proposal_id);
  end if;

  select profile.* into v_profile
  from public.camera_staff_profiles profile
  where profile.id = v_proposal.staff_profile_id
    and profile.organization_id = p_organization_id
  for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_profile.profile_version <> v_proposal.base_version then raise exception 'profile_version_changed'; end if;

  v_new_version := v_profile.profile_version + 1;

  update public.camera_staff_profiles set
    habitual_zone_ids = case when 'habitual_zone_ids' = any(locked_fields) then habitual_zone_ids else v_proposal.proposed_zone_ids end,
    zone_ids = case when 'habitual_zone_ids' = any(locked_fields) then zone_ids else v_proposal.proposed_zone_ids end,
    habitual_action_codes = case when 'habitual_action_codes' = any(locked_fields) then habitual_action_codes else v_proposal.proposed_action_codes end,
    habitual_session_types = case when 'habitual_session_types' = any(locked_fields) then habitual_session_types else v_proposal.proposed_session_types end,
    habitual_weekdays = case when 'habitual_weekdays' = any(locked_fields) then habitual_weekdays else v_proposal.proposed_weekdays end,
    shift_windows = case when 'shift_windows' = any(locked_fields) then shift_windows else v_proposal.proposed_shift_windows end,
    recurring_appearance = case when 'recurring_appearance' = any(locked_fields) then recurring_appearance else v_proposal.proposed_recurring_appearance end,
    appearance_signature = case when 'recurring_appearance' = any(locked_fields) then appearance_signature else v_proposal.proposed_recurring_appearance end,
    observation_count = greatest(observation_count, v_proposal.observation_count),
    distinct_days_count = greatest(distinct_days_count, v_proposal.distinct_days_count),
    profile_confidence = greatest(profile_confidence, v_proposal.confidence),
    profile_version = v_new_version,
    last_reviewed_at = now(),
    last_reviewed_by = auth.uid(),
    learning_metadata = coalesce(learning_metadata, '{}'::jsonb) || jsonb_build_object(
      'lastAppliedProposalId', p_proposal_id,
      'lastAppliedAt', now()
    ),
    updated_at = now()
  where id = v_profile.id;

  insert into public.staff_profile_versions(
    organization_id, camera_id, staff_profile_id, version, snapshot,
    change_source, change_summary, created_by
  ) values (
    p_organization_id, v_profile.camera_id, v_profile.id, v_new_version,
    private.staff_profile_snapshot_v1(v_profile.id), 'learning_proposal',
    coalesce(p_notes, v_proposal.reason), auth.uid()
  );

  update public.staff_profile_update_proposals set
    status = 'applied', reviewed_by = auth.uid(), reviewed_at = now(),
    review_notes = coalesce(p_notes, ''), updated_at = now()
  where id = p_proposal_id;

  return jsonb_build_object('status', 'applied', 'proposalId', p_proposal_id, 'profileVersion', v_new_version);
end;
$$;

create or replace function public.save_staff_operational_profile_v1(
  p_organization_id uuid,
  p_profile_id uuid,
  p_expected_version integer,
  p_label text,
  p_description text,
  p_profile_status text,
  p_update_mode text,
  p_min_similarity numeric,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_new_version integer;
begin
  if not private.has_org_role(
    p_organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then raise exception 'not_authorized'; end if;

  if nullif(trim(coalesce(p_label, '')), '') is null then raise exception 'label_required'; end if;
  if p_profile_status not in ('active', 'paused', 'retired') then raise exception 'invalid_profile_status'; end if;
  if p_update_mode not in ('manual', 'reviewed_learning') then raise exception 'invalid_update_mode'; end if;

  select profile.* into v_profile
  from public.camera_staff_profiles profile
  where profile.id = p_profile_id and profile.organization_id = p_organization_id
  for update;
  if not found then raise exception 'profile_not_found'; end if;
  if v_profile.profile_version <> p_expected_version then raise exception 'profile_version_changed'; end if;

  v_new_version := v_profile.profile_version + 1;
  update public.camera_staff_profiles set
    label = trim(p_label),
    description = coalesce(p_description, ''),
    profile_status = p_profile_status,
    enabled = p_profile_status = 'active',
    update_mode = p_update_mode,
    min_similarity = greatest(0.5, least(1, coalesce(p_min_similarity, min_similarity))),
    profile_version = v_new_version,
    retired_at = case when p_profile_status = 'retired' then now() else null end,
    last_reviewed_at = now(),
    last_reviewed_by = auth.uid(),
    updated_at = now()
  where id = p_profile_id;

  insert into public.staff_profile_versions(
    organization_id, camera_id, staff_profile_id, version, snapshot,
    change_source, change_summary, created_by
  ) values (
    p_organization_id, v_profile.camera_id, p_profile_id, v_new_version,
    private.staff_profile_snapshot_v1(p_profile_id), 'manual_edit',
    coalesce(p_notes, 'Perfil operacional atualizado manualmente.'), auth.uid()
  );

  return jsonb_build_object('status', 'updated', 'profileId', p_profile_id, 'profileVersion', v_new_version);
end;
$$;

create or replace function public.restore_staff_operational_profile_version_v1(
  p_organization_id uuid,
  p_profile_id uuid,
  p_source_version integer,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_source record;
  v_snapshot jsonb;
  v_new_version integer;
begin
  if not private.has_org_role(
    p_organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then raise exception 'not_authorized'; end if;

  select profile.* into v_profile
  from public.camera_staff_profiles profile
  where profile.id = p_profile_id and profile.organization_id = p_organization_id
  for update;
  if not found then raise exception 'profile_not_found'; end if;

  select version.* into v_source
  from public.staff_profile_versions version
  where version.staff_profile_id = p_profile_id and version.version = p_source_version;
  if not found then raise exception 'source_version_not_found'; end if;
  v_snapshot := v_source.snapshot;
  v_new_version := v_profile.profile_version + 1;

  update public.camera_staff_profiles set
    label = coalesce(v_snapshot->>'label', label),
    description = coalesce(v_snapshot->>'description', description),
    appearance_signature = coalesce(v_snapshot->'appearanceSignature', appearance_signature),
    zone_ids = coalesce(array(select jsonb_array_elements_text(v_snapshot->'zoneIds')::uuid), zone_ids),
    min_similarity = coalesce((v_snapshot->>'minSimilarity')::numeric, min_similarity),
    profile_status = coalesce(v_snapshot->>'profileStatus', profile_status),
    update_mode = coalesce(v_snapshot->>'updateMode', update_mode),
    habitual_zone_ids = coalesce(array(select jsonb_array_elements_text(v_snapshot->'habitualZoneIds')::uuid), habitual_zone_ids),
    habitual_action_codes = coalesce(array(select jsonb_array_elements_text(v_snapshot->'habitualActionCodes')), habitual_action_codes),
    habitual_session_types = coalesce(array(select jsonb_array_elements_text(v_snapshot->'habitualSessionTypes')), habitual_session_types),
    habitual_weekdays = coalesce(array(select jsonb_array_elements_text(v_snapshot->'habitualWeekdays')::smallint), habitual_weekdays),
    shift_windows = coalesce(v_snapshot->'shiftWindows', shift_windows),
    recurring_appearance = coalesce(v_snapshot->'recurringAppearance', recurring_appearance),
    locked_fields = coalesce(array(select jsonb_array_elements_text(v_snapshot->'lockedFields')), locked_fields),
    profile_version = v_new_version,
    last_reviewed_at = now(),
    last_reviewed_by = auth.uid(),
    updated_at = now()
  where id = p_profile_id;

  insert into public.staff_profile_versions(
    organization_id, camera_id, staff_profile_id, version, snapshot,
    change_source, change_summary, created_by
  ) values (
    p_organization_id, v_profile.camera_id, p_profile_id, v_new_version,
    private.staff_profile_snapshot_v1(p_profile_id), 'restore',
    coalesce(p_notes, format('Restaurado a partir da versão %s.', p_source_version)), auth.uid()
  );

  return jsonb_build_object('status', 'restored', 'profileId', p_profile_id, 'profileVersion', v_new_version);
end;
$$;

create or replace function public.assistant_staff_operational_profile_summary_v1(
  p_organization_id uuid,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_profiles as (
    select
      profile.id,
      profile.camera_id,
      camera.site_id,
      camera.name as camera_name,
      profile.label,
      profile.description,
      profile.profile_status,
      profile.profile_version,
      profile.update_mode,
      profile.habitual_zone_ids,
      profile.habitual_action_codes,
      profile.habitual_session_types,
      profile.habitual_weekdays,
      profile.shift_windows,
      profile.observation_count,
      profile.distinct_days_count,
      profile.profile_confidence,
      profile.last_observed_at
    from public.camera_staff_profiles profile
    join public.cameras camera on camera.id = profile.camera_id
    where profile.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and (p_camera_id is null or profile.camera_id = p_camera_id)
      and (p_site_id is null or camera.site_id = p_site_id)
  ), profile_rows as (
    select jsonb_build_object(
      'id', profile.id,
      'cameraId', profile.camera_id,
      'cameraName', profile.camera_name,
      'label', profile.label,
      'description', profile.description,
      'status', profile.profile_status,
      'version', profile.profile_version,
      'updateMode', profile.update_mode,
      'habitualZones', coalesce((
        select jsonb_agg(zone.name order by zone.name)
        from public.camera_zones zone
        where zone.id = any(profile.habitual_zone_ids)
      ), '[]'::jsonb),
      'habitualActions', to_jsonb(profile.habitual_action_codes),
      'habitualSessionTypes', to_jsonb(profile.habitual_session_types),
      'habitualWeekdays', to_jsonb(profile.habitual_weekdays),
      'shiftWindows', profile.shift_windows,
      'observationCount', profile.observation_count,
      'distinctDaysCount', profile.distinct_days_count,
      'confidence', profile.profile_confidence,
      'lastObservedAt', profile.last_observed_at
    ) as data
    from selected_profiles profile
  )
  select jsonb_build_object(
    'profiles', coalesce((select jsonb_agg(data) from profile_rows), '[]'::jsonb),
    'counts', jsonb_build_object(
      'activeProfiles', (select count(*) from selected_profiles where profile_status = 'active'),
      'pausedProfiles', (select count(*) from selected_profiles where profile_status = 'paused'),
      'pendingCandidates', (
        select count(*)
        from public.staff_profile_candidates candidate
        join public.cameras camera on camera.id = candidate.camera_id
        where candidate.organization_id = p_organization_id
          and candidate.status = 'pending_review'
          and (p_camera_id is null or candidate.camera_id = p_camera_id)
          and (p_site_id is null or camera.site_id = p_site_id)
      ),
      'pendingMatches', (
        select count(*)
        from public.staff_profile_match_decisions decision
        join public.cameras camera on camera.id = decision.camera_id
        where decision.organization_id = p_organization_id
          and decision.review_status = 'pending'
          and (p_camera_id is null or decision.camera_id = p_camera_id)
          and (p_site_id is null or camera.site_id = p_site_id)
      ),
      'pendingUpdates', (
        select count(*)
        from public.staff_profile_update_proposals proposal
        join public.cameras camera on camera.id = proposal.camera_id
        where proposal.organization_id = p_organization_id
          and proposal.status = 'pending'
          and (p_camera_id is null or proposal.camera_id = p_camera_id)
          and (p_site_id is null or camera.site_id = p_site_id)
      )
    ),
    'limitations', jsonb_build_array(
      'Perfis operacionais não confirmam identidade civil.',
      'Nenhum reconhecimento facial ou embedding biométrico é utilizado.',
      'Turnos e ações representam padrões observados, não contratos ou garantias.',
      'Uniformes semelhantes, baixa resolução e oclusão podem gerar ambiguidade.'
    )
  );
$$;

-- Versão inicial para perfis que já existiam na INT-2.
insert into public.staff_profile_versions(
  organization_id, camera_id, staff_profile_id, version, snapshot,
  change_source, change_summary, created_by, created_at
)
select
  profile.organization_id,
  profile.camera_id,
  profile.id,
  profile.profile_version,
  private.staff_profile_snapshot_v1(profile.id),
  'migration',
  'Perfil existente incorporado à INT-6.',
  profile.approved_by,
  coalesce(profile.approved_at, profile.created_at)
from public.camera_staff_profiles profile
on conflict (staff_profile_id, version) do nothing;

insert into public.monitoria_capability_registry(module, status, introduced_phase, description)
values (
  'operational_profiles',
  'available',
  '6',
  'Perfis operacionais não biométricos, versionados e revisados'
)
on conflict (module) do update set
  status = excluded.status,
  introduced_phase = excluded.introduced_phase,
  description = excluded.description,
  updated_at = now();

-- Realtime para a página administrativa.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'camera_staff_profiles',
    'staff_profile_candidates',
    'staff_profile_match_decisions',
    'staff_profile_update_proposals'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

-- updated_at.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'staff_profile_candidates',
    'staff_profile_match_decisions',
    'staff_profile_update_proposals',
    'staff_profile_learning_queue'
  ]
  loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_set_updated_at', v_table);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      v_table || '_set_updated_at', v_table
    );
  end loop;
end
$$;

-- Permissões de execução.
revoke all on function public.refresh_staff_profile_for_event_person_v1(uuid) from public, anon, authenticated;
revoke all on function public.process_staff_profile_learning_queue_v1(integer) from public, anon, authenticated;
revoke all on function public.refresh_all_staff_profile_intelligence_v1(uuid, uuid, timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.review_staff_profile_candidate_v1(uuid, uuid, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.review_staff_profile_match_v1(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.review_staff_profile_update_proposal_v1(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.save_staff_operational_profile_v1(uuid, uuid, integer, text, text, text, text, numeric, text) from public, anon, authenticated;
revoke all on function public.restore_staff_operational_profile_version_v1(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.assistant_staff_operational_profile_summary_v1(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.refresh_staff_profile_for_event_person_v1(uuid) to service_role;
grant execute on function public.process_staff_profile_learning_queue_v1(integer) to service_role;
grant execute on function public.refresh_all_staff_profile_intelligence_v1(uuid, uuid, timestamptz, timestamptz, integer) to service_role;
grant execute on function public.review_staff_profile_candidate_v1(uuid, uuid, text, text, text, numeric, text) to authenticated, service_role;
grant execute on function public.review_staff_profile_match_v1(uuid, uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.review_staff_profile_update_proposal_v1(uuid, uuid, text, text) to authenticated, service_role;
grant execute on function public.save_staff_operational_profile_v1(uuid, uuid, integer, text, text, text, text, numeric, text) to authenticated, service_role;
grant execute on function public.restore_staff_operational_profile_version_v1(uuid, uuid, integer, text) to authenticated, service_role;
grant execute on function public.assistant_staff_operational_profile_summary_v1(uuid, uuid, uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    grant execute on function public.assistant_staff_operational_profile_summary_v1(uuid, uuid, uuid)
      to monitoria_mcp_readonly;
  end if;
end
$$;

commit;
