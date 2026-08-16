
-- MonitorIA v1.0 — Fase B2: fluxo do trial comercial assistido.
-- Depende da fundação sales_assisted_trial_foundation.

create or replace function private.assert_sales_trial_organization_eligibility(
  p_organization_id uuid,
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
end;
$$;

revoke all on function private.assert_sales_trial_organization_eligibility(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_sales_trial_organization_eligibility(uuid, uuid)
  to service_role;

create or replace function private.assert_sales_trial_camera_eligibility(
  p_organization_id uuid,
  p_trial_run_id uuid,
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
  perform private.assert_monitoria_trial_eligibility(
    p_organization_id,
    p_camera_id,
    p_agent_id,
    p_user_id
  );

  if exists (
    select 1
    from public.trial_run_cameras participant
    where participant.camera_id = p_camera_id
      and participant.trial_run_id <> p_trial_run_id
  ) then
    raise exception 'camera_trial_already_used';
  end if;

  if p_agent_id is not null and exists (
    select 1
    from public.trial_run_cameras participant
    where participant.agent_id = p_agent_id
      and participant.trial_run_id <> p_trial_run_id
  ) then
    raise exception 'agent_trial_already_used';
  end if;
end;
$$;

revoke all on function private.assert_sales_trial_camera_eligibility(uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_sales_trial_camera_eligibility(uuid, uuid, uuid, uuid, uuid)
  to service_role;

create or replace function public.redeem_sales_trial_invite(
  p_token_hash text,
  p_organization_id uuid,
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.sales_trial_invites%rowtype;
  v_trial public.trial_runs%rowtype;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'not_authorized';
  end if;

  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_sales_trial_invite';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = p_user_id
      and member.role::text = any (array['owner'::text, 'admin'::text])
  ) then
    raise exception 'not_authorized';
  end if;

  select invite.*
    into v_invite
  from public.sales_trial_invites invite
  where invite.token_hash = lower(p_token_hash)
  for update;

  if not found
     or v_invite.revoked_at is not null
     or v_invite.expires_at <= now() then
    raise exception 'invalid_sales_trial_invite';
  end if;

  if v_invite.redeemed_at is not null then
    if v_invite.redeemed_organization_id = p_organization_id
       and v_invite.redeemed_by = p_user_id then
      return jsonb_build_object(
        'success', true,
        'duplicate', true,
        'trialId', v_invite.trial_run_id
      );
    end if;

    raise exception 'sales_trial_invite_already_used';
  end if;

  perform private.assert_sales_trial_organization_eligibility(
    p_organization_id,
    p_user_id
  );

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.organization_id = p_organization_id
  for update;

  if found and v_trial.status not in ('draft', 'ready') then
    raise exception 'trial_cannot_be_replaced';
  end if;

  if found then
    delete from public.trial_run_cameras
    where trial_run_id = v_trial.id;

    update public.trial_runs
    set camera_id = null,
        selected_plan_code = v_invite.selected_plan_code,
        agent_id = null,
        status = 'draft',
        ready_at = null,
        last_readiness_check_at = now(),
        readiness_snapshot = '{}'::jsonb,
        status_reason = 'waiting_for_camera_selection',
        trial_mode = 'sales_assisted',
        duration_minutes = v_invite.duration_minutes,
        max_cameras = v_invite.max_cameras,
        sales_invite_id = v_invite.id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'trialMode', 'sales_assisted',
          'durationMinutes', v_invite.duration_minutes,
          'maxCameras', v_invite.max_cameras,
          'explorationDays', 7,
          'purgeGraceDays', 7
        ),
        updated_at = now()
    where id = v_trial.id
    returning * into v_trial;
  else
    insert into public.trial_runs (
      organization_id,
      selected_plan_code,
      status,
      started_by,
      ready_at,
      last_readiness_check_at,
      readiness_snapshot,
      status_reason,
      interaction_limit,
      interactions_used,
      trial_mode,
      duration_minutes,
      max_cameras,
      sales_invite_id,
      metadata
    )
    values (
      p_organization_id,
      v_invite.selected_plan_code,
      'draft',
      null,
      null,
      now(),
      '{}'::jsonb,
      'waiting_for_camera_selection',
      21,
      0,
      'sales_assisted',
      v_invite.duration_minutes,
      v_invite.max_cameras,
      v_invite.id,
      jsonb_build_object(
        'trialMode', 'sales_assisted',
        'durationMinutes', v_invite.duration_minutes,
        'maxCameras', v_invite.max_cameras,
        'explorationDays', 7,
        'purgeGraceDays', 7
      )
    )
    returning * into v_trial;
  end if;

  update public.sales_trial_invites
  set redeemed_at = now(),
      redeemed_by = p_user_id,
      redeemed_organization_id = p_organization_id,
      trial_run_id = v_trial.id,
      updated_at = now()
  where id = v_invite.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organization_id,
    p_user_id,
    'trial.sales_invite_redeemed',
    'trial_run',
    v_trial.id::text,
    jsonb_build_object(
      'salesInviteId', v_invite.id,
      'durationMinutes', v_invite.duration_minutes,
      'maxCameras', v_invite.max_cameras,
      'planCode', v_invite.selected_plan_code
    )
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'trialId', v_trial.id,
    'durationMinutes', v_trial.duration_minutes,
    'maxCameras', v_trial.max_cameras,
    'planCode', v_trial.selected_plan_code
  );
end;
$$;

revoke all on function public.redeem_sales_trial_invite(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.redeem_sales_trial_invite(text, uuid, uuid)
  to service_role;

create or replace function public.prepare_sales_monitoria_trial(
  p_organization_id uuid,
  p_camera_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_user_id uuid := (select auth.uid());
  v_camera_id uuid;
  v_readiness jsonb;
  v_agent_id uuid;
  v_ready boolean;
  v_all_ready boolean := true;
  v_camera_count integer := 0;
  v_first_camera_id uuid := null;
  v_first_agent_id uuid := null;
  v_cameras_json jsonb := '[]'::jsonb;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.organization_id = p_organization_id
  for update;

  if not found or v_trial.trial_mode <> 'sales_assisted' then
    raise exception 'sales_trial_not_prepared';
  end if;

  if v_trial.status not in ('draft', 'ready') then
    raise exception 'trial_selection_locked';
  end if;

  perform private.assert_sales_trial_organization_eligibility(
    p_organization_id,
    v_user_id
  );

  select count(*)
    into v_camera_count
  from (
    select distinct camera_id
    from unnest(coalesce(p_camera_ids, array[]::uuid[])) camera_id
    where camera_id is not null
  ) selected;

  if v_camera_count < 1 then
    raise exception 'sales_trial_camera_required';
  end if;

  if v_camera_count > v_trial.max_cameras then
    raise exception 'sales_trial_camera_limit';
  end if;

  delete from public.trial_run_cameras participant
  where participant.trial_run_id = v_trial.id
    and participant.camera_id not in (
      select distinct camera_id
      from unnest(p_camera_ids) camera_id
      where camera_id is not null
    );

  for v_camera_id in
    select distinct camera_id
    from unnest(p_camera_ids) camera_id
    where camera_id is not null
    order by camera_id
  loop
    v_readiness := private.monitoria_trial_readiness(
      p_organization_id,
      v_camera_id
    );
    v_ready := coalesce((v_readiness->>'ready')::boolean, false);
    v_agent_id := nullif(v_readiness->>'agentId', '')::uuid;

    if coalesce((v_readiness->>'cameraFound')::boolean, false) is not true then
      raise exception 'camera_not_found';
    end if;

    perform private.assert_sales_trial_camera_eligibility(
      p_organization_id,
      v_trial.id,
      v_camera_id,
      v_agent_id,
      v_user_id
    );

    if v_first_camera_id is null then
      v_first_camera_id := v_camera_id;
      v_first_agent_id := v_agent_id;
    end if;

    if not v_ready then
      v_all_ready := false;
    end if;

    insert into public.trial_run_cameras (
      trial_run_id,
      organization_id,
      camera_id,
      selected_plan_code,
      agent_id,
      status,
      ready_at,
      readiness_snapshot,
      status_reason,
      updated_at
    )
    values (
      v_trial.id,
      p_organization_id,
      v_camera_id,
      v_trial.selected_plan_code,
      v_agent_id,
      case when v_ready then 'ready' else 'selected' end,
      case when v_ready then now() else null end,
      v_readiness,
      case
        when v_ready then 'camera_ready'
        else 'waiting_for_camera_requirements'
      end,
      now()
    )
    on conflict (trial_run_id, camera_id)
    do update set
      selected_plan_code = excluded.selected_plan_code,
      agent_id = excluded.agent_id,
      status = excluded.status,
      ready_at = excluded.ready_at,
      readiness_snapshot = excluded.readiness_snapshot,
      status_reason = excluded.status_reason,
      updated_at = now();

    v_cameras_json := v_cameras_json || jsonb_build_array(
      jsonb_build_object(
        'cameraId', v_camera_id,
        'agentId', v_agent_id,
        'ready', v_ready,
        'readiness', v_readiness
      )
    );
  end loop;

  update public.trial_runs
  set camera_id = v_first_camera_id,
      agent_id = v_first_agent_id,
      status = case
        when v_all_ready then 'ready'::public.trial_run_status
        else 'draft'::public.trial_run_status
      end,
      ready_at = case
        when v_all_ready then coalesce(ready_at, now())
        else null
      end,
      last_readiness_check_at = now(),
      readiness_snapshot = jsonb_build_object(
        'ready', v_all_ready,
        'cameraCount', v_camera_count,
        'cameras', v_cameras_json,
        'checkedAt', now()
      ),
      status_reason = case
        when v_all_ready then 'all_cameras_ready'
        else 'waiting_for_camera_requirements'
      end,
      updated_at = now()
  where id = v_trial.id
  returning * into v_trial;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organization_id,
    v_user_id,
    'trial.sales_prepared',
    'trial_run',
    v_trial.id::text,
    jsonb_build_object(
      'cameraCount', v_camera_count,
      'allReady', v_all_ready,
      'planCode', v_trial.selected_plan_code
    )
  );

  return jsonb_build_object(
    'success', true,
    'trialId', v_trial.id,
    'status', v_trial.status,
    'ready', v_all_ready,
    'cameraCount', v_camera_count,
    'maxCameras', v_trial.max_cameras,
    'durationMinutes', v_trial.duration_minutes,
    'cameras', v_cameras_json
  );
end;
$$;

revoke all on function public.prepare_sales_monitoria_trial(uuid, uuid[])
  from public, anon;
grant execute on function public.prepare_sales_monitoria_trial(uuid, uuid[])
  to authenticated, service_role;

create or replace function public.refresh_sales_monitoria_trial(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera_ids uuid[];
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  select array_agg(participant.camera_id order by participant.created_at)
    into v_camera_ids
  from public.trial_run_cameras participant
  join public.trial_runs trial on trial.id = participant.trial_run_id
  where trial.organization_id = p_organization_id
    and trial.trial_mode = 'sales_assisted'
    and participant.status <> 'removed';

  if coalesce(array_length(v_camera_ids, 1), 0) = 0 then
    raise exception 'sales_trial_camera_required';
  end if;

  return public.prepare_sales_monitoria_trial(
    p_organization_id,
    v_camera_ids
  );
end;
$$;

revoke all on function public.refresh_sales_monitoria_trial(uuid)
  from public, anon;
grant execute on function public.refresh_sales_monitoria_trial(uuid)
  to authenticated, service_role;

create or replace function public.start_sales_monitoria_trial(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_user_id uuid := (select auth.uid());
  v_email_confirmed_at timestamptz;
  v_started_at timestamptz := now();
  v_capture_ends_at timestamptz;
  v_exploration_ends_at timestamptz;
  v_purge_after timestamptz;
  v_allowance_id uuid;
  v_camera_count integer;
  v_camera_id uuid;
  v_agent_id uuid;
  v_readiness jsonb;
  v_ready boolean;
  v_all_ready boolean := true;
  v_cameras_json jsonb := '[]'::jsonb;
  v_fingerprint_hash text;
  v_agent_metadata jsonb;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  if v_user_id is null and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;

  if v_user_id is not null then
    select user_account.email_confirmed_at
      into v_email_confirmed_at
    from auth.users user_account
    where user_account.id = v_user_id;

    if v_email_confirmed_at is null then
      raise exception 'email_confirmation_required';
    end if;
  end if;

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.organization_id = p_organization_id
  for update;

  if not found or v_trial.trial_mode <> 'sales_assisted' then
    raise exception 'sales_trial_not_prepared';
  end if;

  if v_trial.status = 'running' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'trialId', v_trial.id,
      'status', v_trial.status,
      'captureStartedAt', v_trial.capture_started_at,
      'captureEndsAt', v_trial.capture_ends_at,
      'explorationEndsAt', v_trial.exploration_ends_at,
      'purgeAfter', v_trial.purge_after
    );
  end if;

  if v_trial.status not in ('draft', 'ready') then
    raise exception 'trial_cannot_be_started';
  end if;

  select count(*)
    into v_camera_count
  from public.trial_run_cameras participant
  where participant.trial_run_id = v_trial.id
    and participant.status <> 'removed';

  if v_camera_count < 1 then
    raise exception 'sales_trial_camera_required';
  end if;

  if v_camera_count > v_trial.max_cameras then
    raise exception 'sales_trial_camera_limit';
  end if;

  perform private.assert_sales_trial_organization_eligibility(
    p_organization_id,
    v_user_id
  );

  for v_camera_id, v_agent_id in
    select participant.camera_id, participant.agent_id
    from public.trial_run_cameras participant
    where participant.trial_run_id = v_trial.id
      and participant.status <> 'removed'
    order by participant.created_at
  loop
    v_readiness := private.monitoria_trial_readiness(
      p_organization_id,
      v_camera_id
    );
    v_ready := coalesce((v_readiness->>'ready')::boolean, false);
    v_agent_id := nullif(v_readiness->>'agentId', '')::uuid;

    perform private.assert_sales_trial_camera_eligibility(
      p_organization_id,
      v_trial.id,
      v_camera_id,
      v_agent_id,
      v_user_id
    );

    update public.trial_run_cameras
    set agent_id = v_agent_id,
        status = case when v_ready then 'ready' else 'selected' end,
        ready_at = case when v_ready then coalesce(ready_at, now()) else null end,
        readiness_snapshot = v_readiness,
        status_reason = case
          when v_ready then 'camera_ready'
          else 'waiting_for_camera_requirements'
        end,
        updated_at = now()
    where trial_run_id = v_trial.id
      and camera_id = v_camera_id;

    if not v_ready then
      v_all_ready := false;
    end if;

    v_cameras_json := v_cameras_json || jsonb_build_array(
      jsonb_build_object(
        'cameraId', v_camera_id,
        'agentId', v_agent_id,
        'ready', v_ready
      )
    );
  end loop;

  if not v_all_ready then
    update public.trial_runs
    set status = 'draft',
        ready_at = null,
        last_readiness_check_at = now(),
        readiness_snapshot = jsonb_build_object(
          'ready', false,
          'cameraCount', v_camera_count,
          'cameras', v_cameras_json,
          'checkedAt', now()
        ),
        status_reason = 'waiting_for_camera_requirements',
        updated_at = now()
    where id = v_trial.id;

    raise exception 'trial_camera_not_ready';
  end if;

  v_capture_ends_at :=
    v_started_at + make_interval(mins => v_trial.duration_minutes);
  v_exploration_ends_at := v_capture_ends_at + interval '7 days';
  v_purge_after := v_exploration_ends_at + interval '7 days';

  update public.trial_runs
  set status = 'running',
      started_by = coalesce(v_user_id, started_by),
      ready_at = coalesce(ready_at, v_started_at),
      capture_started_at = v_started_at,
      capture_ends_at = v_capture_ends_at,
      exploration_ends_at = v_exploration_ends_at,
      purge_after = v_purge_after,
      capture_completed_at = null,
      expired_at = null,
      converted_at = null,
      purged_at = null,
      interactions_used = 0,
      last_readiness_check_at = now(),
      readiness_snapshot = jsonb_build_object(
        'ready', true,
        'cameraCount', v_camera_count,
        'cameras', v_cameras_json,
        'checkedAt', now()
      ),
      status_reason = 'sales_trial_running',
      updated_at = now()
  where id = v_trial.id
  returning * into v_trial;

  update public.trial_run_cameras
  set status = 'running',
      capture_started_at = v_started_at,
      capture_ends_at = v_capture_ends_at,
      capture_completed_at = null,
      status_reason = 'sales_trial_running',
      updated_at = now()
  where trial_run_id = v_trial.id
    and status <> 'removed';

  update public.billing_accounts
  set entitlement_enforcement_enabled = true,
      updated_at = now()
  where organization_id = p_organization_id;

  update public.cameras camera
  set analysis_plan_code = coalesce(participant.selected_plan_code, v_trial.selected_plan_code),
      updated_at = now()
  from public.trial_run_cameras participant
  where participant.trial_run_id = v_trial.id
    and participant.camera_id = camera.id
    and participant.status <> 'removed'
    and camera.organization_id = p_organization_id;

  insert into public.assistant_allowances (
    organization_id,
    source,
    source_reference_id,
    period_start,
    period_end,
    included_interactions,
    used_interactions,
    expires_at
  )
  values (
    p_organization_id,
    'trial',
    v_trial.id,
    v_started_at,
    v_exploration_ends_at,
    v_trial.interaction_limit,
    0,
    v_exploration_ends_at
  )
  on conflict (organization_id, source, period_start)
  do update set
    source_reference_id = excluded.source_reference_id,
    period_end = excluded.period_end,
    included_interactions = excluded.included_interactions,
    used_interactions = 0,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning id into v_allowance_id;

  -- Registra todos os computadores participantes. O trigger legado continua
  -- cobrindo o Agent principal e este bloco cobre Agents adicionais.
  for v_agent_id in
    select distinct participant.agent_id
    from public.trial_run_cameras participant
    where participant.trial_run_id = v_trial.id
      and participant.status = 'running'
      and participant.agent_id is not null
  loop
    select agent.metadata,
           nullif(agent.metadata->>'installationFingerprintHash', '')
      into v_agent_metadata,
           v_fingerprint_hash
    from public.agents agent
    where agent.id = v_agent_id;

    if v_fingerprint_hash is not null then
      if v_fingerprint_hash !~ '^[a-f0-9]{64}$' then
        raise exception 'invalid_installation_fingerprint_hash';
      end if;

      insert into public.trial_device_fingerprints (
        trial_run_id,
        organization_id,
        fingerprint_hash,
        metadata
      )
      values (
        v_trial.id,
        p_organization_id,
        v_fingerprint_hash,
        jsonb_build_object(
          'agentId', v_agent_id,
          'platform', v_agent_metadata->>'osType',
          'hostname', v_agent_metadata->>'hostname',
          'trialMode', 'sales_assisted'
        )
      )
      on conflict (fingerprint_hash)
      do update set
        last_seen_at = now(),
        metadata = public.trial_device_fingerprints.metadata || excluded.metadata;
    end if;
  end loop;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organization_id,
    v_user_id,
    'trial.sales_started',
    'trial_run',
    v_trial.id::text,
    jsonb_build_object(
      'cameraCount', v_camera_count,
      'planCode', v_trial.selected_plan_code,
      'durationMinutes', v_trial.duration_minutes,
      'captureEndsAt', v_capture_ends_at,
      'explorationEndsAt', v_exploration_ends_at,
      'allowanceId', v_allowance_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'trialId', v_trial.id,
    'status', v_trial.status,
    'cameraCount', v_camera_count,
    'planCode', v_trial.selected_plan_code,
    'durationMinutes', v_trial.duration_minutes,
    'captureStartedAt', v_started_at,
    'captureEndsAt', v_capture_ends_at,
    'explorationEndsAt', v_exploration_ends_at,
    'purgeAfter', v_purge_after,
    'interactionLimit', v_trial.interaction_limit,
    'allowanceId', v_allowance_id
  );
end;
$$;

revoke all on function public.start_sales_monitoria_trial(uuid)
  from public, anon;
grant execute on function public.start_sales_monitoria_trial(uuid)
  to authenticated, service_role;
