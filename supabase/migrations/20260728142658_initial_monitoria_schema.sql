-- MonitorIA - schema inicial
-- Execute em um projeto Supabase novo.

create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.organization_role as enum ('owner', 'admin', 'operator', 'viewer');
create type public.camera_status as enum ('pending', 'online', 'offline', 'disabled', 'error');
create type public.agent_status as enum ('pending', 'online', 'offline', 'disabled', 'error');
create type public.analysis_job_status as enum ('queued', 'processing', 'completed', 'failed', 'cancelled');
create type public.asset_kind as enum ('analysis_frame', 'event_keyframe', 'preserved_clip');
create type public.asset_status as enum ('pending', 'ready', 'deleted', 'failed');
create type public.review_status as enum ('not_required', 'pending', 'confirmed', 'rejected');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  plan_code text not null default 'basic',
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.retention_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  temporary_frame_days smallint not null default 3 check (temporary_frame_days between 1 and 30),
  keyframe_days smallint not null default 365 check (keyframe_days between 1 and 3650),
  metadata_days smallint not null default 365 check (metadata_days between 1 and 3650),
  preserved_clip_days smallint check (preserved_clip_days is null or preserved_clip_days between 1 and 3650),
  updated_at timestamptz not null default now()
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  timezone text not null default 'America/Sao_Paulo',
  address jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cameras (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  status public.camera_status not null default 'pending',
  stream_label text,
  capture_interval_seconds numeric(8,3) not null default 1 check (capture_interval_seconds between 0.2 and 3600),
  consolidation_interval_seconds integer not null default 60 check (consolidation_interval_seconds between 1 and 3600),
  motion_start_threshold numeric(8,4) not null default 1.0 check (motion_start_threshold >= 0),
  motion_continue_threshold numeric(8,4) not null default 0.25 check (motion_continue_threshold >= 0),
  event_close_after_seconds integer not null default 30 check (event_close_after_seconds between 1 and 3600),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (site_id, id)
);

create table public.camera_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  version integer not null check (version > 0),
  environment_description text not null,
  monitoring_goals jsonb not null default '[]'::jsonb,
  ignore_instructions jsonb not null default '[]'::jsonb,
  is_active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (camera_id, version)
);

create unique index camera_profiles_one_active_idx
  on public.camera_profiles(camera_id)
  where is_active;

create table public.camera_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_profile_id uuid not null references public.camera_profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  zone_type text not null check (zone_type in ('entry', 'exit', 'service', 'restricted', 'ignore', 'general')),
  polygon jsonb not null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  status public.agent_status not null default 'pending',
  version text,
  platform text,
  architecture text,
  agent_token_hash text,
  last_heartbeat_at timestamptz,
  last_ip inet,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_cameras (
  agent_id uuid not null references public.agents(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  encrypted_rtsp_config text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (agent_id, camera_id)
);

create table public.agent_health (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  status public.agent_status not null,
  cpu_percent numeric(6,3),
  memory_bytes bigint,
  disk_free_bytes bigint,
  queued_events integer not null default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table public.capture_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  ended_reason text,
  frames_observed bigint not null default 0,
  events_created bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  capture_session_id uuid references public.capture_sessions(id) on delete set null,
  status public.analysis_job_status not null default 'queued',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  profile_id uuid not null references public.camera_profiles(id) on delete restrict,
  profile_version integer not null,
  local_metrics jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  prompt_version integer not null default 1,
  response_id text,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  attempt_count smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  analysis_job_id uuid unique references public.analysis_jobs(id) on delete set null,
  profile_id uuid not null references public.camera_profiles(id) on delete restrict,
  profile_version integer not null,
  schema_version text not null default '1.0',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  primary_event_type text not null,
  summary text not null,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  requires_review boolean not null default false,
  review_status public.review_status not null default 'not_required',
  review_reasons jsonb not null default '[]'::jsonb,
  zone_ids uuid[] not null default '{}',
  tags text[] not null default '{}',
  analyzed_payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at >= started_at)
);

create table public.event_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  local_track_id text,
  upper_clothing_color text,
  lower_clothing_color text,
  accessories text[] not null default '{}',
  carrying text[] not null default '{}',
  zone_ids uuid[] not null default '{}',
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.event_vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  local_track_id text,
  vehicle_type text not null,
  color text,
  zone_ids uuid[] not null default '{}',
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create table public.event_plate_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_vehicle_id uuid not null references public.event_vehicles(id) on delete cascade,
  suggested_text text,
  normalized_text text generated always as (upper(regexp_replace(coalesce(suggested_text, ''), '[^A-Za-z0-9]', '', 'g'))) stored,
  confidence numeric(5,4) not null check (confidence between 0 and 1),
  visibility text not null check (visibility in ('clear', 'partial', 'blurred', 'too_small', 'not_visible')),
  status text not null default 'suggestion' check (status = 'suggestion'),
  created_at timestamptz not null default now()
);

create table public.storage_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  analysis_job_id uuid references public.analysis_jobs(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  kind public.asset_kind not null,
  status public.asset_status not null default 'pending',
  bucket text not null,
  storage_path text not null,
  mime_type text not null,
  byte_size bigint,
  width integer,
  height integer,
  captured_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (bucket, storage_path)
);

create table public.event_embeddings (
  event_id uuid primary key references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model text not null,
  dimensions integer not null,
  embedding vector,
  created_at timestamptz not null default now()
);

create table public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid references public.cameras(id) on delete set null,
  analysis_job_id uuid references public.analysis_jobs(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(14,8),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index organization_members_user_idx on public.organization_members(user_id);
create index sites_org_idx on public.sites(organization_id);
create index cameras_org_site_idx on public.cameras(organization_id, site_id);
create index cameras_status_idx on public.cameras(status, last_seen_at);
create index camera_profiles_camera_idx on public.camera_profiles(camera_id, version desc);
create index camera_zones_profile_idx on public.camera_zones(camera_profile_id);
create index agents_org_site_idx on public.agents(organization_id, site_id);
create index agent_health_agent_time_idx on public.agent_health(agent_id, recorded_at desc);
create index capture_sessions_camera_time_idx on public.capture_sessions(camera_id, started_at desc);
create index analysis_jobs_status_idx on public.analysis_jobs(status, created_at);
create index analysis_jobs_camera_time_idx on public.analysis_jobs(camera_id, started_at desc);
create index events_camera_time_idx on public.events(camera_id, started_at desc);
create index events_org_time_idx on public.events(organization_id, started_at desc);
create index events_type_time_idx on public.events(primary_event_type, started_at desc);
create index events_tags_gin_idx on public.events using gin(tags);
create index events_zones_gin_idx on public.events using gin(zone_ids);
create index events_payload_gin_idx on public.events using gin(analyzed_payload jsonb_path_ops);
create index event_people_event_idx on public.event_people(event_id);
create index event_vehicles_event_idx on public.event_vehicles(event_id);
create index plate_suggestions_normalized_idx on public.event_plate_suggestions(normalized_text) where normalized_text <> '';
create index storage_assets_expiry_idx on public.storage_assets(expires_at) where deleted_at is null;
create index usage_events_org_time_idx on public.usage_events(organization_id, created_at desc);
create index audit_logs_org_time_idx on public.audit_logs(organization_id, created_at desc);

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger retention_policies_set_updated_at before update on public.retention_policies
for each row execute function public.set_updated_at();
create trigger sites_set_updated_at before update on public.sites
for each row execute function public.set_updated_at();
create trigger cameras_set_updated_at before update on public.cameras
for each row execute function public.set_updated_at();
create trigger agents_set_updated_at before update on public.agents
for each row execute function public.set_updated_at();
create trigger agent_cameras_set_updated_at before update on public.agent_cameras
for each row execute function public.set_updated_at();
create trigger analysis_jobs_set_updated_at before update on public.analysis_jobs
for each row execute function public.set_updated_at();
create trigger events_set_updated_at before update on public.events
for each row execute function public.set_updated_at();

create or replace function public.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

create or replace function public.create_organization(org_name text, org_slug text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations(name, slug, created_by)
  values (org_name, org_slug, auth.uid())
  returning id into new_org_id;

  insert into public.organization_members(organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  insert into public.retention_policies(organization_id)
  values (new_org_id);

  return new_org_id;
end;
$$;

grant execute on function public.create_organization(text, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.retention_policies enable row level security;
alter table public.sites enable row level security;
alter table public.cameras enable row level security;
alter table public.camera_profiles enable row level security;
alter table public.camera_zones enable row level security;
alter table public.agents enable row level security;
alter table public.agent_cameras enable row level security;
alter table public.agent_health enable row level security;
alter table public.capture_sessions enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.events enable row level security;
alter table public.event_people enable row level security;
alter table public.event_vehicles enable row level security;
alter table public.event_plate_suggestions enable row level security;
alter table public.storage_assets enable row level security;
alter table public.event_embeddings enable row level security;
alter table public.usage_events enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select_member on public.organizations
for select using (public.is_org_member(id));
create policy organizations_update_admin on public.organizations
for update using (public.has_org_role(id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(id, array['owner','admin']::public.organization_role[]));

create policy organization_members_select_member on public.organization_members
for select using (public.is_org_member(organization_id));
create policy organization_members_manage_admin on public.organization_members
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy retention_select_member on public.retention_policies
for select using (public.is_org_member(organization_id));
create policy retention_manage_admin on public.retention_policies
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy sites_select_member on public.sites
for select using (public.is_org_member(organization_id));
create policy sites_manage_admin on public.sites
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy cameras_select_member on public.cameras
for select using (public.is_org_member(organization_id));
create policy cameras_manage_admin on public.cameras
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy camera_profiles_select_member on public.camera_profiles
for select using (public.is_org_member(organization_id));
create policy camera_profiles_manage_admin on public.camera_profiles
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy camera_zones_select_member on public.camera_zones
for select using (public.is_org_member(organization_id));
create policy camera_zones_manage_admin on public.camera_zones
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy agents_select_member on public.agents
for select using (public.is_org_member(organization_id));
create policy agents_manage_admin on public.agents
for all using (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (public.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy agent_cameras_select_admin on public.agent_cameras
for select using (
  exists (
    select 1 from public.agents a
    where a.id = agent_id
      and public.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
  )
);
create policy agent_cameras_manage_admin on public.agent_cameras
for all using (
  exists (
    select 1 from public.agents a
    where a.id = agent_id
      and public.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
  )
) with check (
  exists (
    select 1 from public.agents a
    where a.id = agent_id
      and public.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
  )
);

-- Tabelas operacionais: usuários autenticados apenas leem dados da própria organização.
-- Escritas serão feitas pelo backend com service role após validar o token do Agent.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agent_health', 'capture_sessions', 'analysis_jobs', 'events', 'event_people',
    'event_vehicles', 'event_plate_suggestions', 'storage_assets', 'event_embeddings',
    'usage_events', 'audit_logs'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select using (public.is_org_member(organization_id))',
      table_name || '_select_member',
      table_name
    );
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('analysis-frames', 'analysis-frames', false, 10485760, array['image/jpeg','image/webp','image/png']),
  ('event-keyframes', 'event-keyframes', false, 5242880, array['image/jpeg','image/webp','image/png']),
  ('preserved-clips', 'preserved-clips', false, 536870912, array['video/mp4','video/x-matroska'])
on conflict (id) do nothing;

-- Caminho obrigatório: <organization_id>/<camera_id>/<arquivo>
create policy storage_read_org_assets on storage.objects
for select to authenticated
using (
  bucket_id in ('analysis-frames', 'event-keyframes', 'preserved-clips')
  and public.is_org_member(((storage.foldername(name))[1])::uuid)
);

comment on table public.event_plate_suggestions is
  'Sugestões visuais não confirmadas. Não usar como leitura ANPR definitiva.';
comment on column public.agent_cameras.encrypted_rtsp_config is
  'Credencial RTSP cifrada no backend; nunca guardar URL/senha em texto puro.';
