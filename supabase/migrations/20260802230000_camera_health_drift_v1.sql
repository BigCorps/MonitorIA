-- MonitorIA — INT-7: Saúde e drift da câmera v1
-- Dependências: base MonitorIA, INT-3.5 e INT-3.8.
-- A migration não habilita a coleta por câmera automaticamente.

begin;

do $$
begin
  if to_regclass('public.cameras') is null then
    raise exception 'Tabela public.cameras ausente.';
  end if;
  if to_regclass('public.operational_insights') is null then
    raise exception 'INT-3.8 ausente: public.operational_insights não existe.';
  end if;
  if to_regclass('public.monitoria_capability_registry') is null then
    raise exception 'INT-3.8 ausente: capability registry não existe.';
  end if;
end
$$;

alter table public.cameras
  add column if not exists health_intelligence_enabled boolean not null default false,
  add column if not exists health_observation_interval_seconds integer not null default 300,
  add column if not exists health_stale_multiplier numeric(5,2) not null default 3,
  add column if not exists health_thresholds jsonb not null default jsonb_build_object(
    'minimum_brightness', 32,
    'maximum_brightness', 224,
    'maximum_dark_ratio', 0.70,
    'maximum_bright_ratio', 0.70,
    'minimum_contrast', 14,
    'minimum_edge_density', 0.018,
    'minimum_blur_score', 8,
    'frame_shift_distance', 0.22,
    'profile_drift_consecutive', 3,
    'freeze_detection_enabled', false,
    'freeze_consecutive', 4
  ),
  add column if not exists health_last_observed_at timestamptz null,
  add column if not exists health_status text not null default 'unknown';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cameras_health_interval_check'
  ) then
    alter table public.cameras add constraint cameras_health_interval_check
      check (health_observation_interval_seconds between 60 and 3600);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'cameras_health_stale_multiplier_check'
  ) then
    alter table public.cameras add constraint cameras_health_stale_multiplier_check
      check (health_stale_multiplier between 1.5 and 12);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'cameras_health_thresholds_object_check'
  ) then
    alter table public.cameras add constraint cameras_health_thresholds_object_check
      check (jsonb_typeof(health_thresholds) = 'object');
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'cameras_health_status_check'
  ) then
    alter table public.cameras add constraint cameras_health_status_check
      check (health_status in ('unknown','learning','healthy','degraded','critical','offline'));
  end if;
end
$$;

create table if not exists public.camera_health_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  profile_id uuid null references public.camera_profiles(id) on delete set null,
  version integer not null default 1 check (version > 0),
  status text not null default 'proposed',
  source text not null default 'learned_candidate',
  captured_at timestamptz not null,
  brightness_mean numeric(8,4) not null check (brightness_mean between 0 and 255),
  contrast_stddev numeric(8,4) not null check (contrast_stddev between 0 and 255),
  edge_density numeric(8,6) not null check (edge_density between 0 and 1),
  blur_score numeric(12,4) not null check (blur_score >= 0),
  dark_pixel_ratio numeric(8,6) not null check (dark_pixel_ratio between 0 and 1),
  bright_pixel_ratio numeric(8,6) not null check (bright_pixel_ratio between 0 and 1),
  grid_signature jsonb not null,
  content_hash text null,
  sample_count integer not null default 1 check (sample_count > 0),
  distinct_days integer not null default 1 check (distinct_days > 0),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  approved_by uuid null references auth.users(id) on delete set null,
  approved_at timestamptz null,
  retired_at timestamptz null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camera_health_baselines_status_check check (
    status in ('proposed','active','retired','rejected')
  ),
  constraint camera_health_baselines_source_check check (
    source in ('learned_candidate','approved_profile','manual','replacement')
  ),
  constraint camera_health_baselines_grid_check check (
    jsonb_typeof(grid_signature) = 'array' and jsonb_array_length(grid_signature) = 144
  )
);

create unique index if not exists camera_health_one_active_baseline_idx
  on public.camera_health_baselines(camera_id)
  where status = 'active';
create index if not exists camera_health_baselines_org_camera_idx
  on public.camera_health_baselines(organization_id, camera_id, created_at desc);

create table if not exists public.camera_health_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  agent_id uuid null references public.agents(id) on delete set null,
  baseline_id uuid null references public.camera_health_baselines(id) on delete set null,
  source text not null default 'periodic',
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  width integer null check (width is null or width between 1 and 7680),
  height integer null check (height is null or height between 1 and 4320),
  brightness_mean numeric(8,4) not null check (brightness_mean between 0 and 255),
  contrast_stddev numeric(8,4) not null check (contrast_stddev between 0 and 255),
  edge_density numeric(8,6) not null check (edge_density between 0 and 1),
  blur_score numeric(12,4) not null check (blur_score >= 0),
  dark_pixel_ratio numeric(8,6) not null check (dark_pixel_ratio between 0 and 1),
  bright_pixel_ratio numeric(8,6) not null check (bright_pixel_ratio between 0 and 1),
  grid_signature jsonb not null,
  content_hash text not null,
  baseline_distance numeric(8,6) null check (baseline_distance is null or baseline_distance between 0 and 1),
  health_status text not null default 'unknown',
  issue_codes text[] not null default '{}',
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint camera_health_observations_source_check check (
    source in ('periodic','startup','manual','event')
  ),
  constraint camera_health_observations_status_check check (
    health_status in ('unknown','learning','healthy','degraded','critical')
  ),
  constraint camera_health_observations_grid_check check (
    jsonb_typeof(grid_signature) = 'array' and jsonb_array_length(grid_signature) = 144
  ),
  constraint camera_health_observations_metadata_check check (
    jsonb_typeof(metadata) = 'object'
  )
);

create index if not exists camera_health_observations_camera_time_idx
  on public.camera_health_observations(camera_id, captured_at desc);
create index if not exists camera_health_observations_org_time_idx
  on public.camera_health_observations(organization_id, captured_at desc);
create index if not exists camera_health_observations_issues_gin
  on public.camera_health_observations using gin(issue_codes);

create table if not exists public.camera_health_incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  baseline_id uuid null references public.camera_health_baselines(id) on delete set null,
  incident_type text not null,
  status text not null default 'observing',
  severity text not null default 'low',
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  resolved_at timestamptz null,
  consecutive_count integer not null default 1 check (consecutive_count > 0),
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  title text not null,
  summary text not null,
  reasons text[] not null default '{}',
  evidence_observation_ids uuid[] not null default '{}',
  insight_id uuid null references public.operational_insights(id) on delete set null,
  dismissed_by uuid null references auth.users(id) on delete set null,
  dismissed_at timestamptz null,
  dismissal_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camera_health_incidents_type_check check (
    incident_type in (
      'baseline_required','no_recent_observation','possible_frame_freeze',
      'lens_obstructed','low_light','overexposed','blurry',
      'frame_shifted','profile_drift','image_degraded'
    )
  ),
  constraint camera_health_incidents_status_check check (
    status in ('observing','open','resolved','dismissed')
  ),
  constraint camera_health_incidents_severity_check check (
    severity in ('info','low','medium','high','critical')
  )
);

create unique index if not exists camera_health_active_incident_unique_idx
  on public.camera_health_incidents(camera_id, incident_type)
  where status in ('observing','open');
create index if not exists camera_health_incidents_org_status_idx
  on public.camera_health_incidents(organization_id, status, last_observed_at desc);
create index if not exists camera_health_incidents_camera_time_idx
  on public.camera_health_incidents(camera_id, last_observed_at desc);

create table if not exists public.camera_health_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  mode text not null,
  status text not null default 'running',
  cameras_evaluated integer not null default 0,
  observations_processed integer not null default 0,
  incidents_opened integer not null default 0,
  incidents_resolved integer not null default 0,
  error_message text null,
  started_at timestamptz not null default now(),
  finished_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint camera_health_refresh_runs_mode_check check (mode in ('staleness','rebuild')),
  constraint camera_health_refresh_runs_status_check check (status in ('running','completed','failed'))
);

alter table public.camera_health_baselines enable row level security;
alter table public.camera_health_observations enable row level security;
alter table public.camera_health_incidents enable row level security;
alter table public.camera_health_refresh_runs enable row level security;

drop policy if exists camera_health_baselines_select_member on public.camera_health_baselines;
create policy camera_health_baselines_select_member on public.camera_health_baselines
for select to authenticated using (private.is_org_member(organization_id));

drop policy if exists camera_health_observations_select_member on public.camera_health_observations;
create policy camera_health_observations_select_member on public.camera_health_observations
for select to authenticated using (private.is_org_member(organization_id));

drop policy if exists camera_health_incidents_select_member on public.camera_health_incidents;
create policy camera_health_incidents_select_member on public.camera_health_incidents
for select to authenticated using (private.is_org_member(organization_id));

drop policy if exists camera_health_runs_select_admin on public.camera_health_refresh_runs;
create policy camera_health_runs_select_admin on public.camera_health_refresh_runs
for select to authenticated using (
  organization_id is null or private.has_org_role(
    organization_id,
    array['owner'::public.organization_role,'admin'::public.organization_role]
  )
);

grant select on public.camera_health_baselines to authenticated;
grant select on public.camera_health_observations to authenticated;
grant select on public.camera_health_incidents to authenticated;
grant select on public.camera_health_refresh_runs to authenticated;
grant all on public.camera_health_baselines to service_role;
grant all on public.camera_health_observations to service_role;
grant all on public.camera_health_incidents to service_role;
grant all on public.camera_health_refresh_runs to service_role;

drop trigger if exists camera_health_baselines_set_updated_at on public.camera_health_baselines;
create trigger camera_health_baselines_set_updated_at
before update on public.camera_health_baselines
for each row execute function public.set_updated_at();

drop trigger if exists camera_health_incidents_set_updated_at on public.camera_health_incidents;
create trigger camera_health_incidents_set_updated_at
before update on public.camera_health_incidents
for each row execute function public.set_updated_at();

create or replace function private.camera_health_grid_distance(
  left_grid jsonb,
  right_grid jsonb
)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(
    avg(abs(left_value::numeric - right_value::numeric) / 255.0),
    0
  )
  from jsonb_array_elements_text(left_grid) with ordinality as l(left_value, position)
  join jsonb_array_elements_text(right_grid) with ordinality as r(right_value, position)
    using (position)
$$;

create or replace function private.camera_health_incident_label(issue_code text)
returns jsonb
language sql
immutable
set search_path = pg_catalog
as $$
  select case issue_code
    when 'baseline_required' then jsonb_build_object('title','Referência visual pendente','severity','info')
    when 'no_recent_observation' then jsonb_build_object('title','Câmera sem observação recente','severity','high')
    when 'possible_frame_freeze' then jsonb_build_object('title','Possível imagem congelada','severity','high')
    when 'lens_obstructed' then jsonb_build_object('title','Possível obstrução da lente','severity','high')
    when 'low_light' then jsonb_build_object('title','Iluminação insuficiente','severity','medium')
    when 'overexposed' then jsonb_build_object('title','Imagem superexposta','severity','medium')
    when 'blurry' then jsonb_build_object('title','Imagem possivelmente desfocada','severity','medium')
    when 'frame_shifted' then jsonb_build_object('title','Enquadramento diferente da referência','severity','medium')
    when 'profile_drift' then jsonb_build_object('title','Drift persistente do perfil visual','severity','high')
    else jsonb_build_object('title','Qualidade visual degradada','severity','low')
  end
$$;

create unique index if not exists operational_insights_camera_health_source_unique_idx
  on public.operational_insights(source_entity_type, source_entity_id)
  where insight_type = 'camera_health' and source_entity_id is not null;

create or replace function private.upsert_camera_health_incident_v1(
  p_organization_id uuid,
  p_site_id uuid,
  p_camera_id uuid,
  p_baseline_id uuid,
  p_incident_type text,
  p_observed_at timestamptz,
  p_confidence numeric,
  p_summary text,
  p_reasons text[],
  p_observation_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_label jsonb;
  v_incident public.camera_health_incidents;
  v_insight_id uuid;
begin
  v_label := private.camera_health_incident_label(p_incident_type);

  insert into public.camera_health_incidents(
    organization_id, site_id, camera_id, baseline_id, incident_type,
    status, severity, first_observed_at, last_observed_at,
    confidence, title, summary, reasons, evidence_observation_ids
  )
  values (
    p_organization_id, p_site_id, p_camera_id, p_baseline_id, p_incident_type,
    'observing', v_label->>'severity', p_observed_at, p_observed_at,
    greatest(0, least(1, p_confidence)), v_label->>'title', p_summary,
    coalesce(p_reasons, '{}'),
    case when p_observation_id is null then '{}'::uuid[] else array[p_observation_id] end
  )
  on conflict (camera_id, incident_type)
    where status in ('observing','open')
  do update set
    baseline_id = excluded.baseline_id,
    last_observed_at = greatest(public.camera_health_incidents.last_observed_at, excluded.last_observed_at),
    consecutive_count = public.camera_health_incidents.consecutive_count + 1,
    confidence = greatest(public.camera_health_incidents.confidence, excluded.confidence),
    summary = excluded.summary,
    reasons = excluded.reasons,
    evidence_observation_ids = (
      select coalesce(array_agg(value order by ord), '{}')
      from (
        select value, max(ord) ord
        from unnest(
          public.camera_health_incidents.evidence_observation_ids || excluded.evidence_observation_ids
        ) with ordinality as e(value, ord)
        group by value
        order by max(ord) desc
        limit 12
      ) latest
    ),
    status = case
      when public.camera_health_incidents.consecutive_count + 1 >= 2 then 'open'
      else 'observing'
    end,
    updated_at = now()
  returning * into v_incident;

  insert into public.operational_insights(
    organization_id, site_id, camera_id, insight_type, status, severity,
    title, summary, confidence, observed_at, valid_until,
    source_entity_type, source_entity_id, phase_source, data
  )
  values (
    p_organization_id, p_site_id, p_camera_id, 'camera_health', 'active',
    case v_incident.severity when 'info' then 'info' when 'low' then 'low'
      when 'medium' then 'medium' when 'high' then 'high' else 'critical' end,
    v_incident.title, v_incident.summary, v_incident.confidence,
    v_incident.first_observed_at, null,
    'camera_health_incident', v_incident.id, '7',
    jsonb_build_object(
      'incident_type', v_incident.incident_type,
      'incident_status', v_incident.status,
      'consecutive_count', v_incident.consecutive_count,
      'reasons', to_jsonb(v_incident.reasons),
      'evidence_observation_ids', to_jsonb(v_incident.evidence_observation_ids)
    )
  )
  on conflict (source_entity_type, source_entity_id)
    where insight_type = 'camera_health' and source_entity_id is not null
  do update set
    status = 'active', severity = excluded.severity, title = excluded.title,
    summary = excluded.summary, confidence = excluded.confidence,
    observed_at = least(public.operational_insights.observed_at, excluded.observed_at),
    valid_until = null, data = excluded.data, updated_at = now()
  returning id into v_insight_id;

  update public.camera_health_incidents
  set insight_id = v_insight_id
  where id = v_incident.id and insight_id is distinct from v_insight_id;

  return v_incident.id;
end
$$;

create or replace function private.resolve_camera_health_incident_v1(
  p_incident_id uuid,
  p_resolved_at timestamptz,
  p_reason text default 'Métricas voltaram à faixa aceitável.'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.camera_health_incidents
  set status = 'resolved', resolved_at = p_resolved_at,
      summary = coalesce(nullif(p_reason,''), summary), updated_at = now()
  where id = p_incident_id and status in ('observing','open');

  update public.operational_insights
  set status = 'resolved', valid_until = p_resolved_at, updated_at = now()
  where source_entity_type = 'camera_health_incident'
    and source_entity_id = p_incident_id
    and insight_type = 'camera_health';
end
$$;

create or replace function public.process_camera_health_observation_v1(
  p_observation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_observation public.camera_health_observations;
  v_camera public.cameras;
  v_baseline public.camera_health_baselines;
  v_thresholds jsonb;
  v_distance numeric;
  v_issues text[] := '{}';
  v_reasons text[] := '{}';
  v_status text := 'healthy';
  v_confidence numeric := 0.90;
  v_freeze_count integer := 0;
  v_shift_count integer := 0;
  v_issue text;
  v_incident public.camera_health_incidents;
  v_recent_healthy integer;
begin
  select * into v_observation
  from public.camera_health_observations
  where id = p_observation_id
  for update;

  if not found then
    raise exception 'Observação de saúde não encontrada.';
  end if;

  select * into v_camera
  from public.cameras
  where id = v_observation.camera_id;

  if not found or v_camera.organization_id <> v_observation.organization_id then
    raise exception 'Câmera inválida para a observação.';
  end if;

  v_thresholds := coalesce(v_camera.health_thresholds, '{}'::jsonb);

  select * into v_baseline
  from public.camera_health_baselines
  where camera_id = v_observation.camera_id and status = 'active'
  order by version desc
  limit 1;

  if found then
    v_distance := private.camera_health_grid_distance(
      v_observation.grid_signature,
      v_baseline.grid_signature
    );
  else
    v_issues := array_append(v_issues, 'baseline_required');
    v_reasons := array_append(v_reasons, 'Ainda não existe uma referência visual aprovada para esta câmera.');
    v_status := 'learning';
    v_confidence := 0.60;
  end if;

  if v_observation.dark_pixel_ratio >= coalesce((v_thresholds->>'maximum_dark_ratio')::numeric, 0.70)
     or v_observation.brightness_mean <= coalesce((v_thresholds->>'minimum_brightness')::numeric, 32) then
    if v_observation.contrast_stddev <= coalesce((v_thresholds->>'minimum_contrast')::numeric, 14)
       and v_observation.edge_density <= coalesce((v_thresholds->>'minimum_edge_density')::numeric, 0.018) then
      v_issues := array_append(v_issues, 'lens_obstructed');
      v_reasons := array_append(v_reasons, 'Imagem muito escura, com pouco contraste e poucos contornos visíveis.');
      v_status := 'critical';
      v_confidence := greatest(v_confidence, 0.84);
    else
      v_issues := array_append(v_issues, 'low_light');
      v_reasons := array_append(v_reasons, 'Luminosidade abaixo da faixa configurada.');
      if v_status <> 'critical' then v_status := 'degraded'; end if;
      v_confidence := greatest(v_confidence, 0.78);
    end if;
  end if;

  if v_observation.bright_pixel_ratio >= coalesce((v_thresholds->>'maximum_bright_ratio')::numeric, 0.70)
     or v_observation.brightness_mean >= coalesce((v_thresholds->>'maximum_brightness')::numeric, 224) then
    v_issues := array_append(v_issues, 'overexposed');
    v_reasons := array_append(v_reasons, 'Grande parte do quadro está próxima do branco ou acima da luminosidade esperada.');
    if v_status not in ('critical') then v_status := 'degraded'; end if;
    v_confidence := greatest(v_confidence, 0.78);
  end if;

  if v_observation.blur_score <= coalesce((v_thresholds->>'minimum_blur_score')::numeric, 8)
     or v_observation.edge_density <= coalesce((v_thresholds->>'minimum_edge_density')::numeric, 0.018) then
    if not ('lens_obstructed' = any(v_issues)) then
      v_issues := array_append(v_issues, 'blurry');
      v_reasons := array_append(v_reasons, 'Poucos detalhes de alta frequência foram preservados no quadro.');
      if v_status not in ('critical') then v_status := 'degraded'; end if;
      v_confidence := greatest(v_confidence, 0.72);
    end if;
  end if;

  if v_distance is not null
     and v_distance >= coalesce((v_thresholds->>'frame_shift_distance')::numeric, 0.22) then
    v_issues := array_append(v_issues, 'frame_shifted');
    v_reasons := array_append(v_reasons, format('A assinatura do enquadramento divergiu %s%% da referência aprovada.', round(v_distance * 100, 1)));
    if v_status not in ('critical') then v_status := 'degraded'; end if;
    v_confidence := greatest(v_confidence, least(0.96, 0.55 + v_distance));

    select count(*) into v_shift_count
    from (
      select baseline_distance
      from public.camera_health_observations
      where camera_id = v_observation.camera_id
        and captured_at <= v_observation.captured_at
        and baseline_distance is not null
      order by captured_at desc
      limit greatest(1, coalesce((v_thresholds->>'profile_drift_consecutive')::integer, 3))
    ) recent
    where baseline_distance >= coalesce((v_thresholds->>'frame_shift_distance')::numeric, 0.22);

    if v_shift_count >= greatest(2, coalesce((v_thresholds->>'profile_drift_consecutive')::integer, 3) - 1) then
      v_issues := array_append(v_issues, 'profile_drift');
      v_reasons := array_append(v_reasons, 'A mudança de enquadramento persistiu em observações consecutivas.');
      v_status := 'critical';
      v_confidence := greatest(v_confidence, 0.88);
    end if;
  end if;

  if coalesce((v_thresholds->>'freeze_detection_enabled')::boolean, false) then
    select count(*) into v_freeze_count
    from (
      select content_hash
      from public.camera_health_observations
      where camera_id = v_observation.camera_id
        and captured_at <= v_observation.captured_at
      order by captured_at desc
      limit greatest(2, coalesce((v_thresholds->>'freeze_consecutive')::integer, 4))
    ) recent
    where content_hash = v_observation.content_hash;

    if v_freeze_count >= greatest(3, coalesce((v_thresholds->>'freeze_consecutive')::integer, 4)) then
      v_issues := array_append(v_issues, 'possible_frame_freeze');
      v_reasons := array_append(v_reasons, 'A assinatura do quadro permaneceu idêntica em várias verificações.');
      v_status := 'critical';
      v_confidence := greatest(v_confidence, 0.80);
    end if;
  end if;

  if array_length(v_issues, 1) is null then
    v_status := 'healthy';
    v_confidence := 0.92;
  elsif v_status = 'healthy' then
    v_status := 'degraded';
  end if;

  update public.camera_health_observations
  set baseline_id = v_baseline.id,
      baseline_distance = v_distance,
      health_status = v_status,
      issue_codes = v_issues,
      confidence = greatest(0, least(1, v_confidence))
  where id = p_observation_id
  returning * into v_observation;

  update public.cameras
  set health_last_observed_at = greatest(coalesce(health_last_observed_at, v_observation.captured_at), v_observation.captured_at),
      health_status = case v_status
        when 'critical' then 'critical'
        when 'degraded' then 'degraded'
        when 'learning' then 'learning'
        when 'healthy' then 'healthy'
        else health_status end,
      updated_at = now()
  where id = v_observation.camera_id;

  if v_baseline.id is null and v_status in ('healthy','learning') then
    if (
      select count(*) >= 6
      from public.camera_health_observations o
      where o.camera_id = v_observation.camera_id
        and o.captured_at >= v_observation.captured_at - interval '48 hours'
        and not (o.issue_codes && array['lens_obstructed','low_light','overexposed','blurry']::text[])
    ) and not exists (
      select 1 from public.camera_health_baselines b
      where b.camera_id = v_observation.camera_id and b.status in ('proposed','active')
    ) then
      insert into public.camera_health_baselines(
        organization_id, site_id, camera_id, profile_id, version, status, source,
        captured_at, brightness_mean, contrast_stddev, edge_density, blur_score,
        dark_pixel_ratio, bright_pixel_ratio, grid_signature, content_hash,
        sample_count, distinct_days, confidence, notes
      )
      select
        v_observation.organization_id, v_observation.site_id, v_observation.camera_id,
        (select id from public.camera_profiles where camera_id = v_observation.camera_id and is_active limit 1),
        coalesce((select max(version)+1 from public.camera_health_baselines where camera_id = v_observation.camera_id),1),
        'proposed','learned_candidate', max(captured_at),
        avg(brightness_mean), avg(contrast_stddev), avg(edge_density), avg(blur_score),
        avg(dark_pixel_ratio), avg(bright_pixel_ratio),
        (array_agg(grid_signature order by captured_at desc))[1],
        (array_agg(content_hash order by captured_at desc))[1],
        count(*), count(distinct (captured_at at time zone 'UTC')::date),
        least(0.85, 0.55 + count(*)::numeric / 40),
        'Referência candidata criada a partir de observações estáveis. Exige aprovação humana.'
      from public.camera_health_observations
      where camera_id = v_observation.camera_id
        and captured_at >= v_observation.captured_at - interval '48 hours'
        and not (issue_codes && array['lens_obstructed','low_light','overexposed','blurry']::text[]);
    end if;
  end if;

  foreach v_issue in array v_issues loop
    perform private.upsert_camera_health_incident_v1(
      v_observation.organization_id, v_observation.site_id, v_observation.camera_id,
      v_baseline.id, v_issue, v_observation.captured_at,
      case v_issue
        when 'baseline_required' then 0.60
        when 'profile_drift' then 0.88
        when 'lens_obstructed' then 0.84
        when 'possible_frame_freeze' then 0.80
        else v_confidence end,
      case v_issue
        when 'baseline_required' then 'A câmera ainda está aprendendo sua referência visual aprovada.'
        when 'no_recent_observation' then 'Nenhuma observação recente foi recebida.'
        else array_to_string(v_reasons, ' ') end,
      v_reasons,
      v_observation.id
    );
  end loop;

  for v_incident in
    select * from public.camera_health_incidents
    where camera_id = v_observation.camera_id
      and status in ('observing','open')
      and incident_type <> 'no_recent_observation'
      and not (incident_type = any(v_issues))
  loop
    select count(*) into v_recent_healthy
    from (
      select issue_codes
      from public.camera_health_observations
      where camera_id = v_observation.camera_id
      order by captured_at desc
      limit 2
    ) recent
    where not (v_incident.incident_type = any(issue_codes));

    if v_recent_healthy >= 2 then
      perform private.resolve_camera_health_incident_v1(
        v_incident.id,
        v_observation.captured_at,
        'Duas observações consecutivas voltaram à faixa aceitável.'
      );
    end if;
  end loop;

  return jsonb_build_object(
    'observation_id', v_observation.id,
    'camera_id', v_observation.camera_id,
    'health_status', v_status,
    'issue_codes', to_jsonb(v_issues),
    'baseline_id', v_baseline.id,
    'baseline_distance', v_distance,
    'confidence', v_confidence
  );
end
$$;

revoke all on function public.process_camera_health_observation_v1(uuid) from public, anon, authenticated;
grant execute on function public.process_camera_health_observation_v1(uuid) to service_role;

create or replace function public.evaluate_camera_health_staleness_v1(
  p_organization_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_run_id uuid;
  v_camera record;
  v_incident record;
  v_evaluated integer := 0;
  v_opened integer := 0;
  v_resolved integer := 0;
  v_stale_after interval;
begin
  insert into public.camera_health_refresh_runs(organization_id, mode)
  values (p_organization_id, 'staleness')
  returning id into v_run_id;

  for v_camera in
    select c.*
    from public.cameras c
    where c.health_intelligence_enabled
      and (p_organization_id is null or c.organization_id = p_organization_id)
  loop
    v_evaluated := v_evaluated + 1;
    v_stale_after := make_interval(
      secs => greatest(
        180,
        round(v_camera.health_observation_interval_seconds * v_camera.health_stale_multiplier)::integer
      )
    );

    if v_camera.health_last_observed_at is null
       or v_camera.health_last_observed_at < now() - v_stale_after then
      perform private.upsert_camera_health_incident_v1(
        v_camera.organization_id, v_camera.site_id, v_camera.id, null,
        'no_recent_observation', now(), 0.95,
        format('A última observação de saúde ocorreu em %s.', coalesce(v_camera.health_last_observed_at::text, 'momento desconhecido')),
        array['O intervalo esperado de observação foi excedido.'], null
      );
      update public.cameras set health_status = 'offline', updated_at = now() where id = v_camera.id;
      v_opened := v_opened + 1;
    else
      for v_incident in
        select id from public.camera_health_incidents
        where camera_id = v_camera.id
          and incident_type = 'no_recent_observation'
          and status in ('observing','open')
      loop
        perform private.resolve_camera_health_incident_v1(
          v_incident.id, now(), 'O recebimento periódico de observações foi restabelecido.'
        );
        v_resolved := v_resolved + 1;
      end loop;
    end if;
  end loop;

  update public.camera_health_refresh_runs
  set status = 'completed', cameras_evaluated = v_evaluated,
      incidents_opened = v_opened, incidents_resolved = v_resolved,
      finished_at = now()
  where id = v_run_id;

  return jsonb_build_object(
    'run_id', v_run_id,
    'cameras_evaluated', v_evaluated,
    'incidents_opened', v_opened,
    'incidents_resolved', v_resolved
  );
exception when others then
  update public.camera_health_refresh_runs
  set status = 'failed', error_message = sqlerrm, finished_at = now()
  where id = v_run_id;
  raise;
end
$$;

revoke all on function public.evaluate_camera_health_staleness_v1(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_camera_health_staleness_v1(uuid) to service_role;

create or replace function public.approve_camera_health_baseline_v1(
  p_baseline_id uuid,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_baseline public.camera_health_baselines;
begin
  select * into v_baseline
  from public.camera_health_baselines
  where id = p_baseline_id
  for update;

  if not found then raise exception 'Referência não encontrada.'; end if;
  if not private.has_org_role(
    v_baseline.organization_id,
    array['owner'::public.organization_role,'admin'::public.organization_role]
  ) then raise exception 'Acesso negado.'; end if;
  if v_baseline.status <> 'proposed' then raise exception 'A referência não está pendente.'; end if;

  update public.camera_health_baselines
  set status = 'retired', retired_at = now(), updated_at = now()
  where camera_id = v_baseline.camera_id and status = 'active';

  update public.camera_health_baselines
  set status = 'active', approved_by = auth.uid(), approved_at = now(),
      notes = trim(concat_ws(' ', notes, p_notes)), updated_at = now()
  where id = p_baseline_id
  returning * into v_baseline;

  update public.cameras
  set health_status = 'healthy', updated_at = now()
  where id = v_baseline.camera_id and health_status in ('unknown','learning');

  return jsonb_build_object('baseline_id', v_baseline.id, 'camera_id', v_baseline.camera_id, 'status', v_baseline.status);
end
$$;

revoke all on function public.approve_camera_health_baseline_v1(uuid,text) from public, anon;
grant execute on function public.approve_camera_health_baseline_v1(uuid,text) to authenticated, service_role;

create or replace function public.reject_camera_health_baseline_v1(
  p_baseline_id uuid,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_baseline public.camera_health_baselines;
begin
  select * into v_baseline from public.camera_health_baselines where id = p_baseline_id for update;
  if not found then raise exception 'Referência não encontrada.'; end if;
  if not private.has_org_role(v_baseline.organization_id, array['owner'::public.organization_role,'admin'::public.organization_role]) then
    raise exception 'Acesso negado.';
  end if;
  update public.camera_health_baselines
  set status = 'rejected', notes = trim(concat_ws(' ', notes, p_notes)), updated_at = now()
  where id = p_baseline_id and status = 'proposed';
  return jsonb_build_object('baseline_id', p_baseline_id, 'status', 'rejected');
end
$$;

revoke all on function public.reject_camera_health_baseline_v1(uuid,text) from public, anon;
grant execute on function public.reject_camera_health_baseline_v1(uuid,text) to authenticated, service_role;

create or replace function public.dismiss_camera_health_incident_v1(
  p_incident_id uuid,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_incident public.camera_health_incidents;
begin
  select * into v_incident from public.camera_health_incidents where id = p_incident_id for update;
  if not found then raise exception 'Incidente não encontrado.'; end if;
  if not private.has_org_role(v_incident.organization_id, array['owner'::public.organization_role,'admin'::public.organization_role]) then
    raise exception 'Acesso negado.';
  end if;
  update public.camera_health_incidents
  set status = 'dismissed', dismissed_by = auth.uid(), dismissed_at = now(),
      dismissal_notes = p_notes, updated_at = now()
  where id = p_incident_id;
  update public.operational_insights
  set status = 'dismissed', valid_until = now(), updated_at = now()
  where source_entity_type = 'camera_health_incident' and source_entity_id = p_incident_id;
  return jsonb_build_object('incident_id', p_incident_id, 'status', 'dismissed');
end
$$;

revoke all on function public.dismiss_camera_health_incident_v1(uuid,text) from public, anon;
grant execute on function public.dismiss_camera_health_incident_v1(uuid,text) to authenticated, service_role;

create or replace function public.assistant_camera_health_summary_v1(
  p_organization_id uuid,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'Acesso negado.';
  end if;

  select jsonb_build_object(
    'generated_at', now(),
    'summary', jsonb_build_object(
      'cameras_enabled', count(*) filter (where c.health_intelligence_enabled),
      'healthy', count(*) filter (where c.health_status = 'healthy'),
      'learning', count(*) filter (where c.health_status = 'learning'),
      'degraded', count(*) filter (where c.health_status = 'degraded'),
      'critical', count(*) filter (where c.health_status = 'critical'),
      'offline', count(*) filter (where c.health_status = 'offline'),
      'active_incidents', (
        select count(*) from public.camera_health_incidents i
        where i.organization_id = p_organization_id
          and (p_camera_id is null or i.camera_id = p_camera_id)
          and (p_site_id is null or i.site_id = p_site_id)
          and i.status in ('observing','open')
      ),
      'proposed_baselines', (
        select count(*) from public.camera_health_baselines b
        where b.organization_id = p_organization_id
          and (p_camera_id is null or b.camera_id = p_camera_id)
          and (p_site_id is null or b.site_id = p_site_id)
          and b.status = 'proposed'
      )
    ),
    'cameras', coalesce(jsonb_agg(jsonb_build_object(
      'camera_id', c.id,
      'camera_name', c.name,
      'site_id', c.site_id,
      'enabled', c.health_intelligence_enabled,
      'health_status', c.health_status,
      'last_observed_at', c.health_last_observed_at,
      'active_incidents', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id, 'type', i.incident_type, 'status', i.status,
          'severity', i.severity, 'title', i.title, 'summary', i.summary,
          'confidence', i.confidence, 'last_observed_at', i.last_observed_at
        ) order by i.last_observed_at desc)
        from public.camera_health_incidents i
        where i.camera_id = c.id and i.status in ('observing','open')
      ), '[]'::jsonb),
      'baseline_status', coalesce((
        select b.status from public.camera_health_baselines b
        where b.camera_id = c.id order by b.created_at desc limit 1
      ), 'missing')
    ) order by c.name), '[]'::jsonb)
  ) into v_result
  from public.cameras c
  where c.organization_id = p_organization_id
    and (p_camera_id is null or c.id = p_camera_id)
    and (p_site_id is null or c.site_id = p_site_id);

  return coalesce(v_result, jsonb_build_object('summary', '{}'::jsonb, 'cameras', '[]'::jsonb));
end
$$;

revoke all on function public.assistant_camera_health_summary_v1(uuid,uuid,uuid) from public, anon;
grant execute on function public.assistant_camera_health_summary_v1(uuid,uuid,uuid) to authenticated, service_role;

insert into public.monitoria_capability_registry(module,status,introduced_phase,description)
values ('camera_health','available','7','Saúde visual, obstrução, iluminação, desfoque e drift da câmera')
on conflict (module) do update set
  status = excluded.status,
  introduced_phase = excluded.introduced_phase,
  description = excluded.description,
  updated_at = now();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'camera_health_incidents'
  ) then
    alter publication supabase_realtime add table public.camera_health_incidents;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'camera_health_baselines'
  ) then
    alter publication supabase_realtime add table public.camera_health_baselines;
  end if;
end
$$;

commit;
