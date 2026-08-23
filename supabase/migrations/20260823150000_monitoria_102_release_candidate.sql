-- MonitorIA 1.0.2 RC
-- Durabilidade de ingestão, fila independente de clipes, timeline pendente e telemetria escalável.
-- Esta migration é aditiva e idempotente. Não remove dados da 1.0.1.

begin;

-- ---------------------------------------------------------------------------
-- 1. Recibo durável: existe antes de qualquer chamada de IA.
-- ---------------------------------------------------------------------------
create table if not exists public.event_ingestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  source_agent_id uuid null references public.agents(id) on delete set null,
  analysis_job_id uuid not null unique references public.analysis_jobs(id) on delete cascade,
  agent_event_id uuid not null,
  capture_session_id uuid null references public.capture_sessions(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  local_metrics jsonb not null default '{}'::jsonb,
  analysis_context jsonb not null default '{}'::jsonb,
  prepared_analysis jsonb null,
  prepared_analysis_meta jsonb null,
  ai_completed_at timestamptz null,
  status text not null default 'receiving',
  expected_frame_count integer not null default 1,
  evidence_ready_at timestamptz null,
  attempt_count integer not null default 0,
  last_error text null,
  processing_started_at timestamptz null,
  processing_heartbeat_at timestamptz null,
  processing_lease_token uuid null,
  processing_lease_expires_at timestamptz null,
  completed_at timestamptz null,
  next_retry_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_ingestions_status_check check (
    status = any (array['receiving','queued','processing','completed','retry','failed_terminal']::text[])
  ),
  constraint event_ingestions_window_check check (ended_at >= started_at),
  constraint event_ingestions_expected_frames_check check (expected_frame_count between 1 and 4),
  constraint event_ingestions_metrics_object_check check (jsonb_typeof(local_metrics) = 'object'),
  constraint event_ingestions_context_object_check check (jsonb_typeof(analysis_context) = 'object'),
  constraint event_ingestions_prepared_analysis_object_check check (prepared_analysis is null or jsonb_typeof(prepared_analysis) = 'object'),
  constraint event_ingestions_prepared_meta_object_check check (prepared_analysis_meta is null or jsonb_typeof(prepared_analysis_meta) = 'object'),
  constraint event_ingestions_camera_event_key unique (camera_id, agent_event_id)
);

-- Também cobre reexecução após uma aplicação parcial da migration.
alter table public.event_ingestions
  add column if not exists analysis_context jsonb not null default '{}'::jsonb,
  add column if not exists prepared_analysis jsonb null,
  add column if not exists prepared_analysis_meta jsonb null,
  add column if not exists ai_completed_at timestamptz null,
  add column if not exists processing_lease_token uuid null,
  add column if not exists processing_lease_expires_at timestamptz null;

-- Em uma execução interrompida, CREATE TABLE pode ter sido confirmado por uma
-- ferramenta externa antes das constraints seguintes. Recria invariantes pelo
-- catálogo sem depender do nome/estado da tentativa anterior.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_ingestions_status_check' and conrelid = 'public.event_ingestions'::regclass) then
    alter table public.event_ingestions add constraint event_ingestions_status_check check (
      status = any (array['receiving','queued','processing','completed','retry','failed_terminal']::text[])
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_ingestions_window_check' and conrelid = 'public.event_ingestions'::regclass) then
    alter table public.event_ingestions add constraint event_ingestions_window_check check (ended_at >= started_at);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_ingestions_expected_frames_check' and conrelid = 'public.event_ingestions'::regclass) then
    alter table public.event_ingestions add constraint event_ingestions_expected_frames_check check (expected_frame_count between 1 and 4);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_ingestions_camera_event_key' and conrelid = 'public.event_ingestions'::regclass) then
    alter table public.event_ingestions add constraint event_ingestions_camera_event_key unique (camera_id, agent_event_id);
  end if;
end
$$;

create index if not exists event_ingestions_lease_idx
  on public.event_ingestions(processing_lease_expires_at)
  where processing_lease_token is not null;

create index if not exists event_ingestions_status_retry_idx
  on public.event_ingestions(status, next_retry_at, created_at);
create index if not exists event_ingestions_agent_status_idx
  on public.event_ingestions(source_agent_id, status, created_at);
create index if not exists event_ingestions_camera_time_idx
  on public.event_ingestions(camera_id, started_at desc);

alter table public.event_ingestions enable row level security;
revoke all on public.event_ingestions from public, anon, authenticated;
grant all on public.event_ingestions to service_role;

comment on table public.event_ingestions is
  'Recibo durável do acontecimento recebido pelo Agent 1.0.2. É persistido antes do ACK e sobrevive a falhas/redeploys da análise.';

create table if not exists public.event_ingestion_frames (
  ingestion_id uuid not null references public.event_ingestions(id) on delete cascade,
  frame_label text not null,
  storage_asset_id uuid not null references public.storage_assets(id) on delete cascade,
  storage_path text not null,
  captured_at timestamptz not null,
  width integer null,
  height integer null,
  byte_size bigint not null,
  content_sha256 text not null,
  timeline jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (ingestion_id, frame_label),
  constraint event_ingestion_frames_label_check check (
    frame_label = any (array['start','peak','end','extra','verification']::text[])
  ),
  constraint event_ingestion_frames_sha256_check check (content_sha256 ~ '^[a-f0-9]{64}$'),
  constraint event_ingestion_frames_timeline_object_check check (jsonb_typeof(timeline) = 'object')
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_ingestion_frames_label_check' and conrelid = 'public.event_ingestion_frames'::regclass) then
    alter table public.event_ingestion_frames add constraint event_ingestion_frames_label_check check (
      frame_label = any (array['start','peak','end','extra','verification']::text[])
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_ingestion_frames_sha256_check' and conrelid = 'public.event_ingestion_frames'::regclass) then
    alter table public.event_ingestion_frames add constraint event_ingestion_frames_sha256_check check (content_sha256 ~ '^[a-f0-9]{64}$');
  end if;
end
$$;

create index if not exists event_ingestion_frames_asset_idx
  on public.event_ingestion_frames(storage_asset_id);

alter table public.event_ingestion_frames enable row level security;
revoke all on public.event_ingestion_frames from public, anon, authenticated;
grant all on public.event_ingestion_frames to service_role;

-- Relação explícita para diagnóstico/recuperação. Mantém analysis_jobs como fonte
-- de verdade do estado público da análise.
alter table public.analysis_jobs
  add column if not exists ingestion_id uuid null,
  add column if not exists processing_started_at timestamptz null,
  add column if not exists processing_heartbeat_at timestamptz null;

create unique index if not exists analysis_jobs_ingestion_uidx
  on public.analysis_jobs(ingestion_id)
  where ingestion_id is not null;
create index if not exists analysis_jobs_pending_recovery_idx
  on public.analysis_jobs(status, updated_at)
  where status in ('queued'::public.analysis_job_status, 'processing'::public.analysis_job_status);

-- FK é criada depois das duas estruturas existirem, para permitir execução idempotente.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_jobs_ingestion_id_fkey'
  ) then
    alter table public.analysis_jobs
      add constraint analysis_jobs_ingestion_id_fkey
      foreign key (ingestion_id)
      references public.event_ingestions(id)
      on delete set null;
  end if;
end
$$;

-- Claim exclusivo da análise. O disparo pós-ACK e o recovery usam a mesma lease,
-- portanto timeout/redeploy não cria duas chamadas de IA.
create or replace function public.claim_monitoria_event_ingestion(
  p_ingestion_id uuid,
  p_lease_seconds integer default 600
)
returns table(
  ingestion_id uuid,
  analysis_job_id uuid,
  lease_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim uuid := gen_random_uuid();
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 600), 1800));
  v_job_id uuid;
begin
  perform private.require_monitoria_service_role();

  update public.event_ingestions e
  set status = 'processing',
      processing_lease_token = v_claim,
      processing_lease_expires_at = now() + make_interval(secs => v_lease),
      processing_started_at = coalesce(e.processing_started_at, now()),
      processing_heartbeat_at = now(),
      attempt_count = e.attempt_count + 1,
      last_error = null,
      updated_at = now()
  where e.id = p_ingestion_id
    and e.evidence_ready_at is not null
    and e.status <> 'completed'
    and e.status <> 'failed_terminal'
    and (e.status <> 'retry' or e.next_retry_at is null or e.next_retry_at <= now())
    and (
      e.processing_lease_token is null
      or e.processing_lease_expires_at is null
      or e.processing_lease_expires_at <= now()
    )
  returning e.analysis_job_id into v_job_id;

  if v_job_id is null then
    return;
  end if;

  update public.analysis_jobs aj
  set processing_started_at = coalesce(aj.processing_started_at, now()),
      processing_heartbeat_at = now(),
      updated_at = now()
  where aj.id = v_job_id;

  return query select p_ingestion_id, v_job_id, v_claim;
end;
$$;

revoke all on function public.claim_monitoria_event_ingestion(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_monitoria_event_ingestion(uuid, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 2. Clipes: claim independente da fila de acontecimentos.
-- ---------------------------------------------------------------------------
alter table public.clip_generation_requests
  add column if not exists agent_event_id uuid null,
  add column if not exists claim_token uuid null,
  add column if not exists claim_expires_at timestamptz null,
  add column if not exists claimed_at timestamptz null,
  add column if not exists next_attempt_at timestamptz null;

create index if not exists clip_generation_requests_agent_pending_idx
  on public.clip_generation_requests(agent_id, status, created_at)
  where status in ('pending','uploading');

drop function if exists public.claim_monitoria_clip_request(uuid, uuid, integer);

create or replace function public.claim_monitoria_clip_request(
  p_agent_id uuid,
  p_organization_id uuid,
  p_lease_seconds integer default 600
)
returns table(
  request_id uuid,
  asset_id uuid,
  event_id uuid,
  camera_id uuid,
  agent_event_id uuid,
  storage_path text,
  clip_starts_at timestamptz,
  clip_ends_at timestamptz,
  duration_seconds integer,
  attempt_count integer,
  claim_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.clip_generation_requests%rowtype;
  v_claim uuid := gen_random_uuid();
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 600), 3600));
begin
  perform private.require_monitoria_service_role();

  -- Claims cujo Agent caiu voltam a ficar disponíveis. A operação é segura
  -- porque a conclusão é idempotente e o Storage usa upsert.
  update public.clip_generation_requests c
  set status = 'pending',
      claim_token = null,
      claim_expires_at = null,
      updated_at = now()
  where c.agent_id = p_agent_id
    and c.organization_id = p_organization_id
    and c.status = 'uploading'
    and c.claim_expires_at is not null
    and c.claim_expires_at <= now();

  select c.*
    into v_request
  from public.clip_generation_requests c
  where c.agent_id = p_agent_id
    and c.organization_id = p_organization_id
    and c.status = 'pending'
    and coalesce(c.next_attempt_at, c.created_at) <= now()
  order by coalesce(c.next_attempt_at, c.created_at), c.created_at
  for update skip locked
  limit 1;

  if not found then
    return;
  end if;

  update public.clip_generation_requests c
  set status = 'uploading',
      claim_token = v_claim,
      claimed_at = now(),
      claim_expires_at = now() + make_interval(secs => v_lease),
      upload_expires_at = null,
      attempt_count = c.attempt_count + 1,
      error_code = null,
      error_message = null,
      next_attempt_at = null,
      updated_at = now()
  where c.id = v_request.id;

  return query
  select
    v_request.id,
    v_request.storage_asset_id,
    v_request.event_id,
    v_request.camera_id,
    v_request.agent_event_id,
    v_request.storage_path,
    v_request.clip_starts_at,
    v_request.clip_ends_at,
    v_request.duration_seconds,
    v_request.attempt_count + 1,
    v_claim;
end;
$$;

revoke all on function public.claim_monitoria_clip_request(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_monitoria_clip_request(uuid, uuid, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. Timeline única: concluídos + jobs ainda em análise, em uma paginação.
-- Preserva todos os campos que a UI já exibia em search_monitoria_events.
-- ---------------------------------------------------------------------------
create or replace function public.search_monitoria_timeline_v2(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_camera_ids uuid[] default null,
  p_site_id uuid default null,
  p_event_type text default null,
  p_review_filter text default 'all',
  p_limit integer default 24,
  p_offset integer default 0
)
returns table(
  row_kind text,
  row_id uuid,
  analysis_job_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds numeric,
  camera_id uuid,
  camera_name text,
  site_id uuid,
  site_name text,
  headline text,
  event_type text,
  original_event_type text,
  summary text,
  confidence numeric,
  requires_review boolean,
  review_status text,
  human_verdict text,
  human_reviewed_at timestamptz,
  tags text[],
  people_count bigint,
  vehicle_count bigint,
  interaction_group_id uuid,
  is_continuation boolean,
  interaction_event_count integer,
  probable_people_count integer,
  probable_customer_count integer,
  probable_staff_count integer,
  continuity_confidence numeric,
  operational_session_id uuid,
  session_type text,
  session_status text,
  session_chapter_type text,
  session_chapter_order integer,
  session_chapter_count integer,
  session_duration_seconds numeric,
  session_confidence numeric,
  thumbnail_asset_id uuid,
  processing_status text,
  last_error text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_cameras as (
    select c.id, c.name, c.site_id, s.name as site_name
    from public.cameras c
    join public.sites s on s.id = c.site_id
    where c.organization_id = p_organization_id
      and s.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and (p_camera_ids is null or cardinality(p_camera_ids) = 0 or c.id = any(p_camera_ids))
      and (p_site_id is null or c.site_id = p_site_id)
  ), completed as (
    select
      'event'::text as row_kind,
      e.id as row_id,
      e.analysis_job_id,
      e.started_at,
      e.ended_at,
      pg_catalog.date_part('epoch', e.ended_at - e.started_at)::numeric as duration_seconds,
      e.camera_id,
      c.name as camera_name,
      e.site_id,
      c.site_name,
      coalesce(nullif(e.headline, ''), 'Acontecimento registrado') as headline,
      coalesce(e.corrected_event_type, e.primary_event_type) as event_type,
      e.primary_event_type as original_event_type,
      e.summary,
      e.confidence,
      e.requires_review,
      e.review_status::text,
      e.human_verdict,
      e.human_reviewed_at,
      e.tags,
      (select pg_catalog.count(*) from public.event_people person where person.event_id = e.id) as people_count,
      (select pg_catalog.count(*) from public.event_vehicles vehicle where vehicle.event_id = e.id) as vehicle_count,
      e.interaction_group_id,
      e.is_continuation,
      e.interaction_event_count,
      e.probable_people_count,
      e.probable_customer_count,
      e.probable_staff_count,
      e.continuity_confidence,
      e.operational_session_id,
      e.session_type,
      e.session_status,
      e.session_chapter_type,
      e.session_chapter_order,
      e.session_chapter_count,
      e.session_duration_seconds,
      e.session_confidence,
      (
        select sa.id
        from public.storage_assets sa
        where sa.event_id = e.id
          and sa.status = 'ready'::public.asset_status
          and sa.deleted_at is null
        order by
          case sa.frame_label when 'peak' then 0 when 'start' then 1 when 'end' then 2 else 3 end,
          sa.captured_at
        limit 1
      ) as thumbnail_asset_id,
      'completed'::text as processing_status,
      null::text as last_error
    from public.events e
    join eligible_cameras c on c.id = e.camera_id
    where e.organization_id = p_organization_id
      and e.deleted_at is null
      and (
        e.human_verdict is distinct from 'irrelevant'
        or coalesce(p_review_filter, 'all') in ('irrelevant', 'reviewed')
      )
      and (p_from is null or e.started_at >= p_from)
      and (p_to is null or e.started_at < p_to)
      and (
        nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
        or coalesce(e.corrected_event_type, e.primary_event_type) = p_event_type
      )
      and (
        coalesce(p_review_filter, 'all') = 'all'
        or (p_review_filter = 'pending' and e.review_status = 'pending'::public.review_status)
        or (p_review_filter = 'required' and e.requires_review)
        or (p_review_filter = 'reviewed' and e.human_reviewed_at is not null)
        or e.human_verdict = p_review_filter
      )
  ), pending as (
    select
      'analysis'::text as row_kind,
      aj.id as row_id,
      aj.id as analysis_job_id,
      aj.started_at,
      aj.ended_at,
      pg_catalog.date_part('epoch', aj.ended_at - aj.started_at)::numeric as duration_seconds,
      aj.camera_id,
      c.name as camera_name,
      c.site_id,
      c.site_name,
      case
        when ei.status = 'failed_terminal' then 'Falha na análise'
        when aj.status = 'failed'::public.analysis_job_status then 'Análise será retomada'
        else 'Analisando…'
      end as headline,
      'processing'::text as event_type,
      'processing'::text as original_event_type,
      case
        when ei.status = 'failed_terminal' then 'O acontecimento e suas evidências foram preservados, mas a análise exige atenção técnica.'
        when aj.status = 'failed'::public.analysis_job_status then 'O MonitorIA preservou o acontecimento e vai tentar a análise novamente.'
        else 'O acontecimento já foi recebido e está sendo analisado.'
      end as summary,
      null::numeric as confidence,
      false as requires_review,
      'processing'::text as review_status,
      null::text as human_verdict,
      null::timestamptz as human_reviewed_at,
      '{}'::text[] as tags,
      0::bigint as people_count,
      0::bigint as vehicle_count,
      null::uuid as interaction_group_id,
      false as is_continuation,
      0::integer as interaction_event_count,
      0::integer as probable_people_count,
      0::integer as probable_customer_count,
      0::integer as probable_staff_count,
      0::numeric as continuity_confidence,
      null::uuid as operational_session_id,
      null::text as session_type,
      null::text as session_status,
      null::text as session_chapter_type,
      null::integer as session_chapter_order,
      0::integer as session_chapter_count,
      0::numeric as session_duration_seconds,
      0::numeric as session_confidence,
      (
        select sa.id
        from public.storage_assets sa
        where sa.analysis_job_id = aj.id
          and sa.mime_type = 'image/jpeg'
          and sa.status = 'ready'::public.asset_status
          and sa.deleted_at is null
        order by
          case sa.frame_label when 'peak' then 0 when 'start' then 1 when 'end' then 2 else 3 end,
          sa.captured_at
        limit 1
      ) as thumbnail_asset_id,
      coalesce(ei.status, aj.status::text) as processing_status,
      coalesce(ei.last_error, aj.last_error) as last_error
    from public.analysis_jobs aj
    join eligible_cameras c on c.id = aj.camera_id
    left join public.event_ingestions ei on ei.analysis_job_id = aj.id
    where aj.organization_id = p_organization_id
      and aj.status in (
        'queued'::public.analysis_job_status,
        'processing'::public.analysis_job_status,
        'failed'::public.analysis_job_status
      )
      and (p_from is null or aj.started_at >= p_from)
      and (p_to is null or aj.started_at < p_to)
      and nullif(pg_catalog.btrim(coalesce(p_event_type, '')), '') is null
      and coalesce(p_review_filter, 'all') = 'all'
      and not exists (select 1 from public.events e where e.analysis_job_id = aj.id)
  ), all_rows as (
    select * from completed
    union all
    select * from pending
  )
  select all_rows.*, pg_catalog.count(*) over() as total_count
  from all_rows
  order by all_rows.started_at desc, all_rows.row_id desc
  limit greatest(1, least(coalesce(p_limit, 24), 200))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.search_monitoria_timeline_v2(
  uuid, timestamptz, timestamptz, uuid[], uuid, text, text, integer, integer
) from public, anon;
grant execute on function public.search_monitoria_timeline_v2(
  uuid, timestamptz, timestamptz, uuid[], uuid, text, text, integer, integer
) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Telemetria: mantém raw curto e amplia o rollup horário.
-- ---------------------------------------------------------------------------
alter table public.agent_health_hourly
  add column if not exists maximum_queue_age_seconds integer not null default 0,
  add column if not exists maximum_queue_bytes bigint not null default 0,
  add column if not exists maximum_active_cameras integer not null default 0,
  add column if not exists maximum_degraded_cameras integer not null default 0,
  add column if not exists events_sent bigint not null default 0,
  add column if not exists clips_sent bigint not null default 0,
  add column if not exists rtsp_reconnects bigint not null default 0,
  add column if not exists video_evidence_evictions bigint not null default 0,
  add column if not exists video_timeline_evictions bigint not null default 0,
  add column if not exists maximum_clip_backlog integer not null default 0;

create or replace function public.rollup_monitoria_agent_health_v2(
  p_before timestamptz default date_trunc('hour', now())
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows bigint := 0;
begin
  perform private.require_monitoria_service_role();

  insert into public.agent_health_hourly (
    organization_id, agent_id, hour, status,
    average_cpu_percent, maximum_cpu_percent, average_memory_bytes,
    minimum_disk_free_bytes, maximum_queued_events, samples,
    maximum_queue_age_seconds, maximum_queue_bytes,
    maximum_active_cameras, maximum_degraded_cameras,
    events_sent, clips_sent, rtsp_reconnects, video_evidence_evictions, video_timeline_evictions, maximum_clip_backlog
  )
  select
    h.organization_id,
    h.agent_id,
    date_trunc('hour', h.recorded_at) as hour,
    (array_agg(h.status order by h.recorded_at desc))[1] as status,
    avg(h.cpu_percent),
    max(h.cpu_percent),
    avg(h.memory_bytes),
    min(h.disk_free_bytes),
    max(h.queued_events),
    count(*)::integer,
    max(coalesce((h.metadata->>'queueAgeSeconds')::integer, 0)),
    max(coalesce((h.metadata->>'queueBytes')::bigint, 0)),
    max(coalesce((h.metadata->>'activeCameras')::integer, 0)),
    max(coalesce((h.metadata->>'degradedCameras')::integer, 0)),
    sum(coalesce((h.metadata->>'eventsSentDelta')::bigint, 0)),
    sum(coalesce((h.metadata->>'clipsSentDelta')::bigint, 0)),
    sum(coalesce((h.metadata->>'rtspReconnectsDelta')::bigint, 0)),
    sum(coalesce((h.metadata->>'videoEvidenceEvictionsDelta')::bigint, 0)),
    sum(coalesce((h.metadata->>'videoTimelineEvictionsDelta')::bigint, 0)),
    max(coalesce((h.metadata->>'clipBacklog')::integer, 0))
  from public.agent_health h
  where h.recorded_at < p_before
    and h.recorded_at >= p_before - interval '48 hours'
  group by h.organization_id, h.agent_id, date_trunc('hour', h.recorded_at)
  on conflict (agent_id, hour)
  do update set
    status = excluded.status,
    average_cpu_percent = excluded.average_cpu_percent,
    maximum_cpu_percent = excluded.maximum_cpu_percent,
    average_memory_bytes = excluded.average_memory_bytes,
    minimum_disk_free_bytes = excluded.minimum_disk_free_bytes,
    maximum_queued_events = excluded.maximum_queued_events,
    samples = excluded.samples,
    maximum_queue_age_seconds = excluded.maximum_queue_age_seconds,
    maximum_queue_bytes = excluded.maximum_queue_bytes,
    maximum_active_cameras = excluded.maximum_active_cameras,
    maximum_degraded_cameras = excluded.maximum_degraded_cameras,
    events_sent = excluded.events_sent,
    clips_sent = excluded.clips_sent,
    rtsp_reconnects = excluded.rtsp_reconnects,
    video_evidence_evictions = excluded.video_evidence_evictions,
    video_timeline_evictions = excluded.video_timeline_evictions,
    maximum_clip_backlog = excluded.maximum_clip_backlog;

  get diagnostics v_rows = row_count;

  -- Raw é útil para diagnóstico recente. Depois de 48h o rollup é suficiente.
  delete from public.agent_health
  where recorded_at < now() - interval '48 hours';

  return v_rows;
end;
$$;

revoke all on function public.rollup_monitoria_agent_health_v2(timestamptz)
  from public, anon, authenticated;
grant execute on function public.rollup_monitoria_agent_health_v2(timestamptz)
  to service_role;


-- Backlog/processamento do backend por organização. O recibo individual
-- continua sendo a fonte de verdade; esta tabela é apenas rollup operacional.
create table if not exists public.monitoria_processing_hourly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  hour timestamptz not null,
  ingestions_received bigint not null default 0,
  ingestions_completed bigint not null default 0,
  terminal_failures bigint not null default 0,
  retries bigint not null default 0,
  maximum_attempt_count integer not null default 0,
  average_completion_seconds numeric null,
  maximum_completion_seconds numeric null,
  primary key (organization_id, hour)
);

alter table public.monitoria_processing_hourly enable row level security;
revoke all on public.monitoria_processing_hourly from public, anon, authenticated;
grant all on public.monitoria_processing_hourly to service_role;

create or replace function public.rollup_monitoria_processing_v2(
  p_before timestamptz default date_trunc('hour', now())
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows bigint := 0;
begin
  perform private.require_monitoria_service_role();

  insert into public.monitoria_processing_hourly (
    organization_id, hour, ingestions_received, ingestions_completed,
    terminal_failures, retries, maximum_attempt_count,
    average_completion_seconds, maximum_completion_seconds
  )
  select
    e.organization_id,
    date_trunc('hour', e.created_at),
    count(*)::bigint,
    count(*) filter (where e.completed_at is not null)::bigint,
    count(*) filter (where e.status = 'failed_terminal')::bigint,
    count(*) filter (where e.attempt_count > 1)::bigint,
    max(e.attempt_count),
    avg(extract(epoch from (e.completed_at - e.created_at)))
      filter (where e.completed_at is not null),
    max(extract(epoch from (e.completed_at - e.created_at)))
      filter (where e.completed_at is not null)
  from public.event_ingestions e
  where e.created_at < p_before
    and e.created_at >= p_before - interval '48 hours'
  group by e.organization_id, date_trunc('hour', e.created_at)
  on conflict (organization_id, hour)
  do update set
    ingestions_received = excluded.ingestions_received,
    ingestions_completed = excluded.ingestions_completed,
    terminal_failures = excluded.terminal_failures,
    retries = excluded.retries,
    maximum_attempt_count = excluded.maximum_attempt_count,
    average_completion_seconds = excluded.average_completion_seconds,
    maximum_completion_seconds = excluded.maximum_completion_seconds;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.rollup_monitoria_processing_v2(timestamptz)
  from public, anon, authenticated;
grant execute on function public.rollup_monitoria_processing_v2(timestamptz)
  to service_role;

commit;
