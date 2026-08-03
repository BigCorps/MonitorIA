create or replace function private.monitoria_trial_readiness(
  p_organization_id uuid,
  p_camera_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_camera public.cameras%rowtype;
  v_profile_id uuid;
  v_agent public.agents%rowtype;
  v_mapping_enabled boolean := false;
  v_camera_online boolean := false;
  v_camera_paired boolean := false;
  v_profile_ready boolean := false;
  v_agent_online boolean := false;
  v_heartbeat_recent boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_ready boolean := false;
begin
  select camera.*
    into v_camera
  from public.cameras camera
  where camera.id = p_camera_id
    and camera.organization_id = p_organization_id;

  if not found then
    return jsonb_build_object(
      'ready', false,
      'cameraFound', false,
      'reasons', jsonb_build_array('camera_not_found')
    );
  end if;

  v_camera_online := v_camera.status = 'online';
  v_camera_paired := coalesce(v_camera.pairing_status, '') = 'paired';

  select profile.id
    into v_profile_id
  from public.camera_profiles profile
  where profile.organization_id = p_organization_id
    and profile.camera_id = p_camera_id
    and profile.is_active
  order by profile.version desc
  limit 1;

  v_profile_ready := v_profile_id is not null;

  select agent.*
    into v_agent
  from public.agent_cameras mapping
  join public.agents agent on agent.id = mapping.agent_id
  where mapping.camera_id = p_camera_id
    and agent.organization_id = p_organization_id
    and mapping.enabled
  order by agent.last_heartbeat_at desc nulls last,
           mapping.updated_at desc
  limit 1;

  v_mapping_enabled := found;

  if v_mapping_enabled then
    v_agent_online := v_agent.status = 'online';
    v_heartbeat_recent :=
      v_agent.last_heartbeat_at is not null
      and v_agent.last_heartbeat_at >= now() - interval '10 minutes';
  end if;

  if not v_camera_online then
    v_reasons := v_reasons || jsonb_build_array('camera_offline');
  end if;
  if not v_camera_paired then
    v_reasons := v_reasons || jsonb_build_array('camera_not_paired');
  end if;
  if not v_profile_ready then
    v_reasons := v_reasons || jsonb_build_array('active_profile_required');
  end if;
  if not v_mapping_enabled then
    v_reasons := v_reasons || jsonb_build_array('agent_camera_not_enabled');
  end if;
  if v_mapping_enabled and not v_agent_online then
    v_reasons := v_reasons || jsonb_build_array('agent_offline');
  end if;
  if v_mapping_enabled and not v_heartbeat_recent then
    v_reasons := v_reasons || jsonb_build_array('agent_heartbeat_stale');
  end if;

  v_ready :=
    v_camera_online
    and v_camera_paired
    and v_profile_ready
    and v_mapping_enabled
    and v_agent_online
    and v_heartbeat_recent;

  return jsonb_build_object(
    'ready', v_ready,
    'cameraFound', true,
    'cameraId', v_camera.id,
    'cameraName', v_camera.name,
    'cameraOnline', v_camera_online,
    'cameraPaired', v_camera_paired,
    'activeProfile', v_profile_ready,
    'activeProfileId', v_profile_id,
    'agentCameraEnabled', v_mapping_enabled,
    'agentId', v_agent.id,
    'agentName', v_agent.name,
    'agentOnline', v_agent_online,
    'agentHeartbeatRecent', v_heartbeat_recent,
    'lastHeartbeatAt', v_agent.last_heartbeat_at,
    'reasons', v_reasons,
    'checkedAt', now()
  );
end;
$$;

revoke all on function private.monitoria_trial_readiness(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.monitoria_trial_readiness(uuid, uuid)
  to service_role;

create or replace function public.get_monitoria_trial_readiness(
  p_organization_id uuid,
  p_camera_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or private.is_org_member(p_organization_id)
  ) then
    raise exception 'not_authorized';
  end if;

  return private.monitoria_trial_readiness(
    p_organization_id,
    p_camera_id
  );
end;
$$;

revoke all on function public.get_monitoria_trial_readiness(uuid, uuid)
  from public, anon;
grant execute on function public.get_monitoria_trial_readiness(uuid, uuid)
  to authenticated, service_role;

create or replace function private.assert_monitoria_trial_eligibility(
  p_organization_id uuid,
  p_camera_id uuid,
  p_agent_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.billing_invoices invoice
    where invoice.organization_id = p_organization_id
      and invoice.status = 'paid'
  ) or exists (
    select 1
    from public.billing_pix_payments payment
    where payment.organization_id = p_organization_id
      and payment.status = 'confirmed'
  ) then
    raise exception 'organization_already_paid';
  end if;

  if exists (
    select 1
    from public.camera_subscriptions subscription
    where subscription.organization_id = p_organization_id
      and subscription.status <> 'cancelled'
  ) then
    raise exception 'organization_already_subscribed';
  end if;

  if p_user_id is not null and exists (
    select 1
    from public.trial_runs trial
    where trial.started_by = p_user_id
      and trial.organization_id <> p_organization_id
  ) then
    raise exception 'user_trial_already_used';
  end if;

  if p_agent_id is not null and exists (
    select 1
    from public.trial_runs trial
    where trial.agent_id = p_agent_id
      and trial.organization_id <> p_organization_id
  ) then
    raise exception 'agent_trial_already_used';
  end if;

  if exists (
    select 1
    from public.trial_runs trial
    where trial.camera_id = p_camera_id
      and trial.organization_id <> p_organization_id
  ) then
    raise exception 'camera_trial_already_used';
  end if;
end;
$$;

revoke all on function private.assert_monitoria_trial_eligibility(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_monitoria_trial_eligibility(uuid, uuid, uuid, uuid)
  to service_role;
