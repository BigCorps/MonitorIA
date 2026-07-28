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
  select pc.* into v_pairing
  from public.agent_pairing_codes pc
  where pc.code_hash = p_code_hash
    and pc.used_at is null
    and pc.revoked_at is null
    and pc.expires_at > now()
  for update;

  if v_pairing.id is null then
    raise exception 'invalid or expired pairing code';
  end if;

  select c.* into v_camera
  from public.cameras c
  where c.id = v_pairing.camera_id;

  if v_camera.id is null then
    raise exception 'camera not found';
  end if;

  update public.agent_cameras ac
     set enabled = false,
         updated_at = now()
   where ac.camera_id = v_camera.id
     and ac.enabled;

  insert into public.agents(
    organization_id,
    site_id,
    name,
    status,
    version,
    platform,
    architecture,
    agent_token_hash,
    metadata
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

  update public.agent_pairing_codes pc
     set used_at = now(),
         used_by_agent_id = v_agent_id
   where pc.id = v_pairing.id;

  update public.cameras c
     set pairing_status = 'paired',
         paired_at = now()
   where c.id = v_camera.id;

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
