alter table public.camera_profiles
  add column if not exists source_asset_id uuid null,
  add column if not exists provider text null,
  add column if not exists model text null,
  add column if not exists response_id text null,
  add column if not exists profile_metadata jsonb not null default '{}'::jsonb,
  add column if not exists reviewed_by uuid null,
  add column if not exists reviewed_at timestamptz null,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'camera_profiles_source_asset_id_fkey'
  ) then
    alter table public.camera_profiles
      add constraint camera_profiles_source_asset_id_fkey
      foreign key (source_asset_id) references public.storage_assets(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'camera_profiles_reviewed_by_fkey'
  ) then
    alter table public.camera_profiles
      add constraint camera_profiles_reviewed_by_fkey
      foreign key (reviewed_by) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'camera_profiles_profile_metadata_object_check'
  ) then
    alter table public.camera_profiles
      add constraint camera_profiles_profile_metadata_object_check
      check (jsonb_typeof(profile_metadata) = 'object');
  end if;
end
$$;

create index if not exists camera_profiles_source_asset_id_idx
  on public.camera_profiles(source_asset_id)
  where source_asset_id is not null;

create unique index if not exists camera_profiles_one_active_per_camera_idx
  on public.camera_profiles(camera_id)
  where is_active;

create or replace function public.create_camera_profile_draft(
  p_organization_id uuid,
  p_camera_id uuid,
  p_source_asset_id uuid,
  p_environment_description text,
  p_monitoring_goals jsonb,
  p_ignore_instructions jsonb,
  p_zones jsonb,
  p_provider text,
  p_model text,
  p_response_id text,
  p_profile_metadata jsonb,
  p_created_by uuid
)
returns table(profile_id uuid, profile_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_version integer;
  v_zone jsonb;
begin
  if not exists (
    select 1
    from public.cameras c
    where c.id = p_camera_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'camera_not_found';
  end if;

  if not exists (
    select 1
    from public.storage_assets a
    where a.id = p_source_asset_id
      and a.organization_id = p_organization_id
      and a.camera_id = p_camera_id
      and a.status = 'ready'::public.asset_status
      and a.deleted_at is null
  ) then
    raise exception 'source_asset_not_found';
  end if;

  if jsonb_typeof(p_monitoring_goals) <> 'array'
     or jsonb_typeof(p_ignore_instructions) <> 'array'
     or jsonb_typeof(p_zones) <> 'array'
     or jsonb_typeof(p_profile_metadata) <> 'object' then
    raise exception 'invalid_profile_payload';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_camera_id::text, 0));

  select coalesce(max(cp.version), 0) + 1
    into v_version
  from public.camera_profiles cp
  where cp.camera_id = p_camera_id;

  insert into public.camera_profiles (
    organization_id,
    camera_id,
    version,
    environment_description,
    monitoring_goals,
    ignore_instructions,
    is_active,
    created_by,
    source_asset_id,
    provider,
    model,
    response_id,
    profile_metadata,
    updated_at
  ) values (
    p_organization_id,
    p_camera_id,
    v_version,
    left(trim(p_environment_description), 2000),
    p_monitoring_goals,
    p_ignore_instructions,
    false,
    p_created_by,
    p_source_asset_id,
    nullif(trim(p_provider), ''),
    nullif(trim(p_model), ''),
    nullif(trim(p_response_id), ''),
    p_profile_metadata,
    now()
  )
  returning id into v_profile_id;

  for v_zone in select value from jsonb_array_elements(p_zones)
  loop
    if jsonb_typeof(v_zone) <> 'object'
       or jsonb_typeof(v_zone->'polygon') <> 'array' then
      raise exception 'invalid_zone_payload';
    end if;

    insert into public.camera_zones (
      organization_id,
      camera_profile_id,
      name,
      zone_type,
      polygon,
      description,
      sort_order
    ) values (
      p_organization_id,
      v_profile_id,
      left(trim(v_zone->>'name'), 100),
      v_zone->>'type',
      v_zone->'polygon',
      left(coalesce(trim(v_zone->>'description'), ''), 500),
      coalesce((v_zone->>'sortOrder')::integer, 0)
    );
  end loop;

  return query select v_profile_id, v_version;
end;
$$;

create or replace function public.activate_camera_profile(
  p_organization_id uuid,
  p_profile_id uuid,
  p_reviewed_by uuid
)
returns table(camera_id uuid, active_profile_id uuid, active_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.camera_profiles%rowtype;
begin
  select *
    into v_profile
  from public.camera_profiles cp
  where cp.id = p_profile_id
    and cp.organization_id = p_organization_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_profile.camera_id::text, 0));

  update public.camera_profiles
  set is_active = false,
      updated_at = now()
  where camera_profiles.camera_id = v_profile.camera_id
    and camera_profiles.organization_id = p_organization_id
    and camera_profiles.is_active;

  update public.camera_profiles
  set is_active = true,
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      updated_at = now()
  where id = p_profile_id;

  update public.cameras
  set description = v_profile.environment_description,
      monitoring_goals = v_profile.monitoring_goals,
      updated_at = now()
  where id = v_profile.camera_id
    and organization_id = p_organization_id;

  return query select v_profile.camera_id, p_profile_id, v_profile.version;
end;
$$;

revoke all on function public.create_camera_profile_draft(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.create_camera_profile_draft(uuid, uuid, uuid, text, jsonb, jsonb, jsonb, text, text, text, jsonb, uuid)
  to service_role;

revoke all on function public.activate_camera_profile(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.activate_camera_profile(uuid, uuid, uuid)
  to service_role;
