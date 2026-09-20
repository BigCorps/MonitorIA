-- MonitorIA 1.0.3 — Gravações v1
-- Nova origem local de vídeo sem alterar o Agent 1.0.3 nem o pipeline de IA.
-- O arquivo original permanece no dispositivo; somente evidências entram no backend.

begin;

alter table public.cameras
  add column if not exists source_kind text not null default 'live_camera';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_source_kind_check'
  ) then
    alter table public.cameras
      add constraint cameras_source_kind_check
      check (source_kind in ('live_camera', 'local_recording'));
  end if;
end
$$;

comment on column public.cameras.source_kind is
  'Origem visual. live_camera usa Agent/ONVIF/RTSP; local_recording usa arquivos processados no navegador.';

create table if not exists public.recording_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,

  request_key text not null,
  status text not null default 'reserved'
    check (
      status in (
        'reserved',
        'processing',
        'completed',
        'completed_with_errors',
        'failed',
        'cancelled'
      )
    ),

  source_filename text not null,
  file_size_bytes bigint not null default 0 check (file_size_bytes >= 0),
  duration_seconds integer not null
    check (duration_seconds between 1 and 3600),
  source_started_at timestamptz not null,

  codec text,
  width integer check (width is null or width between 1 and 16384),
  height integer check (height is null or height between 1 and 16384),
  decoder_mode text check (
    decoder_mode is null or decoder_mode in ('native', 'compatibility')
  ),
  native_preview boolean not null default false,

  quota_source text not null
    check (
      quota_source in ('subscription', 'grace_period', 'trial', 'legacy')
    ),
  plan_code text not null
    check (plan_code in ('basic', 'standard', 'intensive')),
  trial_run_id uuid references public.trial_runs(id) on delete set null,
  quota_period_start timestamptz not null,
  quota_period_end timestamptz not null,
  quota_limit_seconds integer not null check (quota_limit_seconds > 0),
  reserved_seconds integer not null check (reserved_seconds between 1 and 3600),
  processed_seconds integer not null default 0 check (processed_seconds between 0 and reserved_seconds),

  candidate_count integer not null default 0 check (candidate_count >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  completed_event_count integer not null default 0 check (completed_event_count >= 0),
  mapping_ms integer check (mapping_ms is null or mapping_ms >= 0),
  analysis_ms integer check (analysis_ms is null or analysis_ms >= 0),

  browser_metadata jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,

  started_processing_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (organization_id, request_key),
  check (quota_period_end > quota_period_start)
);

create index if not exists recording_sessions_camera_period_idx
  on public.recording_sessions(camera_id, quota_period_start, quota_period_end);

create index if not exists recording_sessions_org_created_idx
  on public.recording_sessions(organization_id, created_at desc);

drop trigger if exists recording_sessions_set_updated_at
  on public.recording_sessions;
create trigger recording_sessions_set_updated_at
before update on public.recording_sessions
for each row execute function public.set_updated_at();

alter table public.recording_sessions enable row level security;

drop policy if exists recording_sessions_member_select
  on public.recording_sessions;

create policy recording_sessions_member_select
on public.recording_sessions
for select
to authenticated
using (private.is_org_member(organization_id));

revoke all on table public.recording_sessions from anon, authenticated;
grant select on table public.recording_sessions to authenticated;
grant all on table public.recording_sessions to service_role;

alter table public.analysis_jobs
  add column if not exists recording_session_id uuid
    references public.recording_sessions(id) on delete set null;

alter table public.event_ingestions
  add column if not exists recording_session_id uuid
    references public.recording_sessions(id) on delete set null;

alter table public.events
  add column if not exists recording_session_id uuid
    references public.recording_sessions(id) on delete set null;

create index if not exists analysis_jobs_recording_session_idx
  on public.analysis_jobs(recording_session_id)
  where recording_session_id is not null;

create index if not exists event_ingestions_recording_session_idx
  on public.event_ingestions(recording_session_id)
  where recording_session_id is not null;

create index if not exists events_recording_session_idx
  on public.events(recording_session_id, started_at)
  where recording_session_id is not null;

-- Fontes de gravação recebem os mesmos parâmetros locais dos três planos
-- utilizados pelo Agent. Fontes ao vivo nunca são alteradas.
create or replace function private.apply_recording_source_plan_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_kind <> 'local_recording' then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.analysis_plan_code is not distinct from old.analysis_plan_code
     and new.source_kind is not distinct from old.source_kind then
    return new;
  end if;

  if new.analysis_plan_code = 'basic' then
    new.capture_interval_seconds := 3;
    new.consolidation_interval_seconds := 60;
    new.motion_start_threshold := 1.5;
    new.motion_continue_threshold := 0.75;
    new.event_close_after_seconds := 45;
    new.motion_start_consecutive_frames := 3;
    new.motion_end_consecutive_frames := 4;
    new.motion_cooldown_seconds := 15;
  elsif new.analysis_plan_code = 'intensive' then
    new.capture_interval_seconds := 1;
    new.consolidation_interval_seconds := 5;
    new.motion_start_threshold := 1.0;
    new.motion_continue_threshold := 0.50;
    new.event_close_after_seconds := 25;
    new.motion_start_consecutive_frames := 3;
    new.motion_end_consecutive_frames := 8;
    new.motion_cooldown_seconds := 15;
  else
    new.capture_interval_seconds := 1;
    new.consolidation_interval_seconds := 10;
    new.motion_start_threshold := 1.25;
    new.motion_continue_threshold := 0.60;
    new.event_close_after_seconds := 20;
    new.motion_start_consecutive_frames := 3;
    new.motion_end_consecutive_frames := 6;
    new.motion_cooldown_seconds := 10;
  end if;

  new.motion_adaptive_enabled := true;
  return new;
end;
$$;

revoke all on function private.apply_recording_source_plan_defaults()
  from public, anon, authenticated;
grant execute on function private.apply_recording_source_plan_defaults()
  to service_role;

drop trigger if exists trg_cameras_recording_plan_defaults on public.cameras;
create trigger trg_cameras_recording_plan_defaults
before insert or update of analysis_plan_code, source_kind
on public.cameras
for each row execute function private.apply_recording_source_plan_defaults();

-- Reserva atômica da franquia. Cada assinatura de Gravações possui até
-- 720h/ciclo. O trial já existente continua único; por arquivo ele libera
-- no máximo 10 minutos totais.
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
    v_limit := 600; -- gravações: no máximo 10 minutos no trial
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

-- Fontes por arquivo não exigem câmera online, pareamento ou Agent para
-- estarem prontas para trial; exigem o mesmo perfil visual ativo.
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

  select profile.id
    into v_profile_id
  from public.camera_profiles profile
  where profile.organization_id = p_organization_id
    and profile.camera_id = p_camera_id
    and profile.is_active
  order by profile.version desc
  limit 1;

  v_profile_ready := v_profile_id is not null;

  if v_camera.source_kind = 'local_recording' then
    if not v_profile_ready then
      v_reasons := v_reasons || jsonb_build_array('active_profile_required');
    end if;

    v_ready := v_profile_ready;

    return jsonb_build_object(
      'ready', v_ready,
      'cameraFound', true,
      'sourceKind', 'local_recording',
      'cameraId', v_camera.id,
      'cameraName', v_camera.name,
      'cameraOnline', true,
      'cameraPaired', true,
      'activeProfile', v_profile_ready,
      'activeProfileId', v_profile_id,
      'agentCameraEnabled', false,
      'agentId', null,
      'agentName', null,
      'agentOnline', false,
      'agentHeartbeatRecent', false,
      'lastHeartbeatAt', null,
      'reasons', v_reasons,
      'checkedAt', now()
    );
  end if;

  v_camera_online := v_camera.status = 'online';
  v_camera_paired := coalesce(v_camera.pairing_status, '') = 'paired';

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
    'sourceKind', 'live_camera',
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

-- O trigger de entitlement continua sendo a autoridade comercial. Para
-- gravações históricas, o timestamp visual pode ser antigo; o trial é validado
-- pelo relógio atual da sessão, e não pelo timestamp original do vídeo.
create or replace function private.enforce_monitoria_analysis_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enforcement boolean := true;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_recording public.recording_sessions%rowtype;
  v_plan_code text;
begin
  -- Uma sessão de gravação já reservou atomicamente a franquia e congelou o
  -- plano válido naquele ciclo. Isto permite processar um vídeo histórico e
  -- também terminar um arquivo que começou antes da virada do ciclo.
  if new.recording_session_id is not null then
    select session.*
      into v_recording
    from public.recording_sessions session
    where session.id = new.recording_session_id
      and session.organization_id = new.organization_id
      and session.camera_id = new.camera_id
      and session.status in (
        'reserved',
        'processing',
        'completed',
        'completed_with_errors'
      );

    if not found then
      raise exception 'recording_session_not_authorized';
    end if;

    new.analysis_plan_code := v_recording.plan_code;
    new.trial_run_id := v_recording.trial_run_id;
    return new;
  end if;

  if new.source_agent_id is null and new.agent_event_id is null then
    return new;
  end if;

  select coalesce(account.entitlement_enforcement_enabled, true)
    into v_enforcement
  from public.billing_accounts account
  where account.organization_id = new.organization_id;

  if not coalesce(v_enforcement, true) then
    return new;
  end if;

  -- Caminho original de câmeras ao vivo, preservado.
  select subscription.*
    into v_subscription
  from public.camera_subscriptions subscription
  where subscription.camera_id = new.camera_id;

  if v_subscription.status = 'active'
     and v_subscription.current_period_end > now() then
    v_plan_code := v_subscription.plan_code;
  elsif v_subscription.status = 'grace_period'
        and v_subscription.grace_ends_at > now() then
    v_plan_code := v_subscription.plan_code;
  else
    select trial.*
      into v_trial
    from public.trial_run_cameras participant
    join public.trial_runs trial
      on trial.id = participant.trial_run_id
    where participant.camera_id = new.camera_id
      and participant.organization_id = new.organization_id
      and participant.status <> 'removed'
      and trial.organization_id = new.organization_id
      and trial.capture_started_at is not null
      and trial.capture_ends_at is not null
      and new.started_at >= trial.capture_started_at
      and new.started_at <= trial.capture_ends_at
      and trial.status in ('running', 'capture_completed', 'exploration')
    order by trial.created_at desc
    limit 1;

    if found then
      select coalesce(participant.selected_plan_code, v_trial.selected_plan_code)
        into v_plan_code
      from public.trial_run_cameras participant
      where participant.trial_run_id = v_trial.id
        and participant.camera_id = new.camera_id
        and participant.organization_id = new.organization_id
        and participant.status <> 'removed'
      limit 1;

      new.trial_run_id := v_trial.id;
    else
      select trial.*
        into v_trial
      from public.trial_runs trial
      where trial.organization_id = new.organization_id
        and trial.camera_id = new.camera_id
        and trial.capture_started_at is not null
        and trial.capture_ends_at is not null
        and new.started_at >= trial.capture_started_at
        and new.started_at <= trial.capture_ends_at
        and trial.status in ('running', 'capture_completed', 'exploration')
      order by trial.created_at desc
      limit 1;

      if found then
        v_plan_code := v_trial.selected_plan_code;
        new.trial_run_id := v_trial.id;
      end if;
    end if;
  end if;

  if v_plan_code is null then
    raise exception 'camera_monitoring_not_allowed';
  end if;

  new.analysis_plan_code := v_plan_code;
  return new;
end;
$function$;

revoke all on function private.enforce_monitoria_analysis_entitlement()
  from public, anon, authenticated;
grant execute on function private.enforce_monitoria_analysis_entitlement()
  to service_role;

-- Faz o evento final herdar a sessão de gravação sem tocar na transação
-- central de commit do pipeline já validado.
create or replace function private.propagate_recording_session_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.recording_session_id is null and new.analysis_job_id is not null then
    select job.recording_session_id
      into new.recording_session_id
    from public.analysis_jobs job
    where job.id = new.analysis_job_id;
  end if;

  return new;
end;
$$;

revoke all on function private.propagate_recording_session_id()
  from public, anon, authenticated;
grant execute on function private.propagate_recording_session_id()
  to service_role;

drop trigger if exists trg_events_recording_session_id on public.events;
create trigger trg_events_recording_session_id
before insert on public.events
for each row execute function private.propagate_recording_session_id();


-- A retenção normal continua ancorada no acontecimento para câmeras ao vivo.
-- Em gravações históricas, ancorar no horário original faria o registro nascer
-- expirado. Para recording_session_id, o ciclo começa na importação.
create or replace function private.reclassify_monitoria_job_assets(
  p_job_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.analysis_jobs%rowtype;
  v_event public.events%rowtype;
  v_snapshot jsonb;
  v_plan_code text;
  v_long_term_count integer;
  v_metadata_days integer;
  v_temporary_days integer;
  v_clip_days integer;
  v_trial_status public.trial_run_status;
  v_trial_purge_after timestamptz;
  v_recording_anchor timestamptz := null;
  v_promoted integer := 0;
  v_temporary integer := 0;
  v_clips integer := 0;
begin
  select job.*
    into v_job
  from public.analysis_jobs job
  where job.id = p_job_id;

  if not found then
    return jsonb_build_object(
      'success', false,
      'reason', 'analysis_job_not_found',
      'analysisJobId', p_job_id
    );
  end if;

  if v_job.recording_session_id is not null then
    select session.created_at
      into v_recording_anchor
    from public.recording_sessions session
    where session.id = v_job.recording_session_id;
  end if;

  v_plan_code := coalesce(
    nullif(v_job.retention_snapshot->>'planCode', ''),
    v_job.analysis_plan_code,
    'basic'
  );
  v_snapshot := v_job.retention_snapshot;

  if v_snapshot is null or v_snapshot = '{}'::jsonb then
    v_snapshot := private.monitoria_retention_snapshot(v_plan_code);
    update public.analysis_jobs
    set retention_snapshot = v_snapshot
    where id = p_job_id;
  end if;

  v_long_term_count := greatest(
    0,
    coalesce((v_snapshot->>'longTermKeyframes')::integer, 1)
  );
  v_metadata_days := greatest(
    1,
    coalesce((v_snapshot->>'metadataRetentionDays')::integer, 365)
  );
  v_temporary_days := greatest(
    1,
    coalesce((v_snapshot->>'temporaryFrameDays')::integer, 3)
  );
  v_clip_days := greatest(
    1,
    coalesce((v_snapshot->>'clipRetentionDays')::integer, 30)
  );

  select event.*
    into v_event
  from public.events event
  where event.analysis_job_id = p_job_id;

  if v_job.trial_run_id is not null then
    select trial.status, trial.purge_after
      into v_trial_status, v_trial_purge_after
    from public.trial_runs trial
    where trial.id = v_job.trial_run_id;
  end if;

  update public.storage_assets asset
  set
    retention_class = 'clip',
    frame_label = 'clip',
    retention_snapshot = v_snapshot,
    expires_at = case
      when coalesce((v_snapshot->>'clipEnabled')::boolean, false)
        then coalesce(
          v_recording_anchor,
          asset.captured_at,
          v_job.ended_at,
          asset.created_at
        ) + pg_catalog.make_interval(days => v_clip_days)
      else least(coalesce(asset.expires_at, now()), now())
    end
  where asset.analysis_job_id = p_job_id
    and asset.kind = 'preserved_clip'::public.asset_kind
    and asset.deleted_at is null;

  get diagnostics v_clips = row_count;

  if v_event.id is null then
    update public.storage_assets asset
    set
      event_id = null,
      kind = 'analysis_frame'::public.asset_kind,
      retention_class = 'temporary',
      retention_snapshot = v_snapshot,
      expires_at = coalesce(
        v_recording_anchor,
        asset.captured_at,
        v_job.ended_at,
        asset.created_at
      ) + pg_catalog.make_interval(days => v_temporary_days)
    where asset.analysis_job_id = p_job_id
      and asset.kind <> 'preserved_clip'::public.asset_kind
      and asset.deleted_at is null;

    get diagnostics v_temporary = row_count;
  else
    update public.events
    set
      retention_snapshot = v_snapshot,
      expires_at = coalesce(
        v_recording_anchor,
        v_event.started_at
      ) + pg_catalog.make_interval(days => v_metadata_days),
      updated_at = now()
    where id = v_event.id;

    with ranked as (
      select
        asset.id,
        row_number() over (
          order by
            private.monitoria_frame_priority(
              v_plan_code,
              asset.frame_label
            ),
            asset.captured_at nulls last,
            asset.id
        ) as frame_rank
      from public.storage_assets asset
      where asset.analysis_job_id = p_job_id
        and asset.kind <> 'preserved_clip'::public.asset_kind
        and asset.deleted_at is null
    )
    update public.storage_assets asset
    set
      event_id = v_event.id,
      kind = case
        when ranked.frame_rank <= v_long_term_count
          then 'event_keyframe'::public.asset_kind
        else 'analysis_frame'::public.asset_kind
      end,
      retention_class = case
        when ranked.frame_rank <= v_long_term_count
          then 'long_term'
        else 'temporary'
      end,
      retention_snapshot = v_snapshot,
      expires_at = case
        when ranked.frame_rank <= v_long_term_count
          then coalesce(
            v_recording_anchor,
            v_event.started_at
          ) + pg_catalog.make_interval(days => v_metadata_days)
        else coalesce(
          v_recording_anchor,
          asset.captured_at,
          v_job.ended_at,
          asset.created_at
        ) + pg_catalog.make_interval(days => v_temporary_days)
      end
    from ranked
    where asset.id = ranked.id;

    select
      count(*) filter (where retention_class = 'long_term'),
      count(*) filter (where retention_class = 'temporary')
      into v_promoted, v_temporary
    from public.storage_assets
    where analysis_job_id = p_job_id
      and kind <> 'preserved_clip'::public.asset_kind
      and deleted_at is null;
  end if;

  if v_trial_status is distinct from 'converted'::public.trial_run_status
     and v_trial_purge_after is not null then
    update public.events
    set
      expires_at = least(expires_at, v_trial_purge_after),
      updated_at = now()
    where analysis_job_id = p_job_id;

    update public.storage_assets
    set expires_at = least(expires_at, v_trial_purge_after)
    where analysis_job_id = p_job_id
      and deleted_at is null
      and expires_at is not null;
  end if;

  return jsonb_build_object(
    'success', true,
    'analysisJobId', p_job_id,
    'eventId', v_event.id,
    'planCode', v_plan_code,
    'recordingRetentionAnchor', v_recording_anchor,
    'longTermAssets', v_promoted,
    'temporaryAssets', v_temporary,
    'clipAssets', v_clips
  );
end;
$$;

revoke all on function private.reclassify_monitoria_job_assets(uuid)
  from public, anon, authenticated;
grant execute on function private.reclassify_monitoria_job_assets(uuid)
  to service_role;

commit;
