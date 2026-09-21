-- MonitorIA — Gravações RC8
-- Trial por gravação: até seis ambientes locais, todos compartilhando
-- as mesmas 24 horas de vídeos e a mesma janela de 24 horas.
-- O trial tradicional com câmera ao vivo permanece inalterado.

begin;

create or replace function private.enforce_recording_environment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.source_kind <> 'local_recording' then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      new.organization_id::text || ':recording-environments',
      0
    )
  );

  select count(*)
    into v_count
  from public.cameras camera
  where camera.organization_id = new.organization_id
    and camera.source_kind = 'local_recording'
    and (
      tg_op = 'INSERT'
      or camera.id <> new.id
    );

  if v_count >= 6 then
    raise exception 'recording_environment_limit_reached';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cameras_recording_environment_limit
  on public.cameras;

create trigger trg_cameras_recording_environment_limit
before insert or update of organization_id, source_kind
on public.cameras
for each row
execute function private.enforce_recording_environment_limit();

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

    -- Um trial iniciado por gravação pertence à conta e pode ser usado
    -- por até seis ambientes locais. Isso não amplia o trial de câmeras
    -- ao vivo: o fallback só existe para source_kind=local_recording e
    -- somente quando a câmera que iniciou o trial também era uma gravação.
    if not found and v_camera.source_kind = 'local_recording' then
      select trial.* into v_trial
      from public.trial_runs trial
      join public.cameras trial_origin
        on trial_origin.id = trial.camera_id
       and trial_origin.organization_id = trial.organization_id
      where trial.organization_id = v_camera.organization_id
        and trial_origin.source_kind = 'local_recording'
      order by trial.created_at desc
      limit 1;

      if found then
        v_trial_plan_code := v_trial.selected_plan_code;
      end if;
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


create or replace function public.reserve_monitoria_recording_session(
  p_organization_id uuid,
  p_camera_id uuid,
  p_request_key text,
  p_source_filename text,
  p_file_size_bytes bigint,
  p_duration_seconds integer,
  p_source_started_at timestamptz,
  p_codec text default null,
  p_width integer default null,
  p_height integer default null,
  p_decoder_mode text default null,
  p_native_preview boolean default false,
  p_browser_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.recording_sessions%rowtype;
  v_camera public.cameras%rowtype;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_participant_plan text := null;
  v_source text;
  v_enforcement boolean := true;
  v_plan_code text;
  v_trial_run_id uuid := null;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_limit integer;
  v_used bigint := 0;
  v_session public.recording_sessions%rowtype;
begin
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or exists (
      select 1
      from public.organization_members member
      where member.organization_id = p_organization_id
        and member.user_id = (select auth.uid())
        and member.role in ('owner'::public.organization_role, 'admin'::public.organization_role)
    )
  ) then
    raise exception 'not_authorized';
  end if;

  if p_request_key is null or char_length(btrim(p_request_key)) < 8 then
    raise exception 'invalid_recording_request_key';
  end if;

  if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > 3600 then
    raise exception 'invalid_recording_duration';
  end if;

  if p_source_started_at is null then
    raise exception 'recording_source_time_required';
  end if;

  -- Serializa retries/reenvios do mesmo pedido antes de consultar a sessão.
  -- Assim, duas chamadas concorrentes com o mesmo request_key não disputam
  -- a UNIQUE(organization_id, request_key): a segunda espera e retorna a
  -- sessão criada pela primeira como duplicate=true.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text
        || ':recording-request:'
        || btrim(p_request_key),
      0
    )
  );

  select *
    into v_existing
  from public.recording_sessions
  where organization_id = p_organization_id
    and request_key = p_request_key;

  if found then
    select coalesce(sum(
      case
        when session.status in ('reserved', 'processing')
          then session.reserved_seconds
        else session.processed_seconds
      end
    ), 0)
      into v_used
    from public.recording_sessions session
    where (
        (
          v_existing.quota_source = 'trial'
          and v_existing.trial_run_id is not null
          and session.trial_run_id = v_existing.trial_run_id
        )
        or
        (
          v_existing.quota_source <> 'trial'
          and session.camera_id = v_existing.camera_id
        )
      )
      and session.quota_period_start = v_existing.quota_period_start
      and session.quota_period_end = v_existing.quota_period_end;

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'sessionId', v_existing.id,
      'quotaSource', v_existing.quota_source,
      'planCode', v_existing.plan_code,
      'trialRunId', v_existing.trial_run_id,
      'quotaLimitSeconds', v_existing.quota_limit_seconds,
      'quotaUsedSeconds', v_used,
      'quotaRemainingSeconds',
        greatest(v_existing.quota_limit_seconds - v_used, 0),
      'reservedSeconds', v_existing.reserved_seconds,
      'quotaPeriodStart', v_existing.quota_period_start,
      'quotaPeriodEnd', v_existing.quota_period_end
    );
  end if;

  select camera.*
    into v_camera
  from public.cameras camera
  where camera.id = p_camera_id
    and camera.organization_id = p_organization_id
    and camera.source_kind = 'local_recording';

  if not found then
    raise exception 'recording_source_not_found';
  end if;

  select coalesce(account.entitlement_enforcement_enabled, true)
    into v_enforcement
  from public.billing_accounts account
  where account.organization_id = p_organization_id;

  v_enforcement := coalesce(v_enforcement, true);

  select subscription.*
    into v_subscription
  from public.camera_subscriptions subscription
  where subscription.camera_id = p_camera_id;

  if not v_enforcement then
    v_source := 'legacy';
    v_plan_code := coalesce(v_camera.analysis_plan_code, 'basic');
    v_period_start := date_trunc('month', now());
    v_period_end := v_period_start + interval '1 month';
    v_limit := 2592000;
  elsif found
     and v_subscription.status = 'active'
     and v_subscription.current_period_end > now() then
    v_source := 'subscription';
    v_plan_code := v_subscription.plan_code;
    v_period_start := v_subscription.current_period_start;
    v_period_end := v_subscription.current_period_end;
    v_limit := 2592000; -- 720h
  elsif found
        and v_subscription.status = 'grace_period'
        and v_subscription.grace_ends_at > now() then
    v_source := 'grace_period';
    v_plan_code := v_subscription.plan_code;
    v_period_start := v_subscription.current_period_start;
    v_period_end := v_subscription.current_period_end;
    v_limit := 2592000;
  else
    select trial.*
      into v_trial
    from public.trial_run_cameras participant
    join public.trial_runs trial
      on trial.id = participant.trial_run_id
    where participant.organization_id = p_organization_id
      and participant.camera_id = p_camera_id
      and participant.status <> 'removed'
      and trial.organization_id = p_organization_id
      and trial.status = 'running'
      and trial.capture_started_at is not null
      and trial.capture_ends_at is not null
      and trial.capture_started_at <= now()
      and trial.capture_ends_at > now()
    order by trial.created_at desc
    limit 1;

    if found then
      select coalesce(participant.selected_plan_code, v_trial.selected_plan_code)
        into v_participant_plan
      from public.trial_run_cameras participant
      where participant.organization_id = p_organization_id
        and participant.camera_id = p_camera_id
        and participant.trial_run_id = v_trial.id
        and participant.status <> 'removed'
      limit 1;
    end if;

    if not found then
      select trial.*
        into v_trial
      from public.trial_runs trial
      where trial.organization_id = p_organization_id
        and trial.camera_id = p_camera_id
        and trial.status = 'running'
        and trial.capture_started_at is not null
        and trial.capture_ends_at is not null
        and trial.capture_started_at <= now()
        and trial.capture_ends_at > now()
      order by trial.created_at desc
      limit 1;

      if found then
        v_participant_plan := v_trial.selected_plan_code;
      end if;
    end if;

    -- Durante um trial iniciado por gravação, qualquer outro ambiente
    -- local da mesma organização compartilha o mesmo trial.
    if not found then
      select trial.*
        into v_trial
      from public.trial_runs trial
      join public.cameras trial_origin
        on trial_origin.id = trial.camera_id
       and trial_origin.organization_id = trial.organization_id
      where trial.organization_id = p_organization_id
        and trial_origin.source_kind = 'local_recording'
        and trial.status = 'running'
        and trial.capture_started_at is not null
        and trial.capture_ends_at is not null
        and trial.capture_started_at <= now()
        and trial.capture_ends_at > now()
      order by trial.created_at desc
      limit 1;

      if found then
        v_participant_plan := v_trial.selected_plan_code;
      end if;
    end if;

    if not found then
      raise exception 'recording_entitlement_required';
    end if;

    v_source := 'trial';
    v_plan_code := coalesce(v_participant_plan, v_trial.selected_plan_code);
    v_trial_run_id := v_trial.id;
    v_period_start := v_trial.capture_started_at;
    v_period_end := v_trial.capture_ends_at;
    v_limit := 86400; -- até 24 horas de gravações durante o trial
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      case
        when v_source = 'trial' and v_trial_run_id is not null
          then v_trial_run_id::text || ':recording-trial-quota'
        else p_camera_id::text || ':' || v_period_start::text
      end,
      0
    )
  );

  select coalesce(sum(
      case
        when session.status in ('reserved', 'processing')
          then session.reserved_seconds
        else session.processed_seconds
      end
    ), 0)
    into v_used
  from public.recording_sessions session
  where (
      (
        v_source = 'trial'
        and v_trial_run_id is not null
        and session.trial_run_id = v_trial_run_id
      )
      or
      (
        v_source <> 'trial'
        and session.camera_id = p_camera_id
      )
    )
    and session.quota_period_start = v_period_start
    and session.quota_period_end = v_period_end;

  if v_used + p_duration_seconds > v_limit then
    raise exception 'recording_quota_exceeded';
  end if;

  insert into public.recording_sessions (
    organization_id,
    camera_id,
    user_id,
    request_key,
    source_filename,
    file_size_bytes,
    duration_seconds,
    source_started_at,
    codec,
    width,
    height,
    decoder_mode,
    native_preview,
    quota_source,
    plan_code,
    trial_run_id,
    quota_period_start,
    quota_period_end,
    quota_limit_seconds,
    reserved_seconds,
    processed_seconds,
    browser_metadata
  )
  values (
    p_organization_id,
    p_camera_id,
    (select auth.uid()),
    btrim(p_request_key),
    left(coalesce(nullif(btrim(p_source_filename), ''), 'gravação'), 260),
    greatest(coalesce(p_file_size_bytes, 0), 0),
    p_duration_seconds,
    p_source_started_at,
    nullif(left(coalesce(p_codec, ''), 80), ''),
    p_width,
    p_height,
    p_decoder_mode,
    coalesce(p_native_preview, false),
    v_source,
    v_plan_code,
    v_trial_run_id,
    v_period_start,
    v_period_end,
    v_limit,
    p_duration_seconds,
    p_duration_seconds,
    coalesce(p_browser_metadata, '{}'::jsonb)
  )
  returning * into v_session;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'sessionId', v_session.id,
    'quotaSource', v_source,
    'planCode', v_plan_code,
    'trialRunId', v_trial_run_id,
    'quotaLimitSeconds', v_limit,
    'quotaUsedSeconds', v_used + p_duration_seconds,
    'quotaRemainingSeconds', greatest(v_limit - v_used - p_duration_seconds, 0),
    'quotaPeriodStart', v_period_start,
    'quotaPeriodEnd', v_period_end
  );
end;
$$;

revoke all on function public.reserve_monitoria_recording_session(
  uuid, uuid, text, text, bigint, integer, timestamptz,
  text, integer, integer, text, boolean, jsonb
) from public, anon;

grant execute on function public.reserve_monitoria_recording_session(
  uuid, uuid, text, text, bigint, integer, timestamptz,
  text, integer, integer, text, boolean, jsonb
) to authenticated, service_role;

commit;
