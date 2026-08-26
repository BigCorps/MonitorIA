-- MonitorIA — abertura/fechamento opt-in por câmera
-- APLICADA no Supabase de produção em 26/08/2026.
-- Não executar novamente manualmente no projeto atual; este arquivo mantém
-- o histórico do repositório alinhado ao banco.

begin;

alter table public.cameras
  add column if not exists operational_access_enabled boolean not null default false;

comment on column public.cameras.operational_access_enabled is
  'Opt-in explícito: esta câmera é a referência visual de abertura/fechamento do local.';

create unique index if not exists cameras_one_operational_access_per_site_uidx
  on public.cameras(site_id)
  where operational_access_enabled;

create or replace function private.monitoria_reconcile_primary_access_markers_v5(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.camera_profiles%rowtype;
  v_camera public.cameras%rowtype;
  v_zone record;
  v_entity record;
  v_entity_id uuid;
  v_entity_name text;
begin
  select * into v_profile
  from public.camera_profiles
  where id = p_profile_id;

  if not found or not v_profile.is_active then
    return null;
  end if;

  select * into v_camera
  from public.cameras
  where id = v_profile.camera_id
    and organization_id = v_profile.organization_id;

  if not found then
    return null;
  end if;

  if not coalesce(v_camera.operational_access_enabled, false) then
    update public.camera_visual_entities
    set primary_operational_marker = false,
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'operationalAccessOptIn', false,
            'operationalAccessDisabledAt', now()
          ),
        updated_at = now()
    where organization_id = v_profile.organization_id
      and camera_id = v_profile.camera_id
      and entity_type = 'access_barrier'
      and primary_operational_marker;

    return null;
  end if;

  select
    z.id,
    z.name,
    z.zone_type,
    z.description,
    z.polygon,
    z.sort_order,
    private.monitoria_operational_access_zone_score_v3(
      z.name, z.description, z.zone_type
    ) as score
  into v_zone
  from public.camera_zones z
  where z.organization_id = v_profile.organization_id
    and z.camera_profile_id = v_profile.id
    and z.zone_type <> 'ignore'
  order by score desc, z.sort_order, z.id
  limit 1;

  if not found or coalesce(v_zone.score, 0) < 10 then
    update public.camera_visual_entities
    set primary_operational_marker = false,
        updated_at = now()
    where organization_id = v_profile.organization_id
      and camera_id = v_profile.camera_id
      and camera_profile_id = v_profile.id
      and entity_type = 'access_barrier'
      and primary_operational_marker;

    return null;
  end if;

  update public.camera_visual_entities
  set primary_operational_marker = false,
      updated_at = now()
  where organization_id = v_profile.organization_id
    and camera_profile_id = v_profile.id
    and primary_operational_marker;

  select e.*
  into v_entity
  from public.camera_visual_entities e
  where e.organization_id = v_profile.organization_id
    and e.camera_id = v_profile.camera_id
    and e.camera_profile_id = v_profile.id
    and e.entity_type = 'access_barrier'
  order by
    case when coalesce(e.metadata->>'zone_id', '') = v_zone.id::text then 0 else 1 end,
    case when lower(e.name) = lower(left(trim(v_zone.name), 120)) then 0 else 1 end,
    e.enabled desc,
    e.updated_at desc,
    e.created_at desc
  limit 1;

  if found then
    v_entity_id := v_entity.id;
  else
    select e.*
    into v_entity
    from public.camera_visual_entities e
    join public.camera_profiles old_profile
      on old_profile.id = e.camera_profile_id
    where e.organization_id = v_profile.organization_id
      and e.camera_id = v_profile.camera_id
      and e.camera_profile_id <> v_profile.id
      and e.entity_type = 'access_barrier'
    order by
      e.primary_operational_marker desc,
      e.enabled desc,
      old_profile.version desc,
      e.updated_at desc,
      e.created_at desc
    limit 1;

    if found and not exists (
      select 1
      from public.camera_visual_entities current_entity
      where current_entity.camera_profile_id = v_profile.id
        and lower(current_entity.name) = lower(v_entity.name)
    ) then
      update public.camera_visual_entities
      set camera_profile_id = v_profile.id,
          primary_operational_marker = false,
          updated_at = now()
      where id = v_entity.id;
      v_entity_id := v_entity.id;
    end if;
  end if;

  if v_entity_id is null then
    v_entity_name := left(trim(v_zone.name), 120);

    if exists (
      select 1
      from public.camera_visual_entities e
      where e.camera_profile_id = v_profile.id
        and lower(e.name) = lower(v_entity_name)
    ) then
      v_entity_name := left(trim(v_zone.name), 96) || ' · acesso operacional';
    end if;

    insert into public.camera_visual_entities (
      organization_id, camera_id, camera_profile_id, name, entity_type,
      polygon, state_definitions, primary_operational_marker,
      min_confidence, reliability, enabled, sort_order, metadata,
      approved_by, approved_at
    ) values (
      v_profile.organization_id,
      v_profile.camera_id,
      v_profile.id,
      v_entity_name,
      'access_barrier',
      v_zone.polygon,
      jsonb_build_array(
        jsonb_build_object('state', 'closed', 'description', 'A barreira está visualmente fechada e bloqueia o acesso observado.'),
        jsonb_build_object('state', 'opening', 'description', 'A sequência visual mostra a barreira abrindo.'),
        jsonb_build_object('state', 'partially_open', 'description', 'A barreira está parcialmente aberta.'),
        jsonb_build_object('state', 'open', 'description', 'A barreira está visualmente aberta e permite passagem pelo acesso observado.'),
        jsonb_build_object('state', 'closing', 'description', 'A sequência visual mostra a barreira fechando.')
      ),
      false,
      0.780,
      'medium',
      true,
      coalesce(v_zone.sort_order, 0),
      jsonb_build_object(
        'source', 'operational_access_opt_in_v5',
        'zone_id', v_zone.id,
        'zone_name', v_zone.name,
        'profile_version', v_profile.version,
        'auto_score', v_zone.score,
        'operationalAccessOptIn', true,
        'generated_from', 'approved_camera_profile'
      ),
      v_profile.reviewed_by,
      coalesce(v_profile.reviewed_at, now())
    )
    returning id into v_entity_id;
  end if;

  update public.camera_visual_entities
  set enabled = true,
      primary_operational_marker = true,
      polygon = v_zone.polygon,
      sort_order = coalesce(v_zone.sort_order, 0),
      state_definitions = jsonb_build_array(
        jsonb_build_object('state', 'closed', 'description', 'A barreira está visualmente fechada e bloqueia o acesso observado.'),
        jsonb_build_object('state', 'opening', 'description', 'A sequência visual mostra a barreira abrindo.'),
        jsonb_build_object('state', 'partially_open', 'description', 'A barreira está parcialmente aberta.'),
        jsonb_build_object('state', 'open', 'description', 'A barreira está visualmente aberta e permite passagem pelo acesso observado.'),
        jsonb_build_object('state', 'closing', 'description', 'A sequência visual mostra a barreira fechando.')
      ),
      metadata = (coalesce(metadata, '{}'::jsonb) - 'operationalAccessDisabledAt')
        || jsonb_build_object(
          'source', 'operational_access_opt_in_v5',
          'zone_id', v_zone.id,
          'zone_name', v_zone.name,
          'profile_version', v_profile.version,
          'auto_score', v_zone.score,
          'operationalAccessOptIn', true,
          'syncedAt', now()
        ),
      updated_at = now()
  where id = v_entity_id;

  return v_entity_id;
end;
$function$;

revoke all on function private.monitoria_reconcile_primary_access_markers_v5(uuid)
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_reconcile_primary_access_markers_v5(uuid)
  to service_role;

create or replace function private.monitoria_sync_primary_access_barrier_trigger_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.is_active then
    perform private.monitoria_reconcile_primary_access_markers_v5(new.id);
  end if;
  return new;
end;
$function$;

revoke all on function private.monitoria_sync_primary_access_barrier_trigger_v5()
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_sync_primary_access_barrier_trigger_v5()
  to service_role;

drop trigger if exists camera_profiles_sync_operational_access_v3 on public.camera_profiles;
drop trigger if exists camera_profiles_sync_operational_access_v4 on public.camera_profiles;
drop trigger if exists camera_profiles_sync_operational_access_v5 on public.camera_profiles;
create trigger camera_profiles_sync_operational_access_v5
after insert or update of is_active on public.camera_profiles
for each row execute function private.monitoria_sync_primary_access_barrier_trigger_v5();

create or replace function private.monitoria_operational_access_camera_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
begin
  if new.operational_access_enabled is not distinct from old.operational_access_enabled then
    return new;
  end if;

  select id into v_profile_id
  from public.camera_profiles
  where organization_id = new.organization_id
    and camera_id = new.id
    and is_active
  order by version desc
  limit 1;

  if v_profile_id is not null then
    perform private.monitoria_reconcile_primary_access_markers_v5(v_profile_id);
  end if;

  return new;
end;
$function$;

revoke all on function private.monitoria_operational_access_camera_trigger_v1()
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_operational_access_camera_trigger_v1()
  to service_role;

drop trigger if exists cameras_sync_operational_access_opt_in_v1 on public.cameras;
create trigger cameras_sync_operational_access_opt_in_v1
after update of operational_access_enabled on public.cameras
for each row execute function private.monitoria_operational_access_camera_trigger_v1();

create or replace function private.monitoria_operational_access_zone_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_id uuid;
begin
  v_profile_id := case when tg_op = 'DELETE' then old.camera_profile_id else new.camera_profile_id end;

  if exists (
    select 1 from public.camera_profiles
    where id = v_profile_id and is_active
  ) then
    perform private.monitoria_reconcile_primary_access_markers_v5(v_profile_id);
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

revoke all on function private.monitoria_operational_access_zone_trigger_v1()
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_operational_access_zone_trigger_v1()
  to service_role;

drop trigger if exists camera_zones_sync_operational_access_v1 on public.camera_zones;
create trigger camera_zones_sync_operational_access_v1
after insert or update or delete on public.camera_zones
for each row execute function private.monitoria_operational_access_zone_trigger_v1();

create or replace function public.set_camera_operational_access_v1(
  p_organization_id uuid,
  p_camera_id uuid,
  p_enabled boolean,
  p_opening_minute integer default null,
  p_closing_minute integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_camera public.cameras%rowtype;
  v_profile_id uuid;
  v_marker_id uuid;
  v_site_config jsonb;
begin
  select * into v_camera
  from public.cameras
  where id = p_camera_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'camera_not_found';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_camera.site_id::text, 0));

  if coalesce(p_enabled, false) then
    if p_opening_minute is null or p_opening_minute < 0 or p_opening_minute > 1439
       or p_closing_minute is null or p_closing_minute < 0 or p_closing_minute > 1439
       or p_opening_minute = p_closing_minute then
      raise exception 'operational_access_schedule_invalid';
    end if;

    update public.cameras
    set operational_access_enabled = false,
        updated_at = now()
    where organization_id = p_organization_id
      and site_id = v_camera.site_id
      and id <> p_camera_id
      and operational_access_enabled;

    update public.cameras
    set operational_access_enabled = true,
        visual_state_enabled = true,
        monitoring_schedule = jsonb_build_object('mode', 'always'),
        motion_start_threshold = least(motion_start_threshold, 0.50),
        motion_continue_threshold = least(motion_continue_threshold, 0.25),
        motion_start_consecutive_frames = least(motion_start_consecutive_frames, 3),
        updated_at = now()
    where id = p_camera_id
      and organization_id = p_organization_id;

    select id into v_profile_id
    from public.camera_profiles
    where organization_id = p_organization_id
      and camera_id = p_camera_id
      and is_active
    order by version desc
    limit 1;

    if v_profile_id is null then
      raise exception 'operational_access_profile_required';
    end if;

    v_marker_id := private.monitoria_reconcile_primary_access_markers_v5(v_profile_id);
    if v_marker_id is null then
      raise exception 'operational_access_zone_required';
    end if;

    select operational_inference_config
    into v_site_config
    from public.sites
    where id = v_camera.site_id
      and organization_id = p_organization_id
    for update;

    update public.sites
    set operational_inference_config = coalesce(v_site_config, '{}'::jsonb)
      || jsonb_build_object(
        'enabled', true,
        'source', 'camera_operational_access_opt_in_v5',
        'openingMinute', p_opening_minute,
        'closingMinute', p_closing_minute,
        'openingWindowBeforeMinutes', 90,
        'openingWindowAfterMinutes', 120,
        'closingWindowBeforeMinutes', 120,
        'closingWindowAfterMinutes', 180,
        'updatedAt', now()
      ),
      updated_at = now()
    where id = v_camera.site_id
      and organization_id = p_organization_id;
  else
    update public.cameras
    set operational_access_enabled = false,
        updated_at = now()
    where id = p_camera_id
      and organization_id = p_organization_id;

    select id into v_profile_id
    from public.camera_profiles
    where organization_id = p_organization_id
      and camera_id = p_camera_id
      and is_active
    order by version desc
    limit 1;

    if v_profile_id is not null then
      perform private.monitoria_reconcile_primary_access_markers_v5(v_profile_id);
    end if;

    if not exists (
      select 1 from public.cameras
      where organization_id = p_organization_id
        and site_id = v_camera.site_id
        and operational_access_enabled
    ) then
      update public.sites
      set operational_inference_config = coalesce(operational_inference_config, '{}'::jsonb)
        || jsonb_build_object(
          'enabled', false,
          'source', 'camera_operational_access_opt_in_v5',
          'updatedAt', now()
        ),
        updated_at = now()
      where id = v_camera.site_id
        and organization_id = p_organization_id;
    end if;
  end if;

  return jsonb_build_object(
    'cameraId', p_camera_id,
    'siteId', v_camera.site_id,
    'enabled', coalesce(p_enabled, false),
    'markerId', v_marker_id
  );
end;
$function$;

revoke all on function public.set_camera_operational_access_v1(uuid,uuid,boolean,integer,integer)
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function public.set_camera_operational_access_v1(uuid,uuid,boolean,integer,integer)
  to service_role;

do $reconcile$
declare
  v_profile record;
begin
  for v_profile in
    select profile.id
    from public.camera_profiles profile
    where profile.is_active
    order by profile.created_at
  loop
    perform private.monitoria_reconcile_primary_access_markers_v5(v_profile.id);
  end loop;
end;
$reconcile$;

commit;
