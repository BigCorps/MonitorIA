create or replace function public.prepare_monitoria_trial(
  p_organization_id uuid,
  p_camera_id uuid,
  p_plan_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_readiness jsonb;
  v_ready boolean;
  v_agent_id uuid;
  v_user_id uuid := (select auth.uid());
  v_status public.trial_run_status;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  if not exists (
    select 1
    from public.camera_plan_catalog plan
    where plan.code = p_plan_code
      and plan.is_active
  ) then
    raise exception 'invalid_trial_plan';
  end if;

  v_readiness := private.monitoria_trial_readiness(
    p_organization_id,
    p_camera_id
  );
  v_ready := coalesce((v_readiness->>'ready')::boolean, false);
  v_agent_id := nullif(v_readiness->>'agentId', '')::uuid;

  perform private.assert_monitoria_trial_eligibility(
    p_organization_id,
    p_camera_id,
    v_agent_id,
    v_user_id
  );

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.organization_id = p_organization_id
  for update;

  if found and v_trial.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'success', false,
      'status', v_trial.status,
      'reason', 'trial_selection_locked',
      'trialId', v_trial.id
    );
  end if;

  v_status := case
    when v_ready then 'ready'::public.trial_run_status
    else 'draft'::public.trial_run_status
  end;

  if found then
    update public.trial_runs
    set camera_id = p_camera_id,
        selected_plan_code = p_plan_code,
        agent_id = v_agent_id,
        status = v_status,
        ready_at = case
          when v_ready then coalesce(ready_at, now())
          else null
        end,
        last_readiness_check_at = now(),
        readiness_snapshot = v_readiness,
        status_reason = case
          when v_ready then 'camera_ready'
          else 'waiting_for_camera_requirements'
        end,
        updated_at = now()
    where id = v_trial.id
    returning * into v_trial;
  else
    insert into public.trial_runs (
      organization_id,
      camera_id,
      selected_plan_code,
      agent_id,
      status,
      ready_at,
      last_readiness_check_at,
      readiness_snapshot,
      status_reason,
      interaction_limit,
      interactions_used,
      metadata
    )
    values (
      p_organization_id,
      p_camera_id,
      p_plan_code,
      v_agent_id,
      v_status,
      case when v_ready then now() else null end,
      now(),
      v_readiness,
      case
        when v_ready then 'camera_ready'
        else 'waiting_for_camera_requirements'
      end,
      21,
      0,
      jsonb_build_object(
        'captureHours', 24,
        'explorationDays', 7,
        'purgeGraceDays', 7
      )
    )
    returning * into v_trial;
  end if;

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
    'trial.prepared',
    'trial_run',
    v_trial.id::text,
    jsonb_build_object(
      'cameraId', p_camera_id,
      'planCode', p_plan_code,
      'ready', v_ready,
      'agentId', v_agent_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'trialId', v_trial.id,
    'status', v_trial.status,
    'cameraId', v_trial.camera_id,
    'planCode', v_trial.selected_plan_code,
    'agentId', v_trial.agent_id,
    'readiness', v_readiness
  );
end;
$$;

revoke all on function public.prepare_monitoria_trial(uuid, uuid, text)
  from public, anon;
grant execute on function public.prepare_monitoria_trial(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.refresh_monitoria_trial(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_readiness jsonb;
  v_ready boolean;
  v_agent_id uuid;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'trial_not_prepared';
  end if;

  if v_trial.status not in ('draft', 'ready') then
    return jsonb_build_object(
      'success', true,
      'trialId', v_trial.id,
      'status', v_trial.status,
      'readiness', v_trial.readiness_snapshot
    );
  end if;

  v_readiness := private.monitoria_trial_readiness(
    p_organization_id,
    v_trial.camera_id
  );
  v_ready := coalesce((v_readiness->>'ready')::boolean, false);
  v_agent_id := nullif(v_readiness->>'agentId', '')::uuid;

  perform private.assert_monitoria_trial_eligibility(
    p_organization_id,
    v_trial.camera_id,
    v_agent_id,
    (select auth.uid())
  );

  update public.trial_runs
  set agent_id = v_agent_id,
      status = case
        when v_ready then 'ready'::public.trial_run_status
        else 'draft'::public.trial_run_status
      end,
      ready_at = case
        when v_ready then coalesce(ready_at, now())
        else null
      end,
      last_readiness_check_at = now(),
      readiness_snapshot = v_readiness,
      status_reason = case
        when v_ready then 'camera_ready'
        else 'waiting_for_camera_requirements'
      end,
      updated_at = now()
  where id = v_trial.id
  returning * into v_trial;

  return jsonb_build_object(
    'success', true,
    'trialId', v_trial.id,
    'status', v_trial.status,
    'readiness', v_readiness
  );
end;
$$;

revoke all on function public.refresh_monitoria_trial(uuid)
  from public, anon;
grant execute on function public.refresh_monitoria_trial(uuid)
  to authenticated, service_role;

create or replace function public.start_monitoria_trial(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_readiness jsonb;
  v_ready boolean;
  v_user_id uuid := (select auth.uid());
  v_started_at timestamptz := now();
  v_capture_ends_at timestamptz;
  v_exploration_ends_at timestamptz;
  v_purge_after timestamptz;
  v_allowance_id uuid;
  v_email_confirmed_at timestamptz;
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

  if not found then
    raise exception 'trial_not_prepared';
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

  v_readiness := private.monitoria_trial_readiness(
    p_organization_id,
    v_trial.camera_id
  );
  v_ready := coalesce((v_readiness->>'ready')::boolean, false);

  if not v_ready then
    update public.trial_runs
    set status = 'draft',
        ready_at = null,
        last_readiness_check_at = now(),
        readiness_snapshot = v_readiness,
        status_reason = 'waiting_for_camera_requirements',
        updated_at = now()
    where id = v_trial.id;

    raise exception 'trial_camera_not_ready';
  end if;

  perform private.assert_monitoria_trial_eligibility(
    p_organization_id,
    v_trial.camera_id,
    v_trial.agent_id,
    v_user_id
  );

  v_capture_ends_at := v_started_at + interval '24 hours';
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
      readiness_snapshot = v_readiness,
      status_reason = 'trial_running',
      updated_at = now()
  where id = v_trial.id
  returning * into v_trial;

  update public.billing_accounts
  set entitlement_enforcement_enabled = true,
      updated_at = now()
  where organization_id = p_organization_id;

  update public.cameras
  set analysis_plan_code = v_trial.selected_plan_code,
      updated_at = now()
  where id = v_trial.camera_id
    and organization_id = p_organization_id;

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
    'trial.started',
    'trial_run',
    v_trial.id::text,
    jsonb_build_object(
      'cameraId', v_trial.camera_id,
      'agentId', v_trial.agent_id,
      'planCode', v_trial.selected_plan_code,
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
    'cameraId', v_trial.camera_id,
    'planCode', v_trial.selected_plan_code,
    'captureStartedAt', v_started_at,
    'captureEndsAt', v_capture_ends_at,
    'explorationEndsAt', v_exploration_ends_at,
    'purgeAfter', v_purge_after,
    'interactionLimit', v_trial.interaction_limit,
    'allowanceId', v_allowance_id
  );
end;
$$;

revoke all on function public.start_monitoria_trial(uuid)
  from public, anon;
grant execute on function public.start_monitoria_trial(uuid)
  to authenticated, service_role;
