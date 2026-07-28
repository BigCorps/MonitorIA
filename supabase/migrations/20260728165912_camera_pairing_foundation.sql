-- MonitorIA v0.4 — cadastro de câmeras e pareamento seguro do Agent

alter table public.cameras
  add column if not exists description text not null default '',
  add column if not exists analysis_plan_code text not null default 'standard',
  add column if not exists monitoring_goals jsonb not null default '[]'::jsonb,
  add column if not exists pairing_status text not null default 'unpaired',
  add column if not exists paired_at timestamptz;

alter table public.cameras
  drop constraint if exists cameras_analysis_plan_code_check,
  add constraint cameras_analysis_plan_code_check
    check (analysis_plan_code in ('basic', 'standard', 'intensive')),
  drop constraint if exists cameras_pairing_status_check,
  add constraint cameras_pairing_status_check
    check (pairing_status in ('unpaired', 'pairing', 'paired'));

alter table public.agent_cameras
  alter column encrypted_rtsp_config drop not null;

comment on column public.agent_cameras.encrypted_rtsp_config is
  'Campo legado e opcional. O MonitorIA Agent deve manter a URL RTSP e a senha somente no equipamento local.';

create table if not exists public.agent_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  used_by_agent_id uuid references public.agents(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (used_at is null or used_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);

create index if not exists agent_pairing_codes_camera_idx
  on public.agent_pairing_codes(camera_id, created_at desc);
create index if not exists agent_pairing_codes_active_idx
  on public.agent_pairing_codes(code_hash, expires_at)
  where used_at is null and revoked_at is null;
create unique index if not exists agent_cameras_one_enabled_per_camera_idx
  on public.agent_cameras(camera_id)
  where enabled;

alter table public.agent_pairing_codes enable row level security;
revoke all privileges on table public.agent_pairing_codes from anon, authenticated;
grant all privileges on table public.agent_pairing_codes to service_role;

create or replace function public.create_agent_pairing_code(
  p_camera_id uuid,
  p_code_hash text
)
returns table(pairing_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_organization_id uuid;
  v_site_id uuid;
  v_pairing_id uuid;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select c.organization_id, c.site_id
    into v_organization_id, v_site_id
  from public.cameras c
  where c.id = p_camera_id
    and private.has_org_role(
      c.organization_id,
      array['owner','admin']::public.organization_role[]
    );

  if v_organization_id is null then
    raise exception 'camera not found or access denied';
  end if;

  update public.agent_pairing_codes
     set revoked_at = now()
   where camera_id = p_camera_id
     and used_at is null
     and revoked_at is null;

  insert into public.agent_pairing_codes(
    organization_id, site_id, camera_id, code_hash, expires_at, created_by
  ) values (
    v_organization_id, v_site_id, p_camera_id, p_code_hash, v_expires_at, auth.uid()
  ) returning id into v_pairing_id;

  update public.cameras
     set pairing_status = 'pairing'
   where id = p_camera_id;

  return query select v_pairing_id, v_expires_at;
end;
$$;

revoke execute on function public.create_agent_pairing_code(uuid, text)
  from public, anon;
grant execute on function public.create_agent_pairing_code(uuid, text)
  to authenticated;

create or replace function public.consume_agent_pairing_code(
  p_code_hash text,
  p_agent_name text,
  p_agent_token_hash text,
  p_platform text default null,
  p_architecture text default null,
  p_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  agent_id uuid,
  organization_id uuid,
  site_id uuid,
  camera_id uuid,
  camera_name text,
  analysis_plan_code text,
  capture_interval_seconds numeric,
  consolidation_interval_seconds integer,
  motion_start_threshold numeric,
  motion_continue_threshold numeric,
  event_close_after_seconds integer,
  monitoring_goals jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_pairing public.agent_pairing_codes%rowtype;
  v_agent_id uuid;
  v_camera public.cameras%rowtype;
begin
  select * into v_pairing
  from public.agent_pairing_codes
  where code_hash = p_code_hash
    and used_at is null
    and revoked_at is null
    and expires_at > now()
  for update;

  if v_pairing.id is null then
    raise exception 'invalid or expired pairing code';
  end if;

  select * into v_camera
  from public.cameras
  where id = v_pairing.camera_id;

  if v_camera.id is null then
    raise exception 'camera not found';
  end if;

  update public.agent_cameras
     set enabled = false,
         updated_at = now()
   where camera_id = v_camera.id
     and enabled;

  insert into public.agents(
    organization_id, site_id, name, status, version, platform,
    architecture, agent_token_hash, metadata
  ) values (
    v_pairing.organization_id,
    v_pairing.site_id,
    left(coalesce(nullif(trim(p_agent_name), ''), 'MonitorIA Agent'), 160),
    'pending',
    nullif(trim(p_version), ''),
    nullif(trim(p_platform), ''),
    nullif(trim(p_architecture), ''),
    p_agent_token_hash,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_agent_id;

  insert into public.agent_cameras(agent_id, camera_id, enabled)
  values (v_agent_id, v_camera.id, true);

  update public.agent_pairing_codes
     set used_at = now(),
         used_by_agent_id = v_agent_id
   where id = v_pairing.id;

  update public.cameras
     set pairing_status = 'paired',
         paired_at = now()
   where id = v_camera.id;

  return query
  select
    v_agent_id,
    v_pairing.organization_id,
    v_pairing.site_id,
    v_camera.id,
    v_camera.name,
    v_camera.analysis_plan_code,
    v_camera.capture_interval_seconds,
    v_camera.consolidation_interval_seconds,
    v_camera.motion_start_threshold,
    v_camera.motion_continue_threshold,
    v_camera.event_close_after_seconds,
    v_camera.monitoring_goals;
end;
$$;

revoke execute on function public.consume_agent_pairing_code(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.consume_agent_pairing_code(
  text, text, text, text, text, text, jsonb
) to service_role;

comment on table public.agent_pairing_codes is
  'Códigos de pareamento temporários. O código legível nunca é armazenado; apenas um HMAC.';
