-- MonitorIA — Etapa 2
-- Memória curta, continuidade entre eventos e perfis operacionais de funcionários.
-- Requer a Etapa 1 (Motor de Estados Visuais) aplicada antes desta migration.

begin;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'cameras'
      and column_name = 'visual_state_enabled'
  ) then
    raise exception 'monitoria_etapa_1_required';
  end if;
end
$$;

alter table public.cameras
  add column if not exists short_memory_enabled boolean not null default false,
  add column if not exists short_memory_window_minutes integer not null default 15,
  add column if not exists customer_memory_hours integer not null default 12,
  add column if not exists staff_memory_hours integer not null default 18,
  add column if not exists interaction_gap_minutes integer not null default 10,
  add column if not exists continuity_min_similarity numeric(4,3) not null default 0.720,
  add column if not exists staff_match_min_similarity numeric(4,3) not null default 0.740;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_short_memory_window_check'
  ) then
    alter table public.cameras
      add constraint cameras_short_memory_window_check
      check (short_memory_window_minutes between 2 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_customer_memory_hours_check'
  ) then
    alter table public.cameras
      add constraint cameras_customer_memory_hours_check
      check (customer_memory_hours between 1 and 48);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_staff_memory_hours_check'
  ) then
    alter table public.cameras
      add constraint cameras_staff_memory_hours_check
      check (staff_memory_hours between 1 and 48);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_interaction_gap_check'
  ) then
    alter table public.cameras
      add constraint cameras_interaction_gap_check
      check (interaction_gap_minutes between 1 and 120);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_continuity_similarity_check'
  ) then
    alter table public.cameras
      add constraint cameras_continuity_similarity_check
      check (continuity_min_similarity between 0.5 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_staff_similarity_check'
  ) then
    alter table public.cameras
      add constraint cameras_staff_similarity_check
      check (staff_match_min_similarity between 0.5 and 1);
  end if;
end
$$;

comment on column public.cameras.short_memory_enabled is
  'Ativa a memória visual temporária para continuidade e estimativas de pessoas distintas. Não realiza reconhecimento facial.';

comment on column public.cameras.short_memory_window_minutes is
  'Janela máxima normal de continuidade entre aparições de clientes na mesma câmera.';

alter table public.event_people
  add column if not exists appearance jsonb not null default '{}'::jsonb,
  add column if not exists appearance_confidence numeric(5,4) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_people_appearance_object_check'
  ) then
    alter table public.event_people
      add constraint event_people_appearance_object_check
      check (jsonb_typeof(appearance) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_people_appearance_confidence_check'
  ) then
    alter table public.event_people
      add constraint event_people_appearance_confidence_check
      check (appearance_confidence between 0 and 1);
  end if;
end
$$;

comment on column public.event_people.appearance is
  'Descritores visuais não biométricos e temporários: roupa, cabelo, barba, óculos, silhueta ampla e acessórios. Não contém face embedding.';

create table if not exists public.camera_staff_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  label text not null,
  description text not null,
  appearance_signature jsonb not null default '{}'::jsonb,
  zone_ids uuid[] not null default '{}',
  min_similarity numeric(4,3) not null default 0.740,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camera_staff_profiles_signature_check check (
    jsonb_typeof(appearance_signature) = 'object'
  ),
  constraint camera_staff_profiles_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint camera_staff_profiles_similarity_check check (
    min_similarity between 0.5 and 1
  )
);

create unique index if not exists camera_staff_profiles_camera_label_uidx
  on public.camera_staff_profiles(camera_id, lower(label));

create index if not exists camera_staff_profiles_camera_idx
  on public.camera_staff_profiles(camera_id, enabled, sort_order);

comment on table public.camera_staff_profiles is
  'Perfis operacionais aprovados para diferenciar funcionários habituais de clientes. Não armazenam biometria facial nem identidade civil obrigatória.';

create table if not exists public.person_memory_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  staff_profile_id uuid null references public.camera_staff_profiles(id) on delete set null,
  scope text not null,
  probable_role text not null default 'unknown',
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  expires_at timestamptz not null,
  canonical_appearance jsonb not null default '{}'::jsonb,
  appearance_confidence numeric(5,4) not null default 0,
  observation_count integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint person_memory_instances_scope_check check (
    scope in ('visit', 'staff_shift')
  ),
  constraint person_memory_instances_role_check check (
    probable_role in ('staff', 'customer', 'delivery_person', 'visitor', 'unknown')
  ),
  constraint person_memory_instances_appearance_check check (
    jsonb_typeof(canonical_appearance) = 'object'
  ),
  constraint person_memory_instances_confidence_check check (
    appearance_confidence between 0 and 1
  ),
  constraint person_memory_instances_time_check check (
    last_seen_at >= first_seen_at and expires_at >= last_seen_at
  )
);

create index if not exists person_memory_instances_camera_active_idx
  on public.person_memory_instances(camera_id, active, last_seen_at desc);

create index if not exists person_memory_instances_expiry_idx
  on public.person_memory_instances(expires_at)
  where active;

create index if not exists person_memory_instances_staff_idx
  on public.person_memory_instances(staff_profile_id, last_seen_at desc)
  where staff_profile_id is not null;

comment on table public.person_memory_instances is
  'Instâncias temporárias e probabilísticas. Clientes não recebem identidade persistente entre dias; funcionários podem ser associados apenas a um perfil operacional aprovado.';

create table if not exists public.event_person_memory_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  event_person_id uuid not null references public.event_people(id) on delete cascade,
  person_instance_id uuid not null references public.person_memory_instances(id) on delete cascade,
  staff_profile_id uuid null references public.camera_staff_profiles(id) on delete set null,
  link_kind text not null,
  appearance_similarity numeric(5,4) not null default 0,
  continuity_score numeric(5,4) not null default 0,
  gap_seconds numeric not null default 0,
  reasoning jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint event_person_memory_links_kind_check check (
    link_kind in ('new_instance', 'appearance_continuation', 'staff_profile_continuation')
  ),
  constraint event_person_memory_links_similarity_check check (
    appearance_similarity between 0 and 1
    and continuity_score between 0 and 1
  ),
  constraint event_person_memory_links_reasoning_check check (
    jsonb_typeof(reasoning) = 'object'
  )
);

create unique index if not exists event_person_memory_links_person_uidx
  on public.event_person_memory_links(event_person_id);

create index if not exists event_person_memory_links_instance_idx
  on public.event_person_memory_links(person_instance_id, created_at desc);

create index if not exists event_person_memory_links_event_idx
  on public.event_person_memory_links(event_id);

create table if not exists public.interaction_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  kind text not null,
  status text not null default 'open',
  started_at timestamptz not null,
  last_event_at timestamptz not null,
  ended_at timestamptz null,
  primary_customer_instance_id uuid null references public.person_memory_instances(id) on delete set null,
  staff_profile_ids uuid[] not null default '{}',
  event_count integer not null default 1,
  probable_people_count integer not null default 0,
  probable_customer_count integer not null default 0,
  probable_staff_count integer not null default 0,
  confidence numeric(5,4) not null default 0,
  summary text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint interaction_groups_kind_check check (
    kind in ('service', 'visit', 'staff_presence', 'mixed_presence', 'other')
  ),
  constraint interaction_groups_status_check check (
    status in ('open', 'closed')
  ),
  constraint interaction_groups_confidence_check check (
    confidence between 0 and 1
  ),
  constraint interaction_groups_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint interaction_groups_time_check check (
    last_event_at >= started_at
    and (ended_at is null or ended_at >= started_at)
  )
);

create index if not exists interaction_groups_camera_time_idx
  on public.interaction_groups(camera_id, last_event_at desc);

create index if not exists interaction_groups_customer_idx
  on public.interaction_groups(primary_customer_instance_id, last_event_at desc)
  where primary_customer_instance_id is not null;

create table if not exists public.interaction_group_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  interaction_group_id uuid not null references public.interaction_groups(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  is_continuation boolean not null default false,
  continuity_score numeric(5,4) not null default 0,
  gap_seconds numeric not null default 0,
  reasons jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint interaction_group_events_score_check check (
    continuity_score between 0 and 1
  ),
  constraint interaction_group_events_reasons_check check (
    jsonb_typeof(reasons) = 'object'
  )
);

create unique index if not exists interaction_group_events_event_uidx
  on public.interaction_group_events(event_id);

create index if not exists interaction_group_events_group_idx
  on public.interaction_group_events(interaction_group_id, created_at);

alter table public.events
  add column if not exists interaction_group_id uuid null,
  add column if not exists continuation_of_event_id uuid null,
  add column if not exists is_continuation boolean not null default false,
  add column if not exists interaction_event_count integer not null default 1,
  add column if not exists probable_people_count integer not null default 0,
  add column if not exists probable_customer_count integer not null default 0,
  add column if not exists probable_staff_count integer not null default 0,
  add column if not exists continuity_confidence numeric(5,4) not null default 0,
  add column if not exists continuity_summary jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'events_interaction_group_id_fkey'
  ) then
    alter table public.events
      add constraint events_interaction_group_id_fkey
      foreign key (interaction_group_id)
      references public.interaction_groups(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_continuation_of_event_id_fkey'
  ) then
    alter table public.events
      add constraint events_continuation_of_event_id_fkey
      foreign key (continuation_of_event_id)
      references public.events(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_continuity_confidence_check'
  ) then
    alter table public.events
      add constraint events_continuity_confidence_check
      check (continuity_confidence between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'events_continuity_summary_check'
  ) then
    alter table public.events
      add constraint events_continuity_summary_check
      check (jsonb_typeof(continuity_summary) = 'object');
  end if;
end
$$;

create index if not exists events_interaction_group_idx
  on public.events(interaction_group_id, started_at)
  where interaction_group_id is not null;

create index if not exists events_continuation_idx
  on public.events(organization_id, is_continuation, started_at desc);

alter table public.camera_staff_profiles enable row level security;
alter table public.person_memory_instances enable row level security;
alter table public.event_person_memory_links enable row level security;
alter table public.interaction_groups enable row level security;
alter table public.interaction_group_events enable row level security;

drop policy if exists camera_staff_profiles_select on public.camera_staff_profiles;
create policy camera_staff_profiles_select
on public.camera_staff_profiles
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists camera_staff_profiles_manage on public.camera_staff_profiles;
create policy camera_staff_profiles_manage
on public.camera_staff_profiles
for all
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner','admin']::public.organization_role[]
  )
)
with check (
  private.has_org_role(
    organization_id,
    array['owner','admin']::public.organization_role[]
  )
);

drop policy if exists person_memory_instances_select on public.person_memory_instances;
create policy person_memory_instances_select
on public.person_memory_instances
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists event_person_memory_links_select on public.event_person_memory_links;
create policy event_person_memory_links_select
on public.event_person_memory_links
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists interaction_groups_select on public.interaction_groups;
create policy interaction_groups_select
on public.interaction_groups
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists interaction_group_events_select on public.interaction_group_events;
create policy interaction_group_events_select
on public.interaction_group_events
for select
to authenticated
using (private.is_org_member(organization_id));

create or replace function private.monitoria_normalized_appearance_value(
  p_value jsonb,
  p_key text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null
      or jsonb_typeof(p_value) <> 'object'
      or nullif(lower(trim(p_value->>p_key)), '') is null
      or lower(trim(p_value->>p_key)) in ('unknown', 'none', 'not_visible')
    then null
    else lower(trim(p_value->>p_key))
  end;
$$;

create or replace function private.monitoria_appearance_similarity(
  p_left jsonb,
  p_right jsonb
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_weight numeric;
  v_left text;
  v_right text;
  v_total numeric := 0;
  v_match numeric := 0;
  v_left_features text[] := '{}';
  v_right_features text[] := '{}';
  v_feature_overlap integer := 0;
begin
  if jsonb_typeof(coalesce(p_left, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_right, '{}'::jsonb)) <> 'object' then
    return 0;
  end if;

  for v_key, v_weight in
    select *
    from (
      values
        ('upperClothingColor'::text, 0.24::numeric),
        ('lowerClothingColor'::text, 0.14::numeric),
        ('upperClothingType'::text, 0.07::numeric),
        ('lowerClothingType'::text, 0.04::numeric),
        ('hairColor'::text, 0.10::numeric),
        ('hairLength'::text, 0.05::numeric),
        ('facialHair'::text, 0.08::numeric),
        ('eyewear'::text, 0.08::numeric),
        ('bodyBuild'::text, 0.07::numeric),
        ('headwear'::text, 0.05::numeric)
    ) as weights(key_name, weight_value)
  loop
    v_left := private.monitoria_normalized_appearance_value(p_left, v_key);
    v_right := private.monitoria_normalized_appearance_value(p_right, v_key);

    if v_left is not null and v_right is not null then
      v_total := v_total + v_weight;
      if v_left = v_right then
        v_match := v_match + v_weight;
      end if;
    end if;
  end loop;

  if jsonb_typeof(p_left->'distinctiveVisibleFeatures') = 'array'
     and jsonb_typeof(p_right->'distinctiveVisibleFeatures') = 'array' then
    select coalesce(array_agg(distinct lower(trim(value))), '{}')
      into v_left_features
    from jsonb_array_elements_text(p_left->'distinctiveVisibleFeatures')
    where nullif(trim(value), '') is not null;

    select coalesce(array_agg(distinct lower(trim(value))), '{}')
      into v_right_features
    from jsonb_array_elements_text(p_right->'distinctiveVisibleFeatures')
    where nullif(trim(value), '') is not null;

    if cardinality(v_left_features) > 0 and cardinality(v_right_features) > 0 then
      v_total := v_total + 0.08;
      select count(*)
        into v_feature_overlap
      from unnest(v_left_features) item
      where item = any(v_right_features);

      if v_feature_overlap > 0 then
        v_match := v_match + 0.08;
      end if;
    end if;
  end if;

  if v_total < 0.14 then
    return 0;
  end if;

  return greatest(0, least(1, round(v_match / v_total, 4)));
end;
$$;

create or replace function private.monitoria_roles_compatible(
  p_left text,
  p_right text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_left, 'unknown') = 'staff'
      or coalesce(p_right, 'unknown') = 'staff'
      then coalesce(p_left, 'unknown') = coalesce(p_right, 'unknown')
    else true
  end;
$$;

create or replace function public.process_event_continuity_v1(
  p_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_camera public.cameras%rowtype;
  v_person public.event_people%rowtype;
  v_staff_profile_id uuid;
  v_staff_similarity numeric := 0;
  v_instance_id uuid;
  v_instance_similarity numeric := 0;
  v_continuity_score numeric := 0;
  v_gap_seconds numeric := 0;
  v_link_kind text;
  v_expiry timestamptz;
  v_used_instances uuid[] := '{}';
  v_current_instances uuid[] := '{}';
  v_customer_instances uuid[] := '{}';
  v_staff_instances uuid[] := '{}';
  v_staff_profiles uuid[] := '{}';
  v_group_id uuid;
  v_existing_group boolean := false;
  v_previous_event_id uuid;
  v_group_gap_seconds numeric := 0;
  v_group_score numeric := 0;
  v_group_kind text := 'other';
  v_probable_people integer := 0;
  v_probable_customers integer := 0;
  v_probable_staff integer := 0;
  v_event_count integer := 1;
  v_primary_customer uuid;
  v_average_score numeric := 0;
  v_summary jsonb;
begin
  select * into v_event
  from public.events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'event_not_found';
  end if;

  select * into v_camera
  from public.cameras
  where id = v_event.camera_id;

  if not found then
    raise exception 'camera_not_found';
  end if;

  if not v_camera.short_memory_enabled then
    return jsonb_build_object(
      'enabled', false,
      'eventId', v_event.id
    );
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_event.camera_id::text || ':short-memory', 0)
  );

  update public.person_memory_instances
  set active = false,
      updated_at = now()
  where camera_id = v_event.camera_id
    and active
    and expires_at < v_event.started_at;

  update public.interaction_groups
  set status = 'closed',
      ended_at = last_event_at,
      updated_at = now()
  where camera_id = v_event.camera_id
    and status = 'open'
    and last_event_at < v_event.started_at
      - pg_catalog.make_interval(
          mins => greatest(1, v_camera.interaction_gap_minutes)
        );

  for v_person in
    select *
    from public.event_people
    where event_id = v_event.id
    order by created_at, id
  loop
    v_staff_profile_id := null;
    v_staff_similarity := 0;
    v_instance_id := null;
    v_instance_similarity := 0;
    v_continuity_score := 0;
    v_gap_seconds := 0;
    v_link_kind := 'new_instance';

    if v_person.role in ('staff', 'unknown') then
      select profile.id,
             private.monitoria_appearance_similarity(
               v_person.appearance,
               profile.appearance_signature
             )
        into v_staff_profile_id, v_staff_similarity
      from public.camera_staff_profiles profile
      where profile.organization_id = v_event.organization_id
        and profile.camera_id = v_event.camera_id
        and profile.enabled
        and (
          v_person.role = 'staff'
          or cardinality(profile.zone_ids) = 0
          or v_person.zone_ids && profile.zone_ids
        )
        and private.monitoria_appearance_similarity(
          v_person.appearance,
          profile.appearance_signature
        ) >= greatest(
          profile.min_similarity,
          v_camera.staff_match_min_similarity
        )
      order by private.monitoria_appearance_similarity(
        v_person.appearance,
        profile.appearance_signature
      ) desc,
      profile.sort_order
      limit 1;
    end if;

    if v_staff_profile_id is not null then
      select instance.id,
             private.monitoria_appearance_similarity(
               v_person.appearance,
               instance.canonical_appearance
             ),
             greatest(
               0,
               pg_catalog.date_part(
                 'epoch',
                 v_event.started_at - instance.last_seen_at
               )
             )
        into v_instance_id, v_instance_similarity, v_gap_seconds
      from public.person_memory_instances instance
      where instance.camera_id = v_event.camera_id
        and instance.active
        and instance.staff_profile_id = v_staff_profile_id
        and instance.last_seen_at >= v_event.started_at
          - pg_catalog.make_interval(
              hours => greatest(1, v_camera.staff_memory_hours)
            )
        and not (instance.id = any(v_used_instances))
      order by instance.last_seen_at desc
      limit 1;

      if v_instance_id is not null then
        v_continuity_score := greatest(
          v_staff_similarity,
          0.82 * v_instance_similarity
          + 0.18 * greatest(
              0,
              1 - (
                v_gap_seconds
                / greatest(60, v_camera.staff_memory_hours * 3600)
              )
            )
        );
        v_link_kind := 'staff_profile_continuation';
      end if;
    end if;

    if v_instance_id is null then
      select candidate.id,
             candidate.similarity,
             candidate.gap_seconds,
             candidate.score
        into v_instance_id,
             v_instance_similarity,
             v_gap_seconds,
             v_continuity_score
      from (
        select instance.id,
               private.monitoria_appearance_similarity(
                 v_person.appearance,
                 instance.canonical_appearance
               ) as similarity,
               greatest(
                 0,
                 pg_catalog.date_part(
                   'epoch',
                   v_event.started_at - instance.last_seen_at
                 )
               ) as gap_seconds,
               (
                 0.84 * private.monitoria_appearance_similarity(
                   v_person.appearance,
                   instance.canonical_appearance
                 )
                 + 0.16 * greatest(
                     0,
                     1 - (
                       greatest(
                         0,
                         pg_catalog.date_part(
                           'epoch',
                           v_event.started_at - instance.last_seen_at
                         )
                       )
                       / greatest(
                           60,
                           v_camera.short_memory_window_minutes * 60
                         )
                     )
                   )
               ) as score
        from public.person_memory_instances instance
        where instance.camera_id = v_event.camera_id
          and instance.active
          and instance.last_seen_at >= v_event.started_at
            - pg_catalog.make_interval(
                mins => greatest(2, v_camera.short_memory_window_minutes)
              )
          and private.monitoria_roles_compatible(
            v_person.role,
            instance.probable_role
          )
          and not (instance.id = any(v_used_instances))
      ) candidate
      where candidate.similarity >= v_camera.continuity_min_similarity
        and candidate.score >= v_camera.continuity_min_similarity
      order by candidate.score desc, candidate.gap_seconds asc
      limit 1;

      if v_instance_id is not null then
        v_link_kind := 'appearance_continuation';
      end if;
    end if;

    if v_instance_id is null then
      v_expiry := v_event.started_at
        + pg_catalog.make_interval(
            hours => case
              when v_staff_profile_id is not null or v_person.role = 'staff'
                then greatest(1, v_camera.staff_memory_hours)
              else greatest(1, v_camera.customer_memory_hours)
            end
          );

      insert into public.person_memory_instances (
        organization_id,
        site_id,
        camera_id,
        staff_profile_id,
        scope,
        probable_role,
        first_seen_at,
        last_seen_at,
        expires_at,
        canonical_appearance,
        appearance_confidence,
        observation_count,
        active
      ) values (
        v_event.organization_id,
        v_event.site_id,
        v_event.camera_id,
        v_staff_profile_id,
        case
          when v_staff_profile_id is not null or v_person.role = 'staff'
            then 'staff_shift'
          else 'visit'
        end,
        case
          when v_staff_profile_id is not null then 'staff'
          else coalesce(v_person.role, 'unknown')
        end,
        v_event.started_at,
        v_event.ended_at,
        v_expiry,
        v_person.appearance,
        v_person.appearance_confidence,
        1,
        true
      )
      returning id into v_instance_id;

      v_instance_similarity := 1;
      v_continuity_score := greatest(
        0.55,
        v_person.appearance_confidence
      );
      v_gap_seconds := 0;
      v_link_kind := 'new_instance';
    else
      v_expiry := v_event.ended_at
        + pg_catalog.make_interval(
            hours => case
              when v_staff_profile_id is not null or v_person.role = 'staff'
                then greatest(1, v_camera.staff_memory_hours)
              else greatest(1, v_camera.customer_memory_hours)
            end
          );

      update public.person_memory_instances
      set staff_profile_id = coalesce(
            person_memory_instances.staff_profile_id,
            v_staff_profile_id
          ),
          probable_role = case
            when v_staff_profile_id is not null then 'staff'
            when person_memory_instances.probable_role = 'unknown'
              then coalesce(v_person.role, 'unknown')
            else person_memory_instances.probable_role
          end,
          last_seen_at = greatest(last_seen_at, v_event.ended_at),
          expires_at = greatest(expires_at, v_expiry),
          canonical_appearance = case
            when v_person.appearance_confidence >= appearance_confidence
              then v_person.appearance
            else canonical_appearance
          end,
          appearance_confidence = greatest(
            appearance_confidence,
            v_person.appearance_confidence
          ),
          observation_count = observation_count + 1,
          active = true,
          updated_at = now()
      where id = v_instance_id;
    end if;

    insert into public.event_person_memory_links (
      organization_id,
      event_id,
      event_person_id,
      person_instance_id,
      staff_profile_id,
      link_kind,
      appearance_similarity,
      continuity_score,
      gap_seconds,
      reasoning
    ) values (
      v_event.organization_id,
      v_event.id,
      v_person.id,
      v_instance_id,
      v_staff_profile_id,
      v_link_kind,
      greatest(0, least(1, coalesce(v_instance_similarity, 0))),
      greatest(0, least(1, coalesce(v_continuity_score, 0))),
      greatest(0, coalesce(v_gap_seconds, 0)),
      jsonb_build_object(
        'role', v_person.role,
        'staffProfileSimilarity', v_staff_similarity,
        'appearanceConfidence', v_person.appearance_confidence,
        'privacyScope', case
          when v_staff_profile_id is not null then 'approved_staff_profile'
          else 'temporary_visit_instance'
        end
      )
    )
    on conflict (event_person_id) do update
    set person_instance_id = excluded.person_instance_id,
        staff_profile_id = excluded.staff_profile_id,
        link_kind = excluded.link_kind,
        appearance_similarity = excluded.appearance_similarity,
        continuity_score = excluded.continuity_score,
        gap_seconds = excluded.gap_seconds,
        reasoning = excluded.reasoning;

    v_used_instances := array_append(v_used_instances, v_instance_id);
    v_current_instances := array_append(v_current_instances, v_instance_id);

    if v_staff_profile_id is not null or v_person.role = 'staff' then
      v_staff_instances := array_append(v_staff_instances, v_instance_id);
      if v_staff_profile_id is not null then
        v_staff_profiles := array_append(v_staff_profiles, v_staff_profile_id);
      end if;
    else
      v_customer_instances := array_append(v_customer_instances, v_instance_id);
      if v_primary_customer is null then
        v_primary_customer := v_instance_id;
      end if;
    end if;
  end loop;

  select array_agg(distinct item) filter (where item is not null)
    into v_current_instances
  from unnest(coalesce(v_current_instances, '{}'::uuid[])) item;

  select array_agg(distinct item) filter (where item is not null)
    into v_customer_instances
  from unnest(coalesce(v_customer_instances, '{}'::uuid[])) item;

  select array_agg(distinct item) filter (where item is not null)
    into v_staff_instances
  from unnest(coalesce(v_staff_instances, '{}'::uuid[])) item;

  select array_agg(distinct item) filter (where item is not null)
    into v_staff_profiles
  from unnest(coalesce(v_staff_profiles, '{}'::uuid[])) item;

  v_current_instances := coalesce(v_current_instances, '{}'::uuid[]);
  v_customer_instances := coalesce(v_customer_instances, '{}'::uuid[]);
  v_staff_instances := coalesce(v_staff_instances, '{}'::uuid[]);
  v_staff_profiles := coalesce(v_staff_profiles, '{}'::uuid[]);
  v_primary_customer := coalesce(v_primary_customer, v_customer_instances[1]);

  if cardinality(v_customer_instances) > 0 and cardinality(v_staff_instances) > 0 then
    v_group_kind := 'service';
  elsif cardinality(v_customer_instances) > 0 then
    v_group_kind := 'visit';
  elsif cardinality(v_staff_instances) > 0 then
    v_group_kind := 'staff_presence';
  elsif cardinality(v_current_instances) > 1 then
    v_group_kind := 'mixed_presence';
  else
    v_group_kind := 'other';
  end if;

  select group_row.id,
         greatest(
           0,
           pg_catalog.date_part(
             'epoch',
             v_event.started_at - group_row.last_event_at
           )
         )
    into v_group_id, v_group_gap_seconds
  from public.interaction_groups group_row
  where group_row.organization_id = v_event.organization_id
    and group_row.camera_id = v_event.camera_id
    and group_row.status = 'open'
    and group_row.last_event_at >= v_event.started_at
      - pg_catalog.make_interval(
          mins => greatest(1, v_camera.interaction_gap_minutes)
        )
    and (
      (
        v_primary_customer is not null
        and group_row.primary_customer_instance_id = v_primary_customer
      )
      or (
        v_primary_customer is null
        and cardinality(v_staff_profiles) > 0
        and group_row.staff_profile_ids && v_staff_profiles
      )
    )
  order by group_row.last_event_at desc
  limit 1;

  if v_group_id is not null then
    v_existing_group := true;

    select event_id into v_previous_event_id
    from public.interaction_group_events
    where interaction_group_id = v_group_id
    order by created_at desc
    limit 1;

    select coalesce(avg(link.continuity_score), 0)
      into v_average_score
    from public.event_person_memory_links link
    where link.event_id = v_event.id;

    v_group_score := greatest(
      0,
      least(
        1,
        0.82 * v_average_score
        + 0.18 * greatest(
            0,
            1 - (
              v_group_gap_seconds
              / greatest(60, v_camera.interaction_gap_minutes * 60)
            )
          )
      )
    );

    update public.interaction_groups
    set last_event_at = greatest(last_event_at, v_event.ended_at),
        kind = case
          when interaction_groups.kind = 'service' then 'service'
          when v_group_kind = 'service' then 'service'
          else interaction_groups.kind
        end,
        staff_profile_ids = (
          select coalesce(array_agg(distinct item), '{}')
          from unnest(
            coalesce(interaction_groups.staff_profile_ids, '{}')
            || v_staff_profiles
          ) item
        ),
        confidence = greatest(confidence, v_group_score),
        updated_at = now()
    where id = v_group_id;
  else
    select coalesce(avg(link.continuity_score), 0)
      into v_average_score
    from public.event_person_memory_links link
    where link.event_id = v_event.id;

    v_group_score := greatest(0.5, v_average_score);

    insert into public.interaction_groups (
      organization_id,
      site_id,
      camera_id,
      kind,
      status,
      started_at,
      last_event_at,
      primary_customer_instance_id,
      staff_profile_ids,
      event_count,
      probable_people_count,
      probable_customer_count,
      probable_staff_count,
      confidence,
      summary,
      metadata
    ) values (
      v_event.organization_id,
      v_event.site_id,
      v_event.camera_id,
      v_group_kind,
      'open',
      v_event.started_at,
      v_event.ended_at,
      v_primary_customer,
      v_staff_profiles,
      1,
      cardinality(v_current_instances),
      cardinality(v_customer_instances),
      cardinality(v_staff_instances),
      v_group_score,
      '',
      jsonb_build_object(
        'privacy', 'temporary_non_biometric_memory',
        'firstEventId', v_event.id
      )
    )
    returning id into v_group_id;
  end if;

  insert into public.interaction_group_events (
    organization_id,
    interaction_group_id,
    event_id,
    is_continuation,
    continuity_score,
    gap_seconds,
    reasons
  ) values (
    v_event.organization_id,
    v_group_id,
    v_event.id,
    v_existing_group,
    v_group_score,
    greatest(0, coalesce(v_group_gap_seconds, 0)),
    jsonb_build_object(
      'sharedCustomerInstance', v_primary_customer,
      'staffProfiles', to_jsonb(v_staff_profiles),
      'eventPersonInstances', to_jsonb(v_current_instances)
    )
  )
  on conflict (event_id) do update
  set interaction_group_id = excluded.interaction_group_id,
      is_continuation = excluded.is_continuation,
      continuity_score = excluded.continuity_score,
      gap_seconds = excluded.gap_seconds,
      reasons = excluded.reasons;

  select count(*)::integer
    into v_event_count
  from public.interaction_group_events
  where interaction_group_id = v_group_id;

  select count(distinct link.person_instance_id)::integer,
         count(distinct link.person_instance_id) filter (
           where coalesce(person.staff_profile_id is not null, false)
              or person.probable_role = 'staff'
         )::integer,
         count(distinct link.person_instance_id) filter (
           where person.staff_profile_id is null
             and person.probable_role <> 'staff'
         )::integer
    into v_probable_people,
         v_probable_staff,
         v_probable_customers
  from public.interaction_group_events group_event
  join public.event_person_memory_links link
    on link.event_id = group_event.event_id
  join public.person_memory_instances person
    on person.id = link.person_instance_id
  where group_event.interaction_group_id = v_group_id;

  v_summary := jsonb_build_object(
    'interactionGroupId', v_group_id,
    'isContinuation', v_existing_group,
    'continuationOfEventId', v_previous_event_id,
    'interactionEventCount', v_event_count,
    'probablePeopleCount', coalesce(v_probable_people, 0),
    'probableCustomerCount', coalesce(v_probable_customers, 0),
    'probableStaffCount', coalesce(v_probable_staff, 0),
    'confidence', v_group_score,
    'method', 'temporary_non_biometric_appearance_and_context'
  );

  update public.interaction_groups
  set event_count = v_event_count,
      probable_people_count = coalesce(v_probable_people, 0),
      probable_customer_count = coalesce(v_probable_customers, 0),
      probable_staff_count = coalesce(v_probable_staff, 0),
      summary = case
        when coalesce(v_probable_customers, 0) > 0
          and coalesce(v_probable_staff, 0) > 0
          then format(
            '%s cliente(s) provável(is) em %s capítulo(s), com %s funcionário(s) provável(is).',
            v_probable_customers,
            v_event_count,
            v_probable_staff
          )
        when coalesce(v_probable_customers, 0) > 0
          then format(
            '%s cliente(s) provável(is) em %s capítulo(s).',
            v_probable_customers,
            v_event_count
          )
        else format(
          '%s pessoa(s) provável(is) em %s capítulo(s).',
          v_probable_people,
          v_event_count
        )
      end,
      updated_at = now()
  where id = v_group_id;

  update public.events event_row
  set interaction_group_id = v_group_id,
      interaction_event_count = v_event_count,
      probable_people_count = coalesce(v_probable_people, 0),
      probable_customer_count = coalesce(v_probable_customers, 0),
      probable_staff_count = coalesce(v_probable_staff, 0),
      continuity_summary = jsonb_build_object(
        'interactionGroupId', v_group_id,
        'interactionEventCount', v_event_count,
        'probablePeopleCount', coalesce(v_probable_people, 0),
        'probableCustomerCount', coalesce(v_probable_customers, 0),
        'probableStaffCount', coalesce(v_probable_staff, 0),
        'method', 'temporary_non_biometric_appearance_and_context'
      ),
      updated_at = now()
  where event_row.id in (
    select group_event.event_id
    from public.interaction_group_events group_event
    where group_event.interaction_group_id = v_group_id
  );

  update public.events
  set is_continuation = v_existing_group,
      continuation_of_event_id = v_previous_event_id,
      continuity_confidence = v_group_score,
      continuity_summary = v_summary,
      updated_at = now()
  where id = v_event.id;

  return jsonb_build_object(
    'enabled', true,
    'eventId', v_event.id,
    'interactionGroupId', v_group_id,
    'isContinuation', v_existing_group,
    'continuationOfEventId', v_previous_event_id,
    'interactionEventCount', v_event_count,
    'probablePeopleCount', coalesce(v_probable_people, 0),
    'probableCustomerCount', coalesce(v_probable_customers, 0),
    'probableStaffCount', coalesce(v_probable_staff, 0),
    'confidence', v_group_score
  );
end;
$$;

revoke all on function public.process_event_continuity_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.process_event_continuity_v1(uuid)
  to service_role;

create or replace function public.assistant_continuity_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with selected_events as (
    select event.*
    from public.events event
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.started_at >= p_from
      and event.started_at < p_to
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
  ),
  selected_groups as (
    select distinct group_row.*
    from public.interaction_groups group_row
    join selected_events event
      on event.interaction_group_id = group_row.id
  ),
  selected_links as (
    select distinct link.person_instance_id,
           instance.probable_role,
           instance.staff_profile_id
    from selected_events event
    join public.event_person_memory_links link
      on link.event_id = event.id
    join public.person_memory_instances instance
      on instance.id = link.person_instance_id
  ),
  group_payload as (
    select jsonb_agg(
      jsonb_build_object(
        'id', group_row.id,
        'kind', group_row.kind,
        'status', group_row.status,
        'startedAt', group_row.started_at,
        'lastEventAt', group_row.last_event_at,
        'durationSeconds', greatest(
          0,
          pg_catalog.date_part(
            'epoch',
            group_row.last_event_at - group_row.started_at
          )
        ),
        'eventCount', group_row.event_count,
        'probablePeopleCount', group_row.probable_people_count,
        'probableCustomerCount', group_row.probable_customer_count,
        'probableStaffCount', group_row.probable_staff_count,
        'confidence', group_row.confidence,
        'summary', group_row.summary,
        'evidenceEventIds', (
          select coalesce(jsonb_agg(group_event.event_id order by event.started_at), '[]'::jsonb)
          from public.interaction_group_events group_event
          join public.events event on event.id = group_event.event_id
          where group_event.interaction_group_id = group_row.id
        )
      )
      order by group_row.started_at desc
    ) as value
    from (
      select *
      from selected_groups
      order by started_at desc
      limit 30
    ) group_row
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'eventCount', (select count(*) from selected_events),
    'continuedEventCount', (
      select count(*) from selected_events where is_continuation
    ),
    'interactionGroupCount', (select count(*) from selected_groups),
    'probableDistinctPeople', (select count(*) from selected_links),
    'probableCustomers', (
      select count(*) from selected_links
      where staff_profile_id is null and probable_role <> 'staff'
    ),
    'probableStaffInstances', (
      select count(*) from selected_links
      where staff_profile_id is not null or probable_role = 'staff'
    ),
    'knownStaffProfilesObserved', (
      select count(distinct staff_profile_id)
      from selected_links
      where staff_profile_id is not null
    ),
    'groups', coalesce((select value from group_payload), '[]'::jsonb),
    'definitions', jsonb_build_object(
      'probableDistinctPeople', 'Estimativa temporária baseada em aparência não biométrica, posição e proximidade temporal.',
      'interactionGroup', 'Conjunto de capítulos que provavelmente pertencem à mesma visita ou atendimento.',
      'customerPrivacy', 'Instâncias de clientes expiram e não representam identidade permanente entre dias.',
      'staffProfile', 'Perfil operacional aprovado; não é reconhecimento facial.'
    )
  )
  where private.is_org_member(p_organization_id);
$$;

revoke all on function public.assistant_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;
grant execute on function public.assistant_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

create or replace function public.purge_expired_short_memory_v1(
  p_limit integer default 1000
)
returns table(instances_deleted bigint, groups_closed bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1000), 5000));
  v_instances bigint := 0;
  v_groups bigint := 0;
begin
  update public.person_memory_instances
  set active = false,
      updated_at = now()
  where active and expires_at < now();

  update public.interaction_groups
  set status = 'closed',
      ended_at = last_event_at,
      updated_at = now()
  where status = 'open'
    and last_event_at < now() - interval '2 hours';
  get diagnostics v_groups = row_count;

  delete from public.person_memory_instances instance
  where instance.id in (
    select candidate.id
    from public.person_memory_instances candidate
    where not candidate.active
      and candidate.expires_at < now() - interval '2 days'
      and candidate.staff_profile_id is null
    order by candidate.expires_at
    limit v_limit
  );
  get diagnostics v_instances = row_count;

  return query select v_instances, v_groups;
end;
$$;

revoke all on function public.purge_expired_short_memory_v1(integer)
  from public, anon, authenticated;
grant execute on function public.purge_expired_short_memory_v1(integer)
  to service_role;

-- Atualiza a pesquisa de eventos para expor continuidade e estimativas.
drop function if exists public.search_monitoria_events(
  uuid,
  text,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  text,
  numeric,
  text,
  boolean,
  boolean,
  integer,
  integer
);

create function public.search_monitoria_events(
  p_organization_id uuid,
  p_query text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_camera_id uuid default null,
  p_site_id uuid default null,
  p_event_type text default null,
  p_min_confidence numeric default null,
  p_review_filter text default 'all',
  p_has_people boolean default null,
  p_has_vehicles boolean default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  camera_id uuid,
  camera_name text,
  site_id uuid,
  site_name text,
  headline text,
  event_type text,
  original_event_type text,
  summary text,
  confidence numeric,
  requires_review boolean,
  review_status public.review_status,
  human_verdict text,
  human_reviewed_at timestamptz,
  tags text[],
  people_count bigint,
  vehicle_count bigint,
  interaction_group_id uuid,
  is_continuation boolean,
  interaction_event_count integer,
  probable_people_count integer,
  probable_customer_count integer,
  probable_staff_count integer,
  continuity_confidence numeric,
  thumbnail_asset_id uuid,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select
      event.id,
      event.started_at,
      event.ended_at,
      pg_catalog.date_part(
        'epoch',
        event.ended_at - event.started_at
      )::numeric as duration_seconds,
      event.camera_id,
      camera.name as camera_name,
      event.site_id,
      site.name as site_name,
      event.headline,
      coalesce(
        event.corrected_event_type,
        event.primary_event_type
      ) as event_type,
      event.primary_event_type as original_event_type,
      event.summary,
      event.confidence,
      event.requires_review,
      event.review_status,
      event.human_verdict,
      event.human_reviewed_at,
      event.tags,
      (
        select pg_catalog.count(*)
        from public.event_people person
        where person.event_id = event.id
      ) as people_count,
      (
        select pg_catalog.count(*)
        from public.event_vehicles vehicle
        where vehicle.event_id = event.id
      ) as vehicle_count,
      event.interaction_group_id,
      event.is_continuation,
      event.interaction_event_count,
      event.probable_people_count,
      event.probable_customer_count,
      event.probable_staff_count,
      event.continuity_confidence,
      (
        select asset.id
        from public.storage_assets asset
        where asset.event_id = event.id
          and asset.status = 'ready'::public.asset_status
          and asset.deleted_at is null
        order by
          case
            when asset.storage_path like '%/peak.jpg' then 0
            when asset.storage_path like '%/start.jpg' then 1
            when asset.storage_path like '%/end.jpg' then 2
            else 3
          end,
          asset.captured_at
        limit 1
      ) as thumbnail_asset_id
    from public.events event
    join public.cameras camera
      on camera.id = event.camera_id
    join public.sites site
      on site.id = event.site_id
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and private.is_org_member(p_organization_id)
      and (p_from is null or event.started_at >= p_from)
      and (p_to is null or event.started_at < p_to)
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
      and (
        nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
        or coalesce(event.corrected_event_type, event.primary_event_type) = p_event_type
      )
      and (p_min_confidence is null or event.confidence >= p_min_confidence)
      and (
        coalesce(p_review_filter, 'all') = 'all'
        or (p_review_filter = 'pending' and event.review_status = 'pending'::public.review_status)
        or (p_review_filter = 'required' and event.requires_review)
        or (p_review_filter = 'reviewed' and event.human_reviewed_at is not null)
        or event.human_verdict = p_review_filter
      )
      and (
        p_has_people is null
        or p_has_people = exists (
          select 1 from public.event_people person where person.event_id = event.id
        )
      )
      and (
        p_has_vehicles is null
        or p_has_vehicles = exists (
          select 1 from public.event_vehicles vehicle where vehicle.event_id = event.id
        )
      )
      and (
        nullif(pg_catalog.btrim(coalesce(p_query, '')), '') is null
        or event.search_document @@ pg_catalog.websearch_to_tsquery(
          'portuguese'::regconfig,
          pg_catalog.btrim(p_query)
        )
        or event.headline ilike '%' || pg_catalog.btrim(p_query) || '%'
        or event.summary ilike '%' || pg_catalog.btrim(p_query) || '%'
      )
  )
  select filtered.*,
         pg_catalog.count(*) over() as total_count
  from filtered
  order by filtered.started_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
) from public, anon;
grant execute on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text,
  numeric, text, boolean, boolean, integer, integer
) to authenticated, service_role;

-- Configuração inicial para a câmera atual.
update public.cameras camera
set short_memory_enabled = true,
    short_memory_window_minutes = 15,
    customer_memory_hours = 12,
    staff_memory_hours = 18,
    interaction_gap_minutes = 10,
    continuity_min_similarity = 0.720,
    staff_match_min_similarity = 0.740,
    updated_at = now()
where camera.name = 'Entrada da Loja';

with target_camera as (
  select camera.id as camera_id,
         camera.organization_id
  from public.cameras camera
  where camera.name = 'Entrada da Loja'
  order by camera.created_at
  limit 1
),
staff_zones as (
  select target.camera_id,
         target.organization_id,
         coalesce(array_agg(zone.id) filter (
           where zone.person_role_hint = 'staff'
         ), '{}') as zone_ids
  from target_camera target
  left join public.camera_profiles profile
    on profile.camera_id = target.camera_id
   and profile.is_active
  left join public.camera_zones zone
    on zone.camera_profile_id = profile.id
  group by target.camera_id, target.organization_id
)
insert into public.camera_staff_profiles (
  organization_id,
  camera_id,
  label,
  description,
  appearance_signature,
  zone_ids,
  min_similarity,
  enabled,
  sort_order,
  metadata
)
select organization_id,
       camera_id,
       'Funcionário provável A',
       'Perfil operacional aprovado: porte visual magro e uso frequente de óculos. Confirmar sempre pela posição atrás do balcão e pela atividade de trabalho; não usar rosto ou tom de pele.',
       jsonb_build_object(
         'bodyBuild', 'slim',
         'eyewear', 'glasses'
       ),
       zone_ids,
       0.740,
       true,
       0,
       jsonb_build_object(
         'source', 'manual_description_2026-08-01',
         'containsBiometrics', false
       )
from staff_zones
on conflict (camera_id, (lower(label))) do update
set description = excluded.description,
    appearance_signature = excluded.appearance_signature,
    zone_ids = excluded.zone_ids,
    min_similarity = excluded.min_similarity,
    enabled = true,
    metadata = excluded.metadata,
    updated_at = now();

with target_camera as (
  select camera.id as camera_id,
         camera.organization_id
  from public.cameras camera
  where camera.name = 'Entrada da Loja'
  order by camera.created_at
  limit 1
),
staff_zones as (
  select target.camera_id,
         target.organization_id,
         coalesce(array_agg(zone.id) filter (
           where zone.person_role_hint = 'staff'
         ), '{}') as zone_ids
  from target_camera target
  left join public.camera_profiles profile
    on profile.camera_id = target.camera_id
   and profile.is_active
  left join public.camera_zones zone
    on zone.camera_profile_id = profile.id
  group by target.camera_id, target.organization_id
)
insert into public.camera_staff_profiles (
  organization_id,
  camera_id,
  label,
  description,
  appearance_signature,
  zone_ids,
  min_similarity,
  enabled,
  sort_order,
  metadata
)
select organization_id,
       camera_id,
       'Funcionário provável B',
       'Perfil operacional aprovado: porte visual robusto, cabelo branco e barba branca. Confirmar sempre pela posição e atividade; não usar geometria facial.',
       jsonb_build_object(
         'bodyBuild', 'robust',
         'hairColor', 'white',
         'facialHair', 'beard'
       ),
       zone_ids,
       0.740,
       true,
       1,
       jsonb_build_object(
         'source', 'manual_description_2026-08-01',
         'containsBiometrics', false
       )
from staff_zones
on conflict (camera_id, (lower(label))) do update
set description = excluded.description,
    appearance_signature = excluded.appearance_signature,
    zone_ids = excluded.zone_ids,
    min_similarity = excluded.min_similarity,
    enabled = true,
    metadata = excluded.metadata,
    updated_at = now();

commit;
