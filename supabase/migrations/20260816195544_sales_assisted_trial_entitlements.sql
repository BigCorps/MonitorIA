-- MonitorIA v1.0 — Fase B2: entitlement multi-câmera para trial assistido.
-- Mantém a assinatura existente para preservar views dependentes.

create or replace function public.resolve_camera_entitlement(
  p_camera_id uuid
)
returns table (
  camera_id uuid,
  organization_id uuid,
  trial_run_id uuid,
  access_source text,
  monitoring_allowed boolean,
  plan_code text,
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  grace_ends_at timestamptz,
  capture_ends_at timestamptz,
  exploration_ends_at timestamptz,
  purge_after timestamptz,
  metadata_retention_days smallint,
  long_term_keyframes smallint,
  temporary_frame_days smallint,
  maximum_analysis_frames smallint,
  maximum_escalation_percent smallint,
  clip_enabled boolean,
  clip_duration_seconds smallint,
  clip_retention_days smallint,
  assistant_access_allowed boolean,
  enforcement_enabled boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_camera public.cameras%rowtype;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_plan public.camera_plan_catalog%rowtype;
  v_trial_plan_code text := null;
  v_enforcement boolean := true;
  v_source text := 'blocked';
  v_monitoring boolean := false;
  v_plan_code text := null;
  v_starts_at timestamptz := null;
  v_ends_at timestamptz := null;
  v_grace_ends_at timestamptz := null;
  v_trial_id uuid := null;
  v_capture_ends_at timestamptz := null;
  v_exploration_ends_at timestamptz := null;
  v_purge_after timestamptz := null;
  v_assistant_allowed boolean := false;
  v_reason text := 'payment_required';
begin
  select camera.* into v_camera
  from public.cameras camera
  where camera.id = p_camera_id;

  if not found then raise exception 'camera_not_found'; end if;

  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or private.is_org_member(v_camera.organization_id)
  ) then
    raise exception 'not_authorized';
  end if;

  select coalesce(account.entitlement_enforcement_enabled, true)
    into v_enforcement
  from public.billing_accounts account
  where account.organization_id = v_camera.organization_id;
  v_enforcement := coalesce(v_enforcement, true);

  select subscription.* into v_subscription
  from public.camera_subscriptions subscription
  where subscription.camera_id = p_camera_id;

  select trial.* into v_trial
  from public.trial_run_cameras participant
  join public.trial_runs trial on trial.id = participant.trial_run_id
  where participant.camera_id = p_camera_id
    and participant.organization_id = v_camera.organization_id
    and participant.status <> 'removed'
  order by trial.created_at desc
  limit 1;

  if found then
    select coalesce(participant.selected_plan_code, v_trial.selected_plan_code)
      into v_trial_plan_code
    from public.trial_run_cameras participant
    where participant.trial_run_id = v_trial.id
      and participant.camera_id = p_camera_id
    limit 1;
  else
    select trial.* into v_trial
    from public.trial_runs trial
    where trial.organization_id = v_camera.organization_id
      and trial.camera_id = p_camera_id
    order by trial.created_at desc
    limit 1;

    if found then
      v_trial_plan_code := v_trial.selected_plan_code;
    end if;
  end if;

  if not v_enforcement then
    v_source := 'legacy';
    v_monitoring := true;
    v_plan_code := coalesce(
      v_subscription.plan_code,
      v_trial_plan_code,
      v_camera.analysis_plan_code,
      'basic'
    );
    v_assistant_allowed := true;
    v_reason := 'legacy_internal_access';
  elsif v_subscription.status = 'active'
        and v_subscription.current_period_end > now() then
    v_source := 'subscription';
    v_monitoring := true;
    v_plan_code := v_subscription.plan_code;
    v_starts_at := v_subscription.current_period_start;
    v_ends_at := v_subscription.current_period_end;
    v_assistant_allowed := true;
    v_reason := 'active_subscription';
  elsif v_subscription.status = 'grace_period'
        and v_subscription.grace_ends_at > now() then
    v_source := 'grace_period';
    v_monitoring := true;
    v_plan_code := v_subscription.plan_code;
    v_starts_at := v_subscription.current_period_start;
    v_ends_at := v_subscription.current_period_end;
    v_grace_ends_at := v_subscription.grace_ends_at;
    v_assistant_allowed := true;
    v_reason := 'payment_grace_period';
  elsif v_trial.id is not null
        and v_trial.status = 'running'
        and v_trial.capture_started_at <= now()
        and v_trial.capture_ends_at > now() then
    v_source := 'trial';
    v_monitoring := true;
    v_plan_code := v_trial_plan_code;
    v_starts_at := v_trial.capture_started_at;
    v_ends_at := v_trial.capture_ends_at;
    v_trial_id := v_trial.id;
    v_capture_ends_at := v_trial.capture_ends_at;
    v_exploration_ends_at := v_trial.exploration_ends_at;
    v_purge_after := v_trial.purge_after;
    v_assistant_allowed :=
      v_trial.exploration_ends_at is not null
      and v_trial.exploration_ends_at > now();
    v_reason := 'active_trial';
  else
    v_plan_code := coalesce(
      v_subscription.plan_code,
      v_trial_plan_code,
      v_camera.analysis_plan_code
    );
    v_trial_id := v_trial.id;
    v_capture_ends_at := v_trial.capture_ends_at;
    v_exploration_ends_at := v_trial.exploration_ends_at;
    v_purge_after := v_trial.purge_after;

    v_assistant_allowed :=
      v_trial.id is not null
      and v_trial.status in ('running', 'capture_completed', 'exploration')
      and v_trial.exploration_ends_at is not null
      and v_trial.exploration_ends_at > now();

    if v_assistant_allowed then
      v_source := 'trial';
      v_reason := 'trial_exploration_only';
    elsif v_trial.id is not null and v_trial.status = 'expired' then
      v_reason := 'trial_expired';
    elsif v_trial.id is not null and v_trial.status = 'purged' then
      v_reason := 'trial_data_purged';
    elsif v_trial.id is not null and v_trial.status in ('draft', 'ready') then
      v_reason := 'trial_not_started';
    elsif v_subscription.status = 'suspended' then
      v_reason := 'subscription_suspended';
    else
      v_reason := 'payment_required';
    end if;
  end if;

  if v_plan_code is not null then
    select plan.* into v_plan
    from public.camera_plan_catalog plan
    where plan.code = v_plan_code;
  end if;

  return query
  select
    p_camera_id,
    v_camera.organization_id,
    v_trial_id,
    v_source,
    v_monitoring,
    v_plan_code,
    v_starts_at,
    v_ends_at,
    v_grace_ends_at,
    v_capture_ends_at,
    v_exploration_ends_at,
    v_purge_after,
    v_plan.metadata_retention_days,
    v_plan.long_term_keyframes,
    v_plan.temporary_frame_days,
    v_plan.maximum_analysis_frames,
    v_plan.maximum_escalation_percent,
    coalesce(v_plan.clip_enabled, false),
    v_plan.clip_duration_seconds,
    v_plan.clip_retention_days,
    v_assistant_allowed,
    v_enforcement,
    v_reason;
end;
$$;

revoke all on function public.resolve_camera_entitlement(uuid) from public, anon;
grant execute on function public.resolve_camera_entitlement(uuid) to authenticated, service_role;
