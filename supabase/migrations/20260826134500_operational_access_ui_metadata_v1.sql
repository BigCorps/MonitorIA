-- MonitorIA — metadados de UI para abertura/fechamento
-- APLICADA no Supabase de produção em 26/08/2026.
-- Mantém a escolha visível em monitoring_schedule sem exigir mudança no Agent.

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
  v_opening_time text;
  v_closing_time text;
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

    v_opening_time := lpad((p_opening_minute / 60)::text, 2, '0')
      || ':' || lpad((p_opening_minute % 60)::text, 2, '0');
    v_closing_time := lpad((p_closing_minute / 60)::text, 2, '0')
      || ':' || lpad((p_closing_minute % 60)::text, 2, '0');

    update public.cameras
    set operational_access_enabled = false,
        monitoring_schedule = coalesce(monitoring_schedule, '{}'::jsonb) - 'operationalAccess',
        updated_at = now()
    where organization_id = p_organization_id
      and site_id = v_camera.site_id
      and id <> p_camera_id
      and operational_access_enabled;

    update public.cameras
    set operational_access_enabled = true,
        visual_state_enabled = true,
        monitoring_schedule = jsonb_build_object(
          'mode', 'always',
          'operationalAccess', jsonb_build_object(
            'enabled', true,
            'openingTime', v_opening_time,
            'closingTime', v_closing_time,
            'referenceCamera', true
          )
        ),
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
        monitoring_schedule = coalesce(monitoring_schedule, '{}'::jsonb) - 'operationalAccess',
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
