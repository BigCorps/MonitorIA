-- MonitorIA — Gravações
-- Alinha o teste por gravação ao teste de 24 horas do produto.
-- Máximo de 1h continua sendo aplicado por arquivo.

begin;

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
    where session.camera_id = v_existing.camera_id
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
      p_camera_id::text || ':' || v_period_start::text,
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
  where session.camera_id = p_camera_id
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

-- Estende também sessões pertencentes a trials que ainda estão ativos.
update public.recording_sessions
set
  quota_limit_seconds = 86400,
  updated_at = now()
where quota_source = 'trial'
  and quota_period_end > now()
  and quota_limit_seconds < 86400;

commit;
