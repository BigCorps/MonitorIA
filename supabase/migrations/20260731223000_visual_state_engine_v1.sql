-- MonitorIA — Motor de Estados Visuais v1
-- Aplicar antes do pacote TypeScript.
-- A migration é aditiva, preserva a taxonomia atual e pode permanecer desativada por câmera.

alter table public.cameras
  add column if not exists visual_state_enabled boolean not null default false;

comment on column public.cameras.visual_state_enabled is
  'Ativa a observação e consolidação de entidades visuais configuradas para a câmera.';

alter table public.analysis_jobs
  add column if not exists prompt_hash text null;

comment on column public.analysis_jobs.prompt_hash is
  'SHA-256 das instruções e do perfil visual usados na análise.';

alter table public.events
  add column if not exists outside_declared_hours boolean not null default false,
  add column if not exists after_confirmed_closing boolean not null default false;

create index if not exists events_operational_context_idx
  on public.events(
    organization_id,
    outside_declared_hours,
    after_confirmed_closing,
    started_at desc
  );

comment on column public.events.outside_declared_hours is
  'O evento ocorreu fora da janela semanal declarada pela câmera. O horário declarado é contexto, não prova de fechamento.';

comment on column public.events.after_confirmed_closing is
  'O evento ocorreu depois do último fechamento visual confirmado e antes de uma reabertura confirmada.';

create table if not exists public.camera_visual_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  camera_profile_id uuid not null references public.camera_profiles(id) on delete cascade,
  name text not null,
  entity_type text not null,
  polygon jsonb not null,
  state_definitions jsonb not null,
  primary_operational_marker boolean not null default false,
  min_confidence numeric(4,3) not null default 0.820,
  reliability text not null default 'medium',
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camera_visual_entities_type_check check (
    entity_type in (
      'access_barrier',
      'container',
      'reference_object',
      'equipment',
      'activity_area',
      'lighting_reference'
    )
  ),
  constraint camera_visual_entities_polygon_check check (
    jsonb_typeof(polygon) = 'array'
    and jsonb_array_length(polygon) between 3 and 50
  ),
  constraint camera_visual_entities_states_check check (
    jsonb_typeof(state_definitions) = 'array'
    and jsonb_array_length(state_definitions) between 2 and 12
  ),
  constraint camera_visual_entities_confidence_check check (
    min_confidence between 0.5 and 1
  ),
  constraint camera_visual_entities_reliability_check check (
    reliability in ('high', 'medium', 'low')
  ),
  constraint camera_visual_entities_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create unique index if not exists camera_visual_entities_profile_name_uidx
  on public.camera_visual_entities(camera_profile_id, lower(name));

create index if not exists camera_visual_entities_camera_idx
  on public.camera_visual_entities(camera_id, enabled, sort_order);

create unique index if not exists camera_visual_entities_primary_marker_uidx
  on public.camera_visual_entities(camera_profile_id)
  where primary_operational_marker and enabled;

create table if not exists public.visual_state_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  analysis_job_id uuid null references public.analysis_jobs(id) on delete set null,
  entity_id uuid not null references public.camera_visual_entities(id) on delete cascade,
  observed_state text not null,
  previous_visible_state text null,
  transition_visible boolean not null default false,
  persistence_visible boolean not null default false,
  description text not null,
  frame_labels text[] not null default '{}',
  visibility text not null,
  confidence numeric(5,4) not null,
  limitations text[] not null default '{}',
  observed_at timestamptz not null,
  outside_declared_hours boolean not null default false,
  after_confirmed_closing boolean not null default false,
  prompt_version integer null,
  prompt_hash text null,
  raw_observation jsonb not null,
  review_status text not null default 'not_reviewed',
  corrected_state text null,
  reviewed_by uuid null references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint visual_state_observations_visibility_check check (
    visibility in (
      'clear',
      'partial',
      'blurred',
      'too_small',
      'occluded',
      'not_visible'
    )
  ),
  constraint visual_state_observations_confidence_check check (
    confidence between 0 and 1
  ),
  constraint visual_state_observations_review_check check (
    review_status in ('not_reviewed', 'confirmed', 'corrected', 'rejected')
  ),
  constraint visual_state_observations_raw_check check (
    jsonb_typeof(raw_observation) = 'object'
  )
);

create unique index if not exists visual_state_observations_event_entity_uidx
  on public.visual_state_observations(event_id, entity_id);

create index if not exists visual_state_observations_camera_time_idx
  on public.visual_state_observations(camera_id, observed_at desc);

create index if not exists visual_state_observations_context_idx
  on public.visual_state_observations(
    organization_id,
    outside_declared_hours,
    after_confirmed_closing,
    observed_at desc
  );

create table if not exists public.visual_entity_current_states (
  entity_id uuid primary key references public.camera_visual_entities(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  current_state text not null,
  since_at timestamptz not null,
  last_observed_at timestamptz not null,
  confidence numeric(5,4) not null,
  source_observation_id uuid null references public.visual_state_observations(id) on delete set null,
  source_event_id uuid null references public.events(id) on delete set null,
  transition_was_visible boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint visual_entity_current_states_confidence_check check (
    confidence between 0 and 1
  )
);

create index if not exists visual_entity_current_states_camera_idx
  on public.visual_entity_current_states(camera_id, updated_at desc);

create table if not exists public.visual_state_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  entity_id uuid not null references public.camera_visual_entities(id) on delete cascade,
  event_id uuid null references public.events(id) on delete set null,
  observation_id uuid not null references public.visual_state_observations(id) on delete cascade,
  from_state text null,
  to_state text not null,
  transition_kind text not null,
  occurred_at timestamptz not null,
  confidence numeric(5,4) not null,
  transition_visible boolean not null default false,
  persistence_visible boolean not null default false,
  outside_declared_hours boolean not null default false,
  after_confirmed_closing boolean not null default false,
  created_at timestamptz not null default now(),
  constraint visual_state_transitions_kind_check check (
    transition_kind in (
      'initial_observation',
      'visible_transition',
      'persistent_confirmation',
      'strong_snapshot'
    )
  ),
  constraint visual_state_transitions_confidence_check check (
    confidence between 0 and 1
  )
);

create index if not exists visual_state_transitions_entity_time_idx
  on public.visual_state_transitions(entity_id, occurred_at desc);

create index if not exists visual_state_transitions_context_idx
  on public.visual_state_transitions(
    organization_id,
    outside_declared_hours,
    after_confirmed_closing,
    occurred_at desc
  );

create table if not exists public.site_operating_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  entity_id uuid not null references public.camera_visual_entities(id) on delete cascade,
  status text not null,
  opened_at timestamptz null,
  first_open_observed_at timestamptz not null,
  closed_at timestamptz null,
  opening_precision text not null,
  closing_precision text null,
  open_transition_id uuid null references public.visual_state_transitions(id) on delete set null,
  close_transition_id uuid null references public.visual_state_transitions(id) on delete set null,
  opening_event_id uuid null references public.events(id) on delete set null,
  closing_event_id uuid null references public.events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_operating_sessions_status_check check (
    status in ('open', 'closed')
  ),
  constraint site_operating_sessions_opening_precision_check check (
    opening_precision in ('visible_transition', 'persistent_confirmation', 'observed_only')
  ),
  constraint site_operating_sessions_closing_precision_check check (
    closing_precision is null
    or closing_precision in ('visible_transition', 'persistent_confirmation', 'strong_snapshot')
  ),
  constraint site_operating_sessions_time_check check (
    closed_at is null or closed_at >= first_open_observed_at
  )
);

create unique index if not exists site_operating_sessions_one_open_idx
  on public.site_operating_sessions(entity_id)
  where status = 'open';

create index if not exists site_operating_sessions_site_time_idx
  on public.site_operating_sessions(site_id, first_open_observed_at desc);

create table if not exists public.visual_state_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  observation_id uuid not null references public.visual_state_observations(id) on delete cascade,
  entity_id uuid not null references public.camera_visual_entities(id) on delete cascade,
  original_state text not null,
  corrected_state text null,
  verdict text not null,
  note text null,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint visual_state_reviews_verdict_check check (
    verdict in ('confirmed', 'corrected', 'rejected')
  )
);

create index if not exists visual_state_reviews_observation_idx
  on public.visual_state_reviews(observation_id, created_at desc);

alter table public.camera_visual_entities enable row level security;
alter table public.visual_state_observations enable row level security;
alter table public.visual_entity_current_states enable row level security;
alter table public.visual_state_transitions enable row level security;
alter table public.site_operating_sessions enable row level security;
alter table public.visual_state_reviews enable row level security;

drop policy if exists camera_visual_entities_select on public.camera_visual_entities;
create policy camera_visual_entities_select
on public.camera_visual_entities
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists camera_visual_entities_manage on public.camera_visual_entities;
create policy camera_visual_entities_manage
on public.camera_visual_entities
for all
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
)
with check (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists visual_state_observations_select on public.visual_state_observations;
create policy visual_state_observations_select
on public.visual_state_observations
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists visual_entity_current_states_select on public.visual_entity_current_states;
create policy visual_entity_current_states_select
on public.visual_entity_current_states
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists visual_state_transitions_select on public.visual_state_transitions;
create policy visual_state_transitions_select
on public.visual_state_transitions
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists site_operating_sessions_select on public.site_operating_sessions;
create policy site_operating_sessions_select
on public.site_operating_sessions
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists visual_state_reviews_select on public.visual_state_reviews;
create policy visual_state_reviews_select
on public.visual_state_reviews
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists visual_state_reviews_insert on public.visual_state_reviews;
create policy visual_state_reviews_insert
on public.visual_state_reviews
for insert
to authenticated
with check (
  reviewed_by = (select auth.uid())
  and private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

grant select on public.camera_visual_entities to authenticated;
grant select on public.visual_state_observations to authenticated;
grant select on public.visual_entity_current_states to authenticated;
grant select on public.visual_state_transitions to authenticated;
grant select on public.site_operating_sessions to authenticated;
grant select, insert on public.visual_state_reviews to authenticated;

grant all on public.camera_visual_entities to service_role;
grant all on public.visual_state_observations to service_role;
grant all on public.visual_entity_current_states to service_role;
grant all on public.visual_state_transitions to service_role;
grant all on public.site_operating_sessions to service_role;
grant all on public.visual_state_reviews to service_role;

create or replace function private.monitoria_is_outside_declared_hours(
  p_camera_id uuid,
  p_moment timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_schedule jsonb;
  v_timezone text;
  v_local timestamp;
  v_day integer;
  v_time time;
  v_window jsonb;
begin
  select c.monitoring_schedule, s.timezone
    into v_schedule, v_timezone
  from public.cameras c
  join public.sites s on s.id = c.site_id
  where c.id = p_camera_id;

  if not found or v_schedule is null then
    return false;
  end if;

  if coalesce(v_schedule->>'mode', 'always') = 'always' then
    return false;
  end if;

  if v_schedule->>'mode' <> 'weekly' then
    return false;
  end if;

  v_local := p_moment at time zone coalesce(v_timezone, 'UTC');
  v_day := extract(isodow from v_local)::integer;
  v_time := v_local::time;

  select item.value
    into v_window
  from jsonb_array_elements(
    coalesce(v_schedule->'weekly', '[]'::jsonb)
  ) as item(value)
  where coalesce((item.value->>'day')::integer, -1) = v_day
  limit 1;

  if v_window is null then
    return true;
  end if;

  return not (
    v_time >= (v_window->>'start')::time
    and v_time < (v_window->>'end')::time
  );
exception
  when others then
    return false;
end;
$$;

create or replace function private.monitoria_after_confirmed_closing(
  p_entity_id uuid,
  p_moment timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not exists (
      select 1
      from public.site_operating_sessions open_session
      where open_session.entity_id = p_entity_id
        and open_session.status = 'open'
    )
    and exists (
      select 1
      from public.site_operating_sessions closed_session
      where closed_session.entity_id = p_entity_id
        and closed_session.status = 'closed'
        and closed_session.closed_at is not null
        and closed_session.closed_at <= p_moment
    );
$$;

create or replace function private.process_monitoria_visual_state_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_observation jsonb;
  v_entity_id uuid;
  v_entity public.camera_visual_entities%rowtype;
  v_observation_id uuid;
  v_transition_id uuid;
  v_current public.visual_entity_current_states%rowtype;
  v_state text;
  v_previous_visible_state text;
  v_description text;
  v_visibility text;
  v_confidence numeric;
  v_transition_visible boolean;
  v_persistence_visible boolean;
  v_state_allowed boolean;
  v_commit_state boolean;
  v_has_current boolean;
  v_transition_kind text;
  v_outside_declared_hours boolean;
  v_after_confirmed_closing boolean;
  v_open_session public.site_operating_sessions%rowtype;
begin
  select c.visual_state_enabled
    into v_enabled
  from public.cameras c
  where c.id = new.camera_id;

  if not coalesce(v_enabled, false) then
    return new;
  end if;

  v_outside_declared_hours :=
    private.monitoria_is_outside_declared_hours(
      new.camera_id,
      new.ended_at
    );

  select private.monitoria_after_confirmed_closing(
    primary_entity.id,
    new.ended_at
  )
  into v_after_confirmed_closing
  from public.camera_visual_entities primary_entity
  where primary_entity.camera_id = new.camera_id
    and primary_entity.primary_operational_marker
    and primary_entity.enabled
  limit 1;

  update public.events
  set outside_declared_hours = v_outside_declared_hours,
      after_confirmed_closing =
        coalesce(v_after_confirmed_closing, false)
  where id = new.id;

  if jsonb_typeof(new.analyzed_payload->'stateObservations') <> 'array' then
    return new;
  end if;

  for v_observation in
    select item.value
    from jsonb_array_elements(
      new.analyzed_payload->'stateObservations'
    ) as item(value)
  loop
    begin
      v_entity_id := (v_observation->>'entityId')::uuid;
    exception
      when others then
        continue;
    end;

    select entity.*
      into v_entity
    from public.camera_visual_entities entity
    where entity.id = v_entity_id
      and entity.organization_id = new.organization_id
      and entity.camera_id = new.camera_id
      and entity.camera_profile_id = new.profile_id
      and entity.enabled;

    if not found then
      continue;
    end if;

    v_state := lower(trim(coalesce(v_observation->>'observedState', 'unknown')));
    v_previous_visible_state := nullif(
      lower(trim(coalesce(v_observation->>'previousVisibleState', ''))),
      ''
    );
    v_description := left(
      trim(coalesce(v_observation->>'description', 'Estado visual observado.')),
      600
    );
    v_visibility := lower(trim(coalesce(v_observation->>'visibility', 'not_visible')));

    begin
      v_confidence := greatest(
        0,
        least(
          1,
          coalesce((v_observation->>'confidence')::numeric, 0)
        )
      );
    exception
      when others then
        v_confidence := 0;
    end;

    v_transition_visible := coalesce(
      (v_observation->>'transitionVisible')::boolean,
      false
    );
    v_persistence_visible := coalesce(
      (v_observation->>'persistenceVisible')::boolean,
      false
    );

    select
      v_state = 'unknown'
      or exists (
        select 1
        from jsonb_array_elements(v_entity.state_definitions) definition
        where lower(trim(definition->>'state')) = v_state
      )
    into v_state_allowed;

    if not v_state_allowed then
      continue;
    end if;

    v_outside_declared_hours :=
      private.monitoria_is_outside_declared_hours(
        new.camera_id,
        new.ended_at
      );

    v_after_confirmed_closing := false;
    if not v_entity.primary_operational_marker then
      select private.monitoria_after_confirmed_closing(
        primary_entity.id,
        new.ended_at
      )
      into v_after_confirmed_closing
      from public.camera_visual_entities primary_entity
      where primary_entity.camera_id = new.camera_id
        and primary_entity.primary_operational_marker
        and primary_entity.enabled
      limit 1;
    end if;

    insert into public.visual_state_observations (
      organization_id,
      site_id,
      camera_id,
      event_id,
      analysis_job_id,
      entity_id,
      observed_state,
      previous_visible_state,
      transition_visible,
      persistence_visible,
      description,
      frame_labels,
      visibility,
      confidence,
      limitations,
      observed_at,
      outside_declared_hours,
      after_confirmed_closing,
      prompt_version,
      prompt_hash,
      raw_observation
    ) values (
      new.organization_id,
      new.site_id,
      new.camera_id,
      new.id,
      new.analysis_job_id,
      v_entity.id,
      v_state,
      v_previous_visible_state,
      v_transition_visible,
      v_persistence_visible,
      v_description,
      coalesce(
        array(
          select label
          from jsonb_array_elements_text(
            coalesce(v_observation->'frameLabels', '[]'::jsonb)
          ) as labels(label)
          where label in ('start', 'peak', 'end', 'extra')
        ),
        '{}'::text[]
      ),
      v_visibility,
      v_confidence,
      coalesce(
        array(
          select left(limitation, 240)
          from jsonb_array_elements_text(
            coalesce(v_observation->'limitations', '[]'::jsonb)
          ) as limitations(limitation)
          limit 5
        ),
        '{}'::text[]
      ),
      new.ended_at,
      v_outside_declared_hours,
      coalesce(v_after_confirmed_closing, false),
      (
        select aj.prompt_version
        from public.analysis_jobs aj
        where aj.id = new.analysis_job_id
      ),
      (
        select aj.prompt_hash
        from public.analysis_jobs aj
        where aj.id = new.analysis_job_id
      ),
      v_observation
    )
    on conflict (event_id, entity_id)
    do update set
      observed_state = excluded.observed_state,
      previous_visible_state = excluded.previous_visible_state,
      transition_visible = excluded.transition_visible,
      persistence_visible = excluded.persistence_visible,
      description = excluded.description,
      frame_labels = excluded.frame_labels,
      visibility = excluded.visibility,
      confidence = excluded.confidence,
      limitations = excluded.limitations,
      outside_declared_hours = excluded.outside_declared_hours,
      after_confirmed_closing = excluded.after_confirmed_closing,
      raw_observation = excluded.raw_observation
    returning id into v_observation_id;

    select current_state.*
      into v_current
    from public.visual_entity_current_states current_state
    where current_state.entity_id = v_entity.id
    for update;

    v_has_current := found;

    v_commit_state :=
      v_state <> 'unknown'
      and v_visibility = 'clear'
      and v_confidence >= v_entity.min_confidence
      and (
        not v_has_current
        or v_current.current_state = v_state
        or v_transition_visible
        or v_persistence_visible
        or (
          v_entity.reliability = 'high'
          and v_confidence >= greatest(0.900, v_entity.min_confidence + 0.080)
        )
      );

    if not v_commit_state then
      continue;
    end if;

    if not v_has_current then
      v_transition_kind := 'initial_observation';

      insert into public.visual_state_transitions (
        organization_id,
        site_id,
        camera_id,
        entity_id,
        event_id,
        observation_id,
        from_state,
        to_state,
        transition_kind,
        occurred_at,
        confidence,
        transition_visible,
        persistence_visible,
        outside_declared_hours,
        after_confirmed_closing
      ) values (
        new.organization_id,
        new.site_id,
        new.camera_id,
        v_entity.id,
        new.id,
        v_observation_id,
        null,
        v_state,
        v_transition_kind,
        new.ended_at,
        v_confidence,
        v_transition_visible,
        v_persistence_visible,
        v_outside_declared_hours,
        coalesce(v_after_confirmed_closing, false)
      )
      returning id into v_transition_id;

      insert into public.visual_entity_current_states (
        entity_id,
        organization_id,
        site_id,
        camera_id,
        current_state,
        since_at,
        last_observed_at,
        confidence,
        source_observation_id,
        source_event_id,
        transition_was_visible,
        updated_at
      ) values (
        v_entity.id,
        new.organization_id,
        new.site_id,
        new.camera_id,
        v_state,
        new.ended_at,
        new.ended_at,
        v_confidence,
        v_observation_id,
        new.id,
        v_transition_visible,
        now()
      );
    elsif v_current.current_state = v_state then
      update public.visual_entity_current_states
      set last_observed_at = new.ended_at,
          confidence = v_confidence,
          source_observation_id = v_observation_id,
          source_event_id = new.id,
          transition_was_visible = v_transition_visible,
          updated_at = now()
      where entity_id = v_entity.id;

      v_transition_id := null;
    else
      v_transition_kind := case
        when v_transition_visible then 'visible_transition'
        when v_persistence_visible then 'persistent_confirmation'
        else 'strong_snapshot'
      end;

      insert into public.visual_state_transitions (
        organization_id,
        site_id,
        camera_id,
        entity_id,
        event_id,
        observation_id,
        from_state,
        to_state,
        transition_kind,
        occurred_at,
        confidence,
        transition_visible,
        persistence_visible,
        outside_declared_hours,
        after_confirmed_closing
      ) values (
        new.organization_id,
        new.site_id,
        new.camera_id,
        v_entity.id,
        new.id,
        v_observation_id,
        v_current.current_state,
        v_state,
        v_transition_kind,
        new.ended_at,
        v_confidence,
        v_transition_visible,
        v_persistence_visible,
        v_outside_declared_hours,
        coalesce(v_after_confirmed_closing, false)
      )
      returning id into v_transition_id;

      update public.visual_entity_current_states
      set current_state = v_state,
          since_at = new.ended_at,
          last_observed_at = new.ended_at,
          confidence = v_confidence,
          source_observation_id = v_observation_id,
          source_event_id = new.id,
          transition_was_visible = v_transition_visible,
          updated_at = now()
      where entity_id = v_entity.id;
    end if;

    if v_entity.primary_operational_marker and v_entity.entity_type = 'access_barrier' then
      if v_state = 'open' then
        select session.*
          into v_open_session
        from public.site_operating_sessions session
        where session.entity_id = v_entity.id
          and session.status = 'open'
        for update;

        if not found then
          insert into public.site_operating_sessions (
            organization_id,
            site_id,
            camera_id,
            entity_id,
            status,
            opened_at,
            first_open_observed_at,
            opening_precision,
            open_transition_id,
            opening_event_id,
            updated_at
          ) values (
            new.organization_id,
            new.site_id,
            new.camera_id,
            v_entity.id,
            'open',
            case
              when v_transition_visible then new.ended_at
              when v_persistence_visible then new.ended_at
              else null
            end,
            new.ended_at,
            case
              when v_transition_visible then 'visible_transition'
              when v_persistence_visible then 'persistent_confirmation'
              else 'observed_only'
            end,
            v_transition_id,
            new.id,
            now()
          );
        end if;
      elsif v_state = 'closed' then
        select session.*
          into v_open_session
        from public.site_operating_sessions session
        where session.entity_id = v_entity.id
          and session.status = 'open'
        for update;

        if found then
          update public.site_operating_sessions
          set status = 'closed',
              closed_at = new.ended_at,
              closing_precision = case
                when v_transition_visible then 'visible_transition'
                when v_persistence_visible then 'persistent_confirmation'
                else 'strong_snapshot'
              end,
              close_transition_id = v_transition_id,
              closing_event_id = new.id,
              updated_at = now()
          where id = v_open_session.id;
        end if;
      end if;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_process_monitoria_visual_state_event
  on public.events;

create trigger trg_process_monitoria_visual_state_event
after insert on public.events
for each row
execute function private.process_monitoria_visual_state_event();

create or replace function public.assistant_operating_hours_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  return jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'sessions',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', session.id,
            'siteId', session.site_id,
            'cameraId', session.camera_id,
            'entityId', session.entity_id,
            'status', session.status,
            'openedAt', session.opened_at,
            'firstOpenObservedAt', session.first_open_observed_at,
            'closedAt', session.closed_at,
            'openingPrecision', session.opening_precision,
            'closingPrecision', session.closing_precision,
            'openingEventId', session.opening_event_id,
            'closingEventId', session.closing_event_id
          )
          order by session.first_open_observed_at
        )
        from public.site_operating_sessions session
        where session.organization_id = p_organization_id
          and session.first_open_observed_at < p_to
          and coalesce(session.closed_at, p_to) >= p_from
          and (p_camera_id is null or session.camera_id = p_camera_id)
          and (p_site_id is null or session.site_id = p_site_id)
      ),
      '[]'::jsonb
    ),
    'currentStates',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'entityId', current_state.entity_id,
            'entityName', entity.name,
            'entityType', entity.entity_type,
            'cameraId', current_state.camera_id,
            'state', current_state.current_state,
            'sinceAt', current_state.since_at,
            'lastObservedAt', current_state.last_observed_at,
            'confidence', current_state.confidence
          )
          order by entity.sort_order, entity.name
        )
        from public.visual_entity_current_states current_state
        join public.camera_visual_entities entity
          on entity.id = current_state.entity_id
        where current_state.organization_id = p_organization_id
          and entity.primary_operational_marker
          and (p_camera_id is null or current_state.camera_id = p_camera_id)
          and (p_site_id is null or current_state.site_id = p_site_id)
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.assistant_operating_hours_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) from public, anon;

grant execute on function public.assistant_operating_hours_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) to authenticated, service_role;

create or replace function public.assistant_visual_state_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  return jsonb_build_object(
    'currentStates',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'entityId', state.entity_id,
            'entityName', entity.name,
            'entityType', entity.entity_type,
            'cameraId', state.camera_id,
            'siteId', state.site_id,
            'state', state.current_state,
            'sinceAt', state.since_at,
            'lastObservedAt', state.last_observed_at,
            'confidence', state.confidence
          )
          order by entity.sort_order, entity.name
        )
        from public.visual_entity_current_states state
        join public.camera_visual_entities entity
          on entity.id = state.entity_id
        where state.organization_id = p_organization_id
          and (p_camera_id is null or state.camera_id = p_camera_id)
          and (p_site_id is null or state.site_id = p_site_id)
      ),
      '[]'::jsonb
    ),
    'transitions',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', transition.id,
            'entityId', transition.entity_id,
            'entityName', entity.name,
            'entityType', entity.entity_type,
            'cameraId', transition.camera_id,
            'siteId', transition.site_id,
            'fromState', transition.from_state,
            'toState', transition.to_state,
            'occurredAt', transition.occurred_at,
            'confidence', transition.confidence,
            'transitionVisible', transition.transition_visible,
            'outsideDeclaredHours', transition.outside_declared_hours,
            'afterConfirmedClosing', transition.after_confirmed_closing,
            'eventId', transition.event_id
          )
          order by transition.occurred_at desc
        )
        from (
          select transition.*
          from public.visual_state_transitions transition
          where transition.organization_id = p_organization_id
            and transition.occurred_at >= p_from
            and transition.occurred_at < p_to
            and (p_camera_id is null or transition.camera_id = p_camera_id)
            and (p_site_id is null or transition.site_id = p_site_id)
          order by transition.occurred_at desc
          limit 100
        ) transition
        join public.camera_visual_entities entity
          on entity.id = transition.entity_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

revoke all on function public.assistant_visual_state_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) from public, anon;

grant execute on function public.assistant_visual_state_summary(
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  uuid
) to authenticated, service_role;

-- Configuração inicial da câmera atual.
-- Usa dinamicamente o perfil ativo e a zona que contém a cortina/portão.
insert into public.camera_visual_entities (
  organization_id,
  camera_id,
  camera_profile_id,
  name,
  entity_type,
  polygon,
  state_definitions,
  primary_operational_marker,
  min_confidence,
  reliability,
  enabled,
  sort_order,
  metadata,
  approved_at
)
select
  camera.organization_id,
  camera.id,
  profile.id,
  'Cortina principal',
  'access_barrier',
  zone.polygon,
  jsonb_build_array(
    jsonb_build_object(
      'state', 'closed',
      'description', 'A cortina metálica cobre completamente o acesso principal.'
    ),
    jsonb_build_object(
      'state', 'partially_open',
      'description', 'A cortina está elevada apenas em parte e o acesso não está completamente livre.'
    ),
    jsonb_build_object(
      'state', 'opening',
      'description', 'Os quadros mostram a cortina subindo.'
    ),
    jsonb_build_object(
      'state', 'open',
      'description', 'A cortina está elevada e o acesso principal aparece livre.'
    ),
    jsonb_build_object(
      'state', 'closing',
      'description', 'Os quadros mostram a cortina descendo.'
    )
  ),
  true,
  0.820,
  'high',
  true,
  0,
  jsonb_build_object(
    'seed', 'monitoria_visual_state_v1',
    'sourceZoneId', zone.id,
    'profileBackup', jsonb_build_object(
      'environmentDescription', profile.environment_description,
      'monitoringGoals', profile.monitoring_goals,
      'profileMetadata', profile.profile_metadata
    )
  ),
  now()
from public.cameras camera
join public.camera_profiles profile
  on profile.camera_id = camera.id
 and profile.is_active
join lateral (
  select candidate.*
  from public.camera_zones candidate
  where candidate.camera_profile_id = profile.id
    and (
      candidate.name ilike '%portão%'
      or candidate.name ilike '%cortina%'
      or candidate.description ilike '%portão%'
      or candidate.description ilike '%cortina%'
    )
  order by
    case
      when candidate.name ilike '%portão%'
        or candidate.name ilike '%cortina%' then 0
      else 1
    end,
    candidate.sort_order
  limit 1
) zone on true
where camera.name = 'Entrada da Loja'
  and not exists (
    select 1
    from public.camera_visual_entities existing
    where existing.camera_profile_id = profile.id
      and lower(existing.name) = lower('Cortina principal')
  );

-- Corrige o perfil ativo inicial: a cortina é variável, não um elemento fixo.
-- Substitui os objetivos redundantes por um conjunto curto e compatível com a v1.
with target_profiles as (
  select profile.id
  from public.camera_profiles profile
  join public.cameras camera on camera.id = profile.camera_id
  where camera.name = 'Entrada da Loja'
    and profile.is_active
), marker_data as (
  select
    profile.id as profile_id,
    entity.id as entity_id,
    entity.name as entity_name,
    entity.entity_type
  from target_profiles profile
  join public.camera_visual_entities entity
    on entity.camera_profile_id = profile.id
   and entity.primary_operational_marker
   and entity.enabled
)
update public.camera_profiles profile
set environment_description = regexp_replace(
      profile.environment_description,
      'cortina metálica fechada[^.]*\.',
      'cortina metálica principal visível na parte superior; ela é um elemento variável e pode estar aberta, parcialmente aberta ou fechada.',
      'i'
    ),
    monitoring_goals = jsonb_build_array(
      'Registrar entrada, saída e presença de pessoas apenas quando sustentadas pela área visível.',
      'Registrar interações observáveis no balcão e nos terminais de atendimento.',
      'Detectar entrega, retirada, aparecimento, remoção ou movimento de objetos visíveis.',
      'Registrar veículos apenas quando estiverem visualmente presentes no enquadramento, sem leitura de placas.',
      'Determinar o estado visual da cortina principal e registrar abertura, fechamento e estados parciais.',
      'Destacar atividade fora do horário cadastrado e depois de um fechamento visual confirmado.',
      'Preservar unknown quando a imagem não sustentar uma conclusão.'
    ),
    profile_metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            profile.profile_metadata,
            '{fixedElements}',
            coalesce(
              (
                select jsonb_agg(to_jsonb(item.value) order by item.ordinality)
                from jsonb_array_elements_text(
                  coalesce(profile.profile_metadata->'fixedElements', '[]'::jsonb)
                ) with ordinality as item(value, ordinality)
                where item.value not ilike '%cortina%'
                  and item.value not ilike '%portão%'
              ),
              '[]'::jsonb
            ),
            true
          ),
          '{privacyNotes}',
          coalesce(
            (
              select jsonb_agg(to_jsonb(item.value) order by item.ordinality)
              from jsonb_array_elements_text(
                coalesce(profile.profile_metadata->'privacyNotes', '[]'::jsonb)
              ) with ordinality as item(value, ordinality)
              where item.value not ilike '%placa%'
            ),
            '[]'::jsonb
          ),
          true
        ),
        '{statefulElements}',
        jsonb_build_array(
          jsonb_build_object(
            'entityId', marker_data.entity_id,
            'name', marker_data.entity_name,
            'type', marker_data.entity_type,
            'description', 'Elemento variável usado para determinar o estado operacional do estabelecimento.'
          )
        ),
        true
      ),
      '{profileSchemaVersion}',
      '"2.1"'::jsonb,
      true
    ),
    updated_at = now()
from marker_data
where profile.id = marker_data.profile_id;

update public.cameras camera
set visual_state_enabled = true,
    updated_at = now()
where camera.name = 'Entrada da Loja'
  and exists (
    select 1
    from public.camera_visual_entities entity
    where entity.camera_id = camera.id
      and entity.enabled
  );
