-- MonitorIA — INT-4
-- Inteligência de rotinas e desvios operacionais v1.
-- Requer INT-1, INT-3 e INT-3.8 aplicadas.
-- Não utiliza uma nova chamada de IA: observações, baselines e desvios são derivados deterministicamente.

begin;

do $$
begin
  if to_regclass('public.site_operating_sessions') is null then
    raise exception 'monitoria_int_1_required';
  end if;

  if to_regclass('public.operational_sessions') is null then
    raise exception 'monitoria_int_3_required';
  end if;

  if to_regclass('public.operational_insights') is null
     or to_regclass('public.monitoria_capability_registry') is null then
    raise exception 'monitoria_int_3_8_required';
  end if;
end
$$;

alter table public.cameras
  add column if not exists routine_intelligence_enabled boolean not null default false,
  add column if not exists routine_learning_window_days integer not null default 42,
  add column if not exists routine_minimum_days integer not null default 5,
  add column if not exists routine_deviation_sensitivity text not null default 'balanced',
  add column if not exists routine_grace_minutes integer not null default 15;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_routine_learning_window_check'
  ) then
    alter table public.cameras
      add constraint cameras_routine_learning_window_check
      check (routine_learning_window_days between 14 and 180);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_routine_minimum_days_check'
  ) then
    alter table public.cameras
      add constraint cameras_routine_minimum_days_check
      check (routine_minimum_days between 3 and 60);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_routine_sensitivity_check'
  ) then
    alter table public.cameras
      add constraint cameras_routine_sensitivity_check
      check (routine_deviation_sensitivity in ('conservative', 'balanced', 'sensitive'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_routine_grace_check'
  ) then
    alter table public.cameras
      add constraint cameras_routine_grace_check
      check (routine_grace_minutes between 0 and 180);
  end if;
end
$$;

comment on column public.cameras.routine_intelligence_enabled is
  'Ativa aprendizado determinístico de rotina e comparação com o padrão observado.';
comment on column public.cameras.routine_learning_window_days is
  'Janela móvel de dias usada para reconstruir observações e calcular baselines.';
comment on column public.cameras.routine_minimum_days is
  'Quantidade mínima de dias para considerar um baseline ativo.';
comment on column public.cameras.routine_deviation_sensitivity is
  'Sensibilidade do desvio: conservative, balanced ou sensitive.';

create table if not exists public.routine_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  local_date date not null,
  day_of_week smallint not null,
  metric_code text not null,
  dimension_key text not null default '',
  bucket_hour smallint not null default -1,
  session_type text not null default '',
  observed_value numeric not null,
  unit text not null,
  observed_at timestamptz not null,
  source_started_at timestamptz null,
  source_ended_at timestamptz null,
  evidence_event_ids uuid[] not null default '{}',
  confidence numeric(5,4) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint routine_observations_day_check check (day_of_week between 0 and 6),
  constraint routine_observations_hour_check check (bucket_hour between -1 and 23),
  constraint routine_observations_confidence_check check (confidence between 0 and 1),
  constraint routine_observations_unit_check check (
    unit in ('minute_of_day', 'minutes', 'seconds', 'count', 'ratio', 'percent')
  ),
  constraint routine_observations_metric_check check (
    metric_code in (
      'operating_open_minute',
      'operating_close_minute',
      'operating_duration_minutes',
      'first_activity_delay_minutes',
      'last_activity_lead_minutes',
      'daily_session_count',
      'hourly_session_count',
      'session_duration_seconds',
      'after_close_event_count'
    )
  ),
  constraint routine_observations_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists routine_observations_dedupe_uidx
  on public.routine_observations(
    camera_id,
    local_date,
    metric_code,
    dimension_key,
    bucket_hour,
    session_type
  );
create index if not exists routine_observations_camera_metric_idx
  on public.routine_observations(camera_id, metric_code, local_date desc);
create index if not exists routine_observations_org_date_idx
  on public.routine_observations(organization_id, local_date desc);

create table if not exists public.camera_behavior_baselines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  baseline_code text not null,
  day_of_week smallint not null default -1,
  bucket_hour smallint not null default -1,
  session_type text not null default '',
  status text not null default 'learning',
  sample_count integer not null default 0,
  day_count integer not null default 0,
  period_start date not null,
  period_end date not null,
  window_days integer not null,
  center_value numeric not null default 0,
  lower_value numeric not null default 0,
  upper_value numeric not null default 0,
  spread_value numeric not null default 0,
  unit text not null,
  confidence numeric(5,4) not null default 0,
  confirmed_by uuid null references auth.users(id) on delete set null,
  confirmed_at timestamptz null,
  known_exceptions jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint camera_behavior_baselines_day_check check (day_of_week between -1 and 6),
  constraint camera_behavior_baselines_hour_check check (bucket_hour between -1 and 23),
  constraint camera_behavior_baselines_status_check check (
    status in ('learning', 'active', 'stale', 'disabled')
  ),
  constraint camera_behavior_baselines_confidence_check check (confidence between 0 and 1),
  constraint camera_behavior_baselines_count_check check (
    sample_count >= 0 and day_count >= 0 and window_days between 1 and 365
  ),
  constraint camera_behavior_baselines_range_check check (
    lower_value <= center_value and center_value <= upper_value
  ),
  constraint camera_behavior_baselines_time_check check (period_end >= period_start),
  constraint camera_behavior_baselines_exceptions_check check (
    jsonb_typeof(known_exceptions) = 'array'
  ),
  constraint camera_behavior_baselines_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists camera_behavior_baselines_scope_uidx
  on public.camera_behavior_baselines(
    camera_id,
    baseline_code,
    day_of_week,
    bucket_hour,
    session_type
  );
create index if not exists camera_behavior_baselines_camera_status_idx
  on public.camera_behavior_baselines(camera_id, status, baseline_code);
create index if not exists camera_behavior_baselines_org_idx
  on public.camera_behavior_baselines(organization_id, updated_at desc);

create table if not exists public.operational_expectations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  baseline_id uuid null references public.camera_behavior_baselines(id) on delete set null,
  expectation_key text not null,
  expectation_code text not null,
  source text not null default 'learned',
  status text not null default 'active',
  day_of_week smallint not null default -1,
  bucket_hour smallint not null default -1,
  session_type text not null default '',
  expected_center numeric not null default 0,
  expected_lower numeric not null default 0,
  expected_upper numeric not null default 0,
  unit text not null,
  grace_before numeric not null default 0,
  grace_after numeric not null default 0,
  valid_from date null,
  valid_until date null,
  exception_dates date[] not null default '{}',
  known_exceptions jsonb not null default '[]'::jsonb,
  confidence numeric(5,4) not null default 0,
  confirmed_by uuid null references auth.users(id) on delete set null,
  confirmed_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_expectations_source_check check (source in ('learned', 'user', 'hybrid')),
  constraint operational_expectations_status_check check (status in ('active', 'paused', 'expired')),
  constraint operational_expectations_day_check check (day_of_week between -1 and 6),
  constraint operational_expectations_hour_check check (bucket_hour between -1 and 23),
  constraint operational_expectations_range_check check (
    expected_lower <= expected_center and expected_center <= expected_upper
  ),
  constraint operational_expectations_confidence_check check (confidence between 0 and 1),
  constraint operational_expectations_validity_check check (
    valid_until is null or valid_from is null or valid_until >= valid_from
  ),
  constraint operational_expectations_exceptions_check check (jsonb_typeof(known_exceptions) = 'array'),
  constraint operational_expectations_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists operational_expectations_key_uidx
  on public.operational_expectations(camera_id, expectation_key);
create index if not exists operational_expectations_camera_idx
  on public.operational_expectations(camera_id, status, expectation_code);

create table if not exists public.operational_deviations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  baseline_id uuid null references public.camera_behavior_baselines(id) on delete set null,
  expectation_id uuid null references public.operational_expectations(id) on delete set null,
  insight_id uuid null references public.operational_insights(id) on delete set null,
  local_date date not null,
  deviation_key text not null,
  deviation_code text not null,
  status text not null default 'active',
  severity text not null default 'low',
  title text not null,
  summary text not null,
  observed_value numeric null,
  expected_lower numeric null,
  expected_center numeric null,
  expected_upper numeric null,
  deviation_amount numeric null,
  unit text null,
  confidence numeric(5,4) not null default 0,
  observed_at timestamptz not null,
  resolved_at timestamptz null,
  evidence_event_ids uuid[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_deviations_code_check check (
    deviation_code in (
      'opening_early',
      'opening_late',
      'opening_not_observed',
      'closing_early',
      'closing_late',
      'closing_not_observed',
      'first_activity_late',
      'activity_after_closing',
      'session_duration_high',
      'activity_volume_low',
      'activity_volume_high'
    )
  ),
  constraint operational_deviations_status_check check (
    status in ('active', 'resolved', 'dismissed', 'informational')
  ),
  constraint operational_deviations_severity_check check (
    severity in ('info', 'low', 'medium', 'high', 'critical')
  ),
  constraint operational_deviations_confidence_check check (confidence between 0 and 1),
  constraint operational_deviations_data_check check (jsonb_typeof(data) = 'object')
);

create unique index if not exists operational_deviations_key_uidx
  on public.operational_deviations(camera_id, local_date, deviation_key);
create index if not exists operational_deviations_org_time_idx
  on public.operational_deviations(organization_id, observed_at desc);
create index if not exists operational_deviations_camera_status_idx
  on public.operational_deviations(camera_id, status, observed_at desc);
create index if not exists operational_deviations_severity_idx
  on public.operational_deviations(organization_id, severity, status, observed_at desc);

create table if not exists public.routine_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  camera_id uuid null references public.cameras(id) on delete cascade,
  reference_date date not null,
  status text not null default 'running',
  observations_written integer not null default 0,
  baselines_written integer not null default 0,
  deviations_written integer not null default 0,
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  error_code text null,
  metadata jsonb not null default '{}'::jsonb,
  constraint routine_refresh_runs_status_check check (status in ('running', 'completed', 'failed')),
  constraint routine_refresh_runs_count_check check (
    observations_written >= 0 and baselines_written >= 0 and deviations_written >= 0
  ),
  constraint routine_refresh_runs_metadata_check check (jsonb_typeof(metadata) = 'object')
);

create index if not exists routine_refresh_runs_camera_time_idx
  on public.routine_refresh_runs(camera_id, started_at desc);
create index if not exists routine_refresh_runs_status_idx
  on public.routine_refresh_runs(status, started_at desc);

alter table public.routine_observations enable row level security;
alter table public.camera_behavior_baselines enable row level security;
alter table public.operational_expectations enable row level security;
alter table public.operational_deviations enable row level security;
alter table public.routine_refresh_runs enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'routine_observations',
    'camera_behavior_baselines',
    'operational_expectations',
    'operational_deviations',
    'routine_refresh_runs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_member', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_org_member(organization_id))',
      table_name || '_select_member',
      table_name
    );
  end loop;
end
$$;

-- O papel MCP é opcional no momento da migration, mas é configurado quando INT-3.8 existe.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    foreach table_name in array array[
      'routine_observations',
      'camera_behavior_baselines',
      'operational_expectations',
      'operational_deviations'
    ]
    loop
      execute format('drop policy if exists %I on public.%I', table_name || '_mcp_select_granted', table_name);
      execute format(
        'create policy %I on public.%I for select to monitoria_mcp_readonly using (private.mcp_org_granted(organization_id))',
        table_name || '_mcp_select_granted',
        table_name
      );
      execute format('grant select on public.%I to monitoria_mcp_readonly', table_name);
    end loop;
  end if;
end
$$;

grant select on public.routine_observations to authenticated;
grant select on public.camera_behavior_baselines to authenticated;
grant select on public.operational_expectations to authenticated;
grant select on public.operational_deviations to authenticated;
grant select on public.routine_refresh_runs to authenticated;

grant all on public.routine_observations to service_role;
grant all on public.camera_behavior_baselines to service_role;
grant all on public.operational_expectations to service_role;
grant all on public.operational_deviations to service_role;
grant all on public.routine_refresh_runs to service_role;

create or replace function private.routine_local_minute(
  p_value timestamptz,
  p_timezone text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (
    extract(hour from p_value at time zone p_timezone)::integer * 60
    + extract(minute from p_value at time zone p_timezone)::integer
  );
$$;

create or replace function private.routine_local_minute_relative(
  p_value timestamptz,
  p_reference_date date,
  p_timezone text
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (
    ((p_value at time zone p_timezone)::date - p_reference_date) * 1440
    + private.routine_local_minute(p_value, p_timezone)
  );
$$;

create or replace function private.routine_format_minute(p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.lpad(((greatest(0, round(p_value)::integer) / 60) % 24)::text, 2, '0')
    || ':' || pg_catalog.lpad((greatest(0, round(p_value)::integer) % 60)::text, 2, '0')
    || case when round(p_value)::integer >= 1440 then ' +' || (round(p_value)::integer / 1440)::text || 'd' else '' end;
$$;

create or replace function private.routine_confidence(
  p_sample_count integer,
  p_day_count integer,
  p_spread numeric,
  p_center numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(
    0.98,
    greatest(
      0.20,
      0.25
      + least(greatest(p_day_count, 0), 28)::numeric / 28 * 0.48
      + least(greatest(p_sample_count, 0), 60)::numeric / 60 * 0.20
      - least(
          0.18,
          case
            when abs(coalesce(p_center, 0)) < 1 then 0
            else abs(coalesce(p_spread, 0)) / greatest(abs(p_center), 1) * 0.12
          end
        )
    )
  )::numeric(5,4);
$$;

create or replace function private.routine_grace_value(
  p_metric_code text,
  p_sensitivity text,
  p_configured_minutes integer
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_metric_code in ('operating_open_minute', 'operating_close_minute', 'first_activity_delay_minutes') then
      greatest(
        0,
        case p_sensitivity
          when 'conservative' then greatest(p_configured_minutes, 30)
          when 'sensitive' then least(p_configured_minutes, 5)
          else p_configured_minutes
        end
      )
    when p_metric_code = 'session_duration_seconds' then
      case p_sensitivity
        when 'conservative' then 180
        when 'sensitive' then 30
        else 90
      end
    else 0
  end;
$$;

create or replace function private.routine_severity(
  p_metric_code text,
  p_amount numeric,
  p_scale numeric
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_metric_code in ('activity_after_closing', 'closing_not_observed')
         and abs(coalesce(p_amount, 0)) >= greatest(1, coalesce(p_scale, 1)) * 2 then 'high'
    when abs(coalesce(p_amount, 0)) >= greatest(1, coalesce(p_scale, 1)) * 3 then 'high'
    when abs(coalesce(p_amount, 0)) >= greatest(1, coalesce(p_scale, 1)) * 1.5 then 'medium'
    else 'low'
  end;
$$;

create or replace function private.upsert_routine_insight_v1(
  p_organization_id uuid,
  p_site_id uuid,
  p_camera_id uuid,
  p_insight_type text,
  p_status text,
  p_severity text,
  p_title text,
  p_summary text,
  p_confidence numeric,
  p_observed_at timestamptz,
  p_valid_until timestamptz,
  p_source_entity_type text,
  p_source_entity_id uuid,
  p_evidence_event_ids uuid[],
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select insight.id into v_id
  from public.operational_insights insight
  where insight.organization_id = p_organization_id
    and insight.insight_type = p_insight_type
    and insight.phase_source = 'int-4-routines-v1'
    and insight.source_entity_type = p_source_entity_type
    and insight.source_entity_id = p_source_entity_id
  order by insight.updated_at desc
  limit 1
  for update;

  if v_id is null then
    insert into public.operational_insights (
      organization_id,
      site_id,
      camera_id,
      insight_type,
      status,
      severity,
      title,
      summary,
      confidence,
      observed_at,
      valid_until,
      source_entity_type,
      source_entity_id,
      evidence_event_ids,
      phase_source,
      data
    ) values (
      p_organization_id,
      p_site_id,
      p_camera_id,
      p_insight_type,
      p_status,
      p_severity,
      p_title,
      p_summary,
      least(1, greatest(0, p_confidence)),
      p_observed_at,
      p_valid_until,
      p_source_entity_type,
      p_source_entity_id,
      coalesce(p_evidence_event_ids, '{}'),
      'int-4-routines-v1',
      coalesce(p_data, '{}'::jsonb)
    ) returning id into v_id;
  else
    update public.operational_insights
    set site_id = p_site_id,
        camera_id = p_camera_id,
        status = p_status,
        severity = p_severity,
        title = p_title,
        summary = p_summary,
        confidence = least(1, greatest(0, p_confidence)),
        observed_at = p_observed_at,
        valid_until = p_valid_until,
        evidence_event_ids = coalesce(p_evidence_event_ids, '{}'),
        data = coalesce(p_data, '{}'::jsonb),
        updated_at = now()
    where id = v_id;
  end if;

  return v_id;
end;
$$;

create or replace function private.upsert_operational_deviation_v1(
  p_organization_id uuid,
  p_site_id uuid,
  p_camera_id uuid,
  p_baseline_id uuid,
  p_expectation_id uuid,
  p_local_date date,
  p_deviation_key text,
  p_deviation_code text,
  p_status text,
  p_severity text,
  p_title text,
  p_summary text,
  p_observed_value numeric,
  p_expected_lower numeric,
  p_expected_center numeric,
  p_expected_upper numeric,
  p_deviation_amount numeric,
  p_unit text,
  p_confidence numeric,
  p_observed_at timestamptz,
  p_evidence_event_ids uuid[],
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_insight_id uuid;
begin
  insert into public.operational_deviations (
    organization_id,
    site_id,
    camera_id,
    baseline_id,
    expectation_id,
    local_date,
    deviation_key,
    deviation_code,
    status,
    severity,
    title,
    summary,
    observed_value,
    expected_lower,
    expected_center,
    expected_upper,
    deviation_amount,
    unit,
    confidence,
    observed_at,
    resolved_at,
    evidence_event_ids,
    data
  ) values (
    p_organization_id,
    p_site_id,
    p_camera_id,
    p_baseline_id,
    p_expectation_id,
    p_local_date,
    p_deviation_key,
    p_deviation_code,
    p_status,
    p_severity,
    p_title,
    p_summary,
    p_observed_value,
    p_expected_lower,
    p_expected_center,
    p_expected_upper,
    p_deviation_amount,
    p_unit,
    least(1, greatest(0, p_confidence)),
    p_observed_at,
    case when p_status = 'resolved' then now() else null end,
    coalesce(p_evidence_event_ids, '{}'),
    coalesce(p_data, '{}'::jsonb)
  )
  on conflict (camera_id, local_date, deviation_key) do update
  set baseline_id = excluded.baseline_id,
      expectation_id = excluded.expectation_id,
      deviation_code = excluded.deviation_code,
      status = excluded.status,
      severity = excluded.severity,
      title = excluded.title,
      summary = excluded.summary,
      observed_value = excluded.observed_value,
      expected_lower = excluded.expected_lower,
      expected_center = excluded.expected_center,
      expected_upper = excluded.expected_upper,
      deviation_amount = excluded.deviation_amount,
      unit = excluded.unit,
      confidence = excluded.confidence,
      observed_at = excluded.observed_at,
      resolved_at = excluded.resolved_at,
      evidence_event_ids = excluded.evidence_event_ids,
      data = excluded.data,
      updated_at = now()
  returning id into v_id;

  v_insight_id := private.upsert_routine_insight_v1(
    p_organization_id,
    p_site_id,
    p_camera_id,
    'deviation',
    case when p_status = 'resolved' then 'resolved' else 'active' end,
    p_severity,
    p_title,
    p_summary,
    p_confidence,
    p_observed_at,
    null,
    'operational_deviation',
    v_id,
    p_evidence_event_ids,
    coalesce(p_data, '{}'::jsonb)
      || jsonb_build_object(
        'deviationCode', p_deviation_code,
        'localDate', p_local_date,
        'observedValue', p_observed_value,
        'expectedLower', p_expected_lower,
        'expectedCenter', p_expected_center,
        'expectedUpper', p_expected_upper,
        'unit', p_unit
      )
  );

  update public.operational_deviations
  set insight_id = v_insight_id,
      updated_at = now()
  where id = v_id;

  return v_id;
end;
$$;

create or replace function public.refresh_camera_routine_observations_v1(
  p_camera_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera public.cameras%rowtype;
  v_site public.sites%rowtype;
  v_from date;
  v_to date;
  v_written integer := 0;
  v_rows integer := 0;
begin
  select * into v_camera from public.cameras where id = p_camera_id;
  if not found then raise exception 'camera_not_found'; end if;

  select * into v_site from public.sites where id = v_camera.site_id;
  if not found then raise exception 'site_not_found'; end if;

  if not v_camera.routine_intelligence_enabled then
    return jsonb_build_object('enabled', false, 'cameraId', p_camera_id, 'observationsWritten', 0);
  end if;

  v_to := coalesce(p_reference_date, (now() at time zone v_site.timezone)::date);
  v_from := v_to - (v_camera.routine_learning_window_days - 1);

  perform pg_advisory_xact_lock(hashtextextended(p_camera_id::text || ':routine-observations', 0));

  delete from public.routine_observations observation
  where observation.camera_id = p_camera_id
    and observation.local_date between v_from and v_to;

  with operating as (
    select distinct on ((session.first_open_observed_at at time zone v_site.timezone)::date)
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and (session.first_open_observed_at at time zone v_site.timezone)::date between v_from and v_to
    order by (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    operating.local_date,
    extract(dow from operating.local_date)::smallint,
    'operating_open_minute',
    operating.id::text,
    private.routine_local_minute(operating.first_open_observed_at, v_site.timezone),
    'minute_of_day',
    operating.first_open_observed_at,
    operating.first_open_observed_at,
    operating.closed_at,
    case when operating.opening_event_id is null then '{}'::uuid[] else array[operating.opening_event_id] end,
    case operating.opening_precision
      when 'visible_transition' then 0.95
      when 'persistent_confirmation' then 0.85
      else 0.70
    end,
    jsonb_build_object('source', 'site_operating_session', 'precision', operating.opening_precision)
  from operating;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with operating as (
    select distinct on ((session.first_open_observed_at at time zone v_site.timezone)::date)
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and session.closed_at is not null
      and (session.first_open_observed_at at time zone v_site.timezone)::date between v_from and v_to
    order by (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    operating.local_date,
    extract(dow from operating.local_date)::smallint,
    'operating_close_minute',
    operating.id::text,
    private.routine_local_minute_relative(operating.closed_at, operating.local_date, v_site.timezone),
    'minute_of_day',
    operating.closed_at,
    operating.first_open_observed_at,
    operating.closed_at,
    case when operating.closing_event_id is null then '{}'::uuid[] else array[operating.closing_event_id] end,
    case operating.closing_precision
      when 'visible_transition' then 0.95
      when 'persistent_confirmation' then 0.85
      when 'strong_snapshot' then 0.75
      else 0.65
    end,
    jsonb_build_object('source', 'site_operating_session', 'precision', operating.closing_precision)
  from operating;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with operating as (
    select distinct on ((session.first_open_observed_at at time zone v_site.timezone)::date)
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and session.closed_at is not null
      and (session.first_open_observed_at at time zone v_site.timezone)::date between v_from and v_to
    order by (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    operating.local_date,
    extract(dow from operating.local_date)::smallint,
    'operating_duration_minutes',
    operating.id::text,
    greatest(0, extract(epoch from operating.closed_at - operating.first_open_observed_at) / 60),
    'minutes',
    operating.closed_at,
    operating.first_open_observed_at,
    operating.closed_at,
    array_remove(array[operating.opening_event_id, operating.closing_event_id], null),
    0.85,
    jsonb_build_object('source', 'site_operating_session')
  from operating;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with daily as (
    select
      (session.started_at at time zone v_site.timezone)::date as local_date,
      count(*)::numeric as session_count,
      min(session.started_at) as first_started_at,
      max(coalesce(session.ended_at, session.last_event_at)) as last_ended_at,
      array_agg(session.id order by session.started_at) as session_ids
    from public.operational_sessions session
    where session.camera_id = p_camera_id
      and (session.started_at at time zone v_site.timezone)::date between v_from and v_to
      and session.session_type not in ('opening_procedure', 'closing_procedure')
    group by (session.started_at at time zone v_site.timezone)::date
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    daily.local_date,
    extract(dow from daily.local_date)::smallint,
    'daily_session_count',
    '',
    daily.session_count,
    'count',
    daily.first_started_at,
    daily.first_started_at,
    daily.last_ended_at,
    0.90,
    jsonb_build_object('source', 'operational_sessions', 'sessionIds', daily.session_ids)
  from daily;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with hourly as (
    select
      (session.started_at at time zone v_site.timezone)::date as local_date,
      extract(hour from session.started_at at time zone v_site.timezone)::smallint as bucket_hour,
      count(*)::numeric as session_count,
      min(session.started_at) as observed_at
    from public.operational_sessions session
    where session.camera_id = p_camera_id
      and (session.started_at at time zone v_site.timezone)::date between v_from and v_to
      and session.session_type not in ('opening_procedure', 'closing_procedure')
    group by
      (session.started_at at time zone v_site.timezone)::date,
      extract(hour from session.started_at at time zone v_site.timezone)
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, bucket_hour, observed_value, unit, observed_at,
    confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    hourly.local_date,
    extract(dow from hourly.local_date)::smallint,
    'hourly_session_count',
    '',
    hourly.bucket_hour,
    hourly.session_count,
    'count',
    hourly.observed_at,
    0.88,
    jsonb_build_object('source', 'operational_sessions')
  from hourly;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, session_type, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    (session.started_at at time zone v_site.timezone)::date,
    extract(dow from session.started_at at time zone v_site.timezone)::smallint,
    'session_duration_seconds',
    session.id::text,
    session.session_type,
    greatest(0, session.duration_seconds),
    'seconds',
    coalesce(session.ended_at, session.last_event_at),
    session.started_at,
    coalesce(session.ended_at, session.last_event_at),
    coalesce((
      select array_agg(chapter.event_id order by chapter.chapter_order)
      from public.operational_session_events chapter
      where chapter.session_id = session.id
        and chapter.is_key_chapter
    ), '{}'::uuid[]),
    session.confidence,
    jsonb_build_object('source', 'operational_session', 'status', session.status)
  from public.operational_sessions session
  where session.camera_id = p_camera_id
    and (session.started_at at time zone v_site.timezone)::date between v_from and v_to
    and session.status <> 'open'
    and session.session_type not in ('opening_procedure', 'closing_procedure');
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with operating as (
    select distinct on ((session.first_open_observed_at at time zone v_site.timezone)::date)
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and (session.first_open_observed_at at time zone v_site.timezone)::date between v_from and v_to
    order by (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  ), joined as (
    select
      operating.*,
      first_activity.started_at as first_activity_at,
      first_activity.evidence_event_ids as first_evidence,
      last_activity.ended_at as last_activity_at,
      last_activity.evidence_event_ids as last_evidence
    from operating
    left join lateral (
      select
        session.started_at,
        coalesce((
          select array_agg(chapter.event_id order by chapter.chapter_order)
          from public.operational_session_events chapter
          where chapter.session_id = session.id
            and chapter.chapter_order = 1
        ), '{}'::uuid[]) as evidence_event_ids
      from public.operational_sessions session
      where session.camera_id = p_camera_id
        and session.session_type not in ('opening_procedure', 'closing_procedure')
        and session.started_at >= operating.first_open_observed_at
        and session.started_at < coalesce(
          operating.closed_at,
          ((operating.local_date + 1)::timestamp at time zone v_site.timezone)
        )
      order by session.started_at asc
      limit 1
    ) first_activity on true
    left join lateral (
      select
        coalesce(session.ended_at, session.last_event_at) as ended_at,
        coalesce((
          select array[chapter.event_id]
          from public.operational_session_events chapter
          where chapter.session_id = session.id
          order by chapter.chapter_order desc
          limit 1
        ), '{}'::uuid[]) as evidence_event_ids
      from public.operational_sessions session
      where session.camera_id = p_camera_id
        and session.session_type not in ('opening_procedure', 'closing_procedure')
        and operating.closed_at is not null
        and coalesce(session.ended_at, session.last_event_at) <= operating.closed_at
        and session.started_at >= operating.first_open_observed_at
      order by coalesce(session.ended_at, session.last_event_at) desc
      limit 1
    ) last_activity on true
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    joined.local_date,
    extract(dow from joined.local_date)::smallint,
    'first_activity_delay_minutes',
    joined.id::text,
    greatest(0, extract(epoch from joined.first_activity_at - joined.first_open_observed_at) / 60),
    'minutes',
    joined.first_activity_at,
    joined.first_open_observed_at,
    joined.first_activity_at,
    joined.first_evidence,
    0.82,
    jsonb_build_object('source', 'operating_and_operational_sessions')
  from joined
  where joined.first_activity_at is not null;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with operating as (
    select distinct on ((session.first_open_observed_at at time zone v_site.timezone)::date)
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and session.closed_at is not null
      and (session.first_open_observed_at at time zone v_site.timezone)::date between v_from and v_to
    order by (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  ), last_activity as (
    select
      operating.*,
      activity.ended_at as last_activity_at,
      activity.evidence_event_ids
    from operating
    left join lateral (
      select
        coalesce(session.ended_at, session.last_event_at) as ended_at,
        coalesce((
          select array_agg(chapter.event_id order by chapter.chapter_order desc)
          from public.operational_session_events chapter
          where chapter.session_id = session.id
        ), '{}'::uuid[]) as evidence_event_ids
      from public.operational_sessions session
      where session.camera_id = p_camera_id
        and session.session_type not in ('opening_procedure', 'closing_procedure')
        and session.started_at >= operating.first_open_observed_at
        and coalesce(session.ended_at, session.last_event_at) <= operating.closed_at
      order by coalesce(session.ended_at, session.last_event_at) desc
      limit 1
    ) activity on true
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    last_activity.local_date,
    extract(dow from last_activity.local_date)::smallint,
    'last_activity_lead_minutes',
    last_activity.id::text,
    greatest(0, extract(epoch from last_activity.closed_at - last_activity.last_activity_at) / 60),
    'minutes',
    last_activity.closed_at,
    last_activity.last_activity_at,
    last_activity.closed_at,
    last_activity.evidence_event_ids,
    0.80,
    jsonb_build_object('source', 'operating_and_operational_sessions')
  from last_activity
  where last_activity.last_activity_at is not null;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  with operating as (
    select distinct on ((session.first_open_observed_at at time zone v_site.timezone)::date)
      session.*,
      (session.first_open_observed_at at time zone v_site.timezone)::date as local_date
    from public.site_operating_sessions session
    where session.camera_id = p_camera_id
      and session.closed_at is not null
      and (session.first_open_observed_at at time zone v_site.timezone)::date between v_from and v_to
    order by (session.first_open_observed_at at time zone v_site.timezone)::date,
      session.first_open_observed_at asc
  ), activity as (
    select
      operating.id,
      operating.local_date,
      operating.closed_at,
      count(event.id)::numeric as event_count,
      coalesce(array_agg(event.id order by event.started_at) filter (where event.id is not null), '{}'::uuid[]) as evidence_event_ids
    from operating
    left join public.events event
      on event.camera_id = p_camera_id
      and event.deleted_at is null
      and event.started_at > operating.closed_at
      and event.started_at < ((operating.local_date + 1)::timestamp at time zone v_site.timezone)
    group by operating.id, operating.local_date, operating.closed_at
  )
  insert into public.routine_observations (
    organization_id, site_id, camera_id, local_date, day_of_week,
    metric_code, dimension_key, observed_value, unit, observed_at,
    source_started_at, source_ended_at, evidence_event_ids, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_camera.site_id,
    p_camera_id,
    activity.local_date,
    extract(dow from activity.local_date)::smallint,
    'after_close_event_count',
    activity.id::text,
    activity.event_count,
    'count',
    activity.closed_at,
    activity.closed_at,
    ((activity.local_date + 1)::timestamp at time zone v_site.timezone),
    activity.evidence_event_ids[1:20],
    0.90,
    jsonb_build_object('source', 'events_after_confirmed_closing')
  from activity;
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  return jsonb_build_object(
    'enabled', true,
    'cameraId', p_camera_id,
    'from', v_from,
    'to', v_to,
    'observationsWritten', v_written
  );
end;
$$;

create or replace function public.refresh_camera_behavior_baselines_v1(
  p_camera_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera public.cameras%rowtype;
  v_site_id uuid;
  v_from date;
  v_to date;
  v_written integer := 0;
  v_rows integer := 0;
begin
  select * into v_camera from public.cameras where id = p_camera_id;
  if not found then raise exception 'camera_not_found'; end if;

  v_site_id := v_camera.site_id;
  v_to := coalesce(p_reference_date, current_date);
  v_from := v_to - (v_camera.routine_learning_window_days - 1);

  perform pg_advisory_xact_lock(hashtextextended(p_camera_id::text || ':routine-baselines', 0));

  update public.camera_behavior_baselines
  set status = 'stale', updated_at = now()
  where camera_id = p_camera_id
    and period_end < v_from;

  with source as (
    select
      observation.metric_code,
      -1::smallint as day_of_week,
      observation.bucket_hour,
      observation.session_type,
      count(*)::integer as sample_count,
      count(distinct observation.local_date)::integer as day_count,
      min(observation.local_date) as period_start,
      max(observation.local_date) as period_end,
      percentile_cont(0.50) within group (order by observation.observed_value)::numeric as center_value,
      percentile_cont(0.10) within group (order by observation.observed_value)::numeric as lower_value,
      percentile_cont(0.90) within group (order by observation.observed_value)::numeric as upper_value,
      (
        percentile_cont(0.75) within group (order by observation.observed_value)
        - percentile_cont(0.25) within group (order by observation.observed_value)
      )::numeric as spread_value,
      min(observation.unit) as unit
    from public.routine_observations observation
    where observation.camera_id = p_camera_id
      and observation.local_date between v_from and v_to
    group by observation.metric_code, observation.bucket_hour, observation.session_type
    union all
    select
      observation.metric_code,
      observation.day_of_week,
      observation.bucket_hour,
      observation.session_type,
      count(*)::integer,
      count(distinct observation.local_date)::integer,
      min(observation.local_date),
      max(observation.local_date),
      percentile_cont(0.50) within group (order by observation.observed_value)::numeric,
      percentile_cont(0.10) within group (order by observation.observed_value)::numeric,
      percentile_cont(0.90) within group (order by observation.observed_value)::numeric,
      (
        percentile_cont(0.75) within group (order by observation.observed_value)
        - percentile_cont(0.25) within group (order by observation.observed_value)
      )::numeric,
      min(observation.unit)
    from public.routine_observations observation
    where observation.camera_id = p_camera_id
      and observation.local_date between v_from and v_to
    group by observation.metric_code, observation.day_of_week, observation.bucket_hour, observation.session_type
  )
  insert into public.camera_behavior_baselines (
    organization_id, site_id, camera_id, baseline_code, day_of_week,
    bucket_hour, session_type, status, sample_count, day_count,
    period_start, period_end, window_days, center_value, lower_value,
    upper_value, spread_value, unit, confidence, metadata
  )
  select
    v_camera.organization_id,
    v_site_id,
    p_camera_id,
    source.metric_code,
    source.day_of_week,
    source.bucket_hour,
    source.session_type,
    case
      when source.day_count >= case when source.day_of_week = -1
        then v_camera.routine_minimum_days
        else least(v_camera.routine_minimum_days, 4)
      end then 'active'
      else 'learning'
    end,
    source.sample_count,
    source.day_count,
    source.period_start,
    source.period_end,
    v_camera.routine_learning_window_days,
    source.center_value,
    least(source.center_value, source.lower_value),
    greatest(source.center_value, source.upper_value),
    greatest(0, source.spread_value),
    source.unit,
    private.routine_confidence(
      source.sample_count,
      source.day_count,
      source.spread_value,
      source.center_value
    ),
    jsonb_build_object(
      'method', 'percentile_10_50_90_v1',
      'source', 'routine_observations',
      'referenceDate', v_to
    )
  from source
  on conflict (camera_id, baseline_code, day_of_week, bucket_hour, session_type)
  do update set
    organization_id = excluded.organization_id,
    site_id = excluded.site_id,
    status = excluded.status,
    sample_count = excluded.sample_count,
    day_count = excluded.day_count,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    window_days = excluded.window_days,
    center_value = excluded.center_value,
    lower_value = excluded.lower_value,
    upper_value = excluded.upper_value,
    spread_value = excluded.spread_value,
    unit = excluded.unit,
    confidence = excluded.confidence,
    metadata = public.camera_behavior_baselines.metadata || excluded.metadata,
    updated_at = now();
  get diagnostics v_rows = row_count;
  v_written := v_written + v_rows;

  insert into public.operational_expectations (
    organization_id, site_id, camera_id, baseline_id, expectation_key,
    expectation_code, source, status, day_of_week, bucket_hour, session_type,
    expected_center, expected_lower, expected_upper, unit,
    grace_before, grace_after, valid_from, confidence, metadata
  )
  select
    baseline.organization_id,
    baseline.site_id,
    baseline.camera_id,
    baseline.id,
    baseline.baseline_code || ':' || baseline.day_of_week || ':' || baseline.bucket_hour || ':' || baseline.session_type,
    baseline.baseline_code,
    'learned',
    'active',
    baseline.day_of_week,
    baseline.bucket_hour,
    baseline.session_type,
    baseline.center_value,
    baseline.lower_value,
    baseline.upper_value,
    baseline.unit,
    private.routine_grace_value(
      baseline.baseline_code,
      v_camera.routine_deviation_sensitivity,
      v_camera.routine_grace_minutes
    ),
    private.routine_grace_value(
      baseline.baseline_code,
      v_camera.routine_deviation_sensitivity,
      v_camera.routine_grace_minutes
    ),
    baseline.period_start,
    baseline.confidence,
    jsonb_build_object('method', 'learned_from_baseline_v1')
  from public.camera_behavior_baselines baseline
  where baseline.camera_id = p_camera_id
    and baseline.status = 'active'
  on conflict (camera_id, expectation_key) do update
  set baseline_id = excluded.baseline_id,
      expected_center = case when public.operational_expectations.source = 'user'
        then public.operational_expectations.expected_center else excluded.expected_center end,
      expected_lower = case when public.operational_expectations.source = 'user'
        then public.operational_expectations.expected_lower else excluded.expected_lower end,
      expected_upper = case when public.operational_expectations.source = 'user'
        then public.operational_expectations.expected_upper else excluded.expected_upper end,
      unit = excluded.unit,
      grace_before = case when public.operational_expectations.source = 'user'
        then public.operational_expectations.grace_before else excluded.grace_before end,
      grace_after = case when public.operational_expectations.source = 'user'
        then public.operational_expectations.grace_after else excluded.grace_after end,
      confidence = greatest(public.operational_expectations.confidence, excluded.confidence),
      metadata = public.operational_expectations.metadata || excluded.metadata,
      updated_at = now();

  return jsonb_build_object(
    'cameraId', p_camera_id,
    'from', v_from,
    'to', v_to,
    'baselinesWritten', v_written
  );
end;
$$;

create or replace function public.refresh_camera_routine_insights_v1(
  p_camera_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_baseline public.camera_behavior_baselines%rowtype;
  v_title text;
  v_summary text;
  v_count integer := 0;
begin
  for v_baseline in
    select *
    from public.camera_behavior_baselines baseline
    where baseline.camera_id = p_camera_id
      and baseline.status = 'active'
      and baseline.day_of_week = -1
      and baseline.baseline_code in (
        'operating_open_minute',
        'operating_close_minute',
        'first_activity_delay_minutes',
        'daily_session_count',
        'session_duration_seconds'
      )
  loop
    v_title := case v_baseline.baseline_code
      when 'operating_open_minute' then 'Abertura habitual'
      when 'operating_close_minute' then 'Fechamento habitual'
      when 'first_activity_delay_minutes' then 'Primeira atividade após abertura'
      when 'daily_session_count' then 'Volume diário habitual'
      when 'session_duration_seconds' then 'Duração habitual de ' || replace(coalesce(nullif(v_baseline.session_type, ''), 'sessão'), '_', ' ')
      else 'Rotina observada'
    end;

    v_summary := case v_baseline.baseline_code
      when 'operating_open_minute' then
        'A abertura visual normalmente ocorre entre '
        || private.routine_format_minute(v_baseline.lower_value)
        || ' e ' || private.routine_format_minute(v_baseline.upper_value)
        || ', com centro em ' || private.routine_format_minute(v_baseline.center_value) || '.'
      when 'operating_close_minute' then
        'O fechamento visual normalmente ocorre entre '
        || private.routine_format_minute(v_baseline.lower_value)
        || ' e ' || private.routine_format_minute(v_baseline.upper_value)
        || ', com centro em ' || private.routine_format_minute(v_baseline.center_value) || '.'
      when 'first_activity_delay_minutes' then
        'A primeira atividade normalmente ocorre entre '
        || round(v_baseline.lower_value)::text || ' e '
        || round(v_baseline.upper_value)::text || ' minutos após a abertura.'
      when 'daily_session_count' then
        'Foram observadas normalmente entre '
        || round(v_baseline.lower_value)::text || ' e '
        || round(v_baseline.upper_value)::text || ' sessões por dia.'
      when 'session_duration_seconds' then
        'A duração visual normalmente fica entre '
        || round(v_baseline.lower_value / 60, 1)::text || ' e '
        || round(v_baseline.upper_value / 60, 1)::text || ' minutos.'
      else 'Padrão calculado a partir de observações históricas.'
    end;

    perform private.upsert_routine_insight_v1(
      v_baseline.organization_id,
      v_baseline.site_id,
      v_baseline.camera_id,
      'routine',
      'informational',
      'info',
      v_title,
      v_summary,
      v_baseline.confidence,
      now(),
      now() + interval '14 days',
      'routine_baseline',
      v_baseline.id,
      '{}'::uuid[],
      jsonb_build_object(
        'baselineCode', v_baseline.baseline_code,
        'dayOfWeek', v_baseline.day_of_week,
        'sessionType', v_baseline.session_type,
        'sampleCount', v_baseline.sample_count,
        'dayCount', v_baseline.day_count,
        'periodStart', v_baseline.period_start,
        'periodEnd', v_baseline.period_end,
        'expectedLower', v_baseline.lower_value,
        'expectedCenter', v_baseline.center_value,
        'expectedUpper', v_baseline.upper_value,
        'unit', v_baseline.unit
      )
    );

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('cameraId', p_camera_id, 'routineInsightsWritten', v_count);
end;
$$;

create or replace function public.evaluate_camera_routine_deviations_v1(
  p_camera_id uuid,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera public.cameras%rowtype;
  v_site public.sites%rowtype;
  v_today date;
  v_previous date;
  v_now_minute integer;
  v_dow smallint;
  v_expectation public.operational_expectations%rowtype;
  v_open public.routine_observations%rowtype;
  v_close public.routine_observations%rowtype;
  v_first public.routine_observations%rowtype;
  v_volume public.routine_observations%rowtype;
  v_after public.routine_observations%rowtype;
  v_amount numeric;
  v_severity text;
  v_count integer := 0;
  v_session record;
begin
  select * into v_camera from public.cameras where id = p_camera_id;
  if not found then raise exception 'camera_not_found'; end if;
  select * into v_site from public.sites where id = v_camera.site_id;
  if not found then raise exception 'site_not_found'; end if;

  if not v_camera.routine_intelligence_enabled then
    return jsonb_build_object('enabled', false, 'cameraId', p_camera_id, 'deviationsWritten', 0);
  end if;

  v_today := (p_observed_at at time zone v_site.timezone)::date;
  v_previous := v_today - 1;
  v_now_minute := private.routine_local_minute(p_observed_at, v_site.timezone);
  v_dow := extract(dow from v_today)::smallint;

  -- Abertura do dia atual: usa baseline específico do dia quando ativo, senão baseline geral.
  select * into v_expectation
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.status = 'active'
    and expectation.expectation_code = 'operating_open_minute'
    and expectation.day_of_week in (v_dow, -1)
    and v_today <> all(expectation.exception_dates)
  order by case when expectation.day_of_week = v_dow then 0 else 1 end
  limit 1;

  if found then
    select * into v_open
    from public.routine_observations observation
    where observation.camera_id = p_camera_id
      and observation.local_date = v_today
      and observation.metric_code = 'operating_open_minute'
    order by observation.observed_at asc
    limit 1;

    if found then
      update public.operational_deviations deviation
      set status = 'resolved', resolved_at = now(), updated_at = now()
      where deviation.camera_id = p_camera_id
        and deviation.local_date = v_today
        and deviation.deviation_code = 'opening_not_observed'
        and deviation.status = 'active';

      if v_open.observed_value > v_expectation.expected_upper + v_expectation.grace_after then
        v_amount := v_open.observed_value - v_expectation.expected_upper;
        v_severity := private.routine_severity('opening_late', v_amount, greatest(v_expectation.grace_after, 10));
        perform private.upsert_operational_deviation_v1(
          v_camera.organization_id, v_camera.site_id, p_camera_id,
          v_expectation.baseline_id, v_expectation.id, v_today,
          'opening_late', 'opening_late', 'active', v_severity,
          'Abertura fora do horário habitual',
          'A abertura visual ocorreu às ' || private.routine_format_minute(v_open.observed_value)
            || ', depois da faixa habitual que termina em '
            || private.routine_format_minute(v_expectation.expected_upper) || '.',
          v_open.observed_value, v_expectation.expected_lower,
          v_expectation.expected_center, v_expectation.expected_upper,
          v_amount, 'minute_of_day', least(v_open.confidence, v_expectation.confidence),
          v_open.observed_at, v_open.evidence_event_ids,
          jsonb_build_object('language', 'outside_observed_pattern', 'comparison', 'late')
        );
        v_count := v_count + 1;
      elsif v_open.observed_value < v_expectation.expected_lower - v_expectation.grace_before then
        v_amount := v_expectation.expected_lower - v_open.observed_value;
        v_severity := private.routine_severity('opening_early', v_amount, greatest(v_expectation.grace_before, 10));
        perform private.upsert_operational_deviation_v1(
          v_camera.organization_id, v_camera.site_id, p_camera_id,
          v_expectation.baseline_id, v_expectation.id, v_today,
          'opening_early', 'opening_early', 'active', v_severity,
          'Abertura antecipada em relação ao habitual',
          'A abertura visual ocorreu às ' || private.routine_format_minute(v_open.observed_value)
            || ', antes da faixa habitual que começa em '
            || private.routine_format_minute(v_expectation.expected_lower) || '.',
          v_open.observed_value, v_expectation.expected_lower,
          v_expectation.expected_center, v_expectation.expected_upper,
          -v_amount, 'minute_of_day', least(v_open.confidence, v_expectation.confidence),
          v_open.observed_at, v_open.evidence_event_ids,
          jsonb_build_object('language', 'outside_observed_pattern', 'comparison', 'early')
        );
        v_count := v_count + 1;
      end if;
    elsif v_now_minute > v_expectation.expected_upper + v_expectation.grace_after then
      v_amount := v_now_minute - v_expectation.expected_upper;
      v_severity := private.routine_severity('opening_not_observed', v_amount, greatest(v_expectation.grace_after, 15));
      perform private.upsert_operational_deviation_v1(
        v_camera.organization_id, v_camera.site_id, p_camera_id,
        v_expectation.baseline_id, v_expectation.id, v_today,
        'opening_not_observed', 'opening_not_observed', 'active', v_severity,
        'Abertura ainda não observada',
        'Até ' || private.routine_format_minute(v_now_minute)
          || ', nenhuma abertura visual foi confirmada. A faixa habitual termina em '
          || private.routine_format_minute(v_expectation.expected_upper) || '.',
        null, v_expectation.expected_lower, v_expectation.expected_center,
        v_expectation.expected_upper, v_amount, 'minute_of_day',
        v_expectation.confidence, p_observed_at, '{}'::uuid[],
        jsonb_build_object('language', 'not_observed_yet', 'requiresVisualConfirmation', true)
      );
      v_count := v_count + 1;
    end if;
  end if;

  -- Fechamento e volume do dia anterior, porque o dia já terminou.
  v_dow := extract(dow from v_previous)::smallint;
  select * into v_expectation
  from public.operational_expectations expectation
  where expectation.camera_id = p_camera_id
    and expectation.status = 'active'
    and expectation.expectation_code = 'operating_close_minute'
    and expectation.day_of_week in (v_dow, -1)
    and v_previous <> all(expectation.exception_dates)
  order by case when expectation.day_of_week = v_dow then 0 else 1 end
  limit 1;

  if found then
    select * into v_close
    from public.routine_observations observation
    where observation.camera_id = p_camera_id
      and observation.local_date = v_previous
      and observation.metric_code = 'operating_close_minute'
    order by observation.observed_at desc
    limit 1;

    if found then
      update public.operational_deviations deviation
      set status = 'resolved', resolved_at = now(), updated_at = now()
      where deviation.camera_id = p_camera_id
        and deviation.local_date = v_previous
        and deviation.deviation_code = 'closing_not_observed'
        and deviation.status = 'active';

      if v_close.observed_value > v_expectation.expected_upper + v_expectation.grace_after then
        v_amount := v_close.observed_value - v_expectation.expected_upper;
        v_severity := private.routine_severity('closing_late', v_amount, greatest(v_expectation.grace_after, 15));
        perform private.upsert_operational_deviation_v1(
          v_camera.organization_id, v_camera.site_id, p_camera_id,
          v_expectation.baseline_id, v_expectation.id, v_previous,
          'closing_late', 'closing_late', 'active', v_severity,
          'Fechamento posterior ao horário habitual',
          'O fechamento visual ocorreu às ' || private.routine_format_minute(v_close.observed_value)
            || ', depois da faixa habitual que termina em '
            || private.routine_format_minute(v_expectation.expected_upper) || '.',
          v_close.observed_value, v_expectation.expected_lower,
          v_expectation.expected_center, v_expectation.expected_upper,
          v_amount, 'minute_of_day', least(v_close.confidence, v_expectation.confidence),
          v_close.observed_at, v_close.evidence_event_ids,
          jsonb_build_object('language', 'outside_observed_pattern', 'comparison', 'late')
        );
        v_count := v_count + 1;
      elsif v_close.observed_value < v_expectation.expected_lower - v_expectation.grace_before then
        v_amount := v_expectation.expected_lower - v_close.observed_value;
        v_severity := private.routine_severity('closing_early', v_amount, greatest(v_expectation.grace_before, 15));
        perform private.upsert_operational_deviation_v1(
          v_camera.organization_id, v_camera.site_id, p_camera_id,
          v_expectation.baseline_id, v_expectation.id, v_previous,
          'closing_early', 'closing_early', 'active', v_severity,
          'Fechamento antecipado em relação ao habitual',
          'O fechamento visual ocorreu às ' || private.routine_format_minute(v_close.observed_value)
            || ', antes da faixa habitual que começa em '
            || private.routine_format_minute(v_expectation.expected_lower) || '.',
          v_close.observed_value, v_expectation.expected_lower,
          v_expectation.expected_center, v_expectation.expected_upper,
          -v_amount, 'minute_of_day', least(v_close.confidence, v_expectation.confidence),
          v_close.observed_at, v_close.evidence_event_ids,
          jsonb_build_object('language', 'outside_observed_pattern', 'comparison', 'early')
        );
        v_count := v_count + 1;
      end if;
    else
      perform private.upsert_operational_deviation_v1(
        v_camera.organization_id, v_camera.site_id, p_camera_id,
        v_expectation.baseline_id, v_expectation.id, v_previous,
        'closing_not_observed', 'closing_not_observed', 'active', 'medium',
        'Fechamento visual não confirmado',
        'Não foi encontrado fechamento visual confirmado para o dia. Isso pode representar ausência de evidência, câmera indisponível ou operação fora do padrão.',
        null, v_expectation.expected_lower, v_expectation.expected_center,
        v_expectation.expected_upper, null, 'minute_of_day',
        v_expectation.confidence, p_observed_at, '{}'::uuid[],
        jsonb_build_object('language', 'absence_of_visual_confirmation', 'doNotInferOpenState', true)
      );
      v_count := v_count + 1;
    end if;
  end if;

  select * into v_after
  from public.routine_observations observation
  where observation.camera_id = p_camera_id
    and observation.local_date = v_previous
    and observation.metric_code = 'after_close_event_count'
  limit 1;

  if found and v_after.observed_value > 0 then
    v_severity := case when v_after.observed_value >= 3 then 'high' else 'medium' end;
    perform private.upsert_operational_deviation_v1(
      v_camera.organization_id, v_camera.site_id, p_camera_id,
      null, null, v_previous,
      'activity_after_closing', 'activity_after_closing', 'active', v_severity,
      'Atividade depois do fechamento visual',
      round(v_after.observed_value)::text || ' evento(s) foram observados depois do fechamento visual confirmado.',
      v_after.observed_value, 0, 0, 0, v_after.observed_value,
      'count', v_after.confidence, v_after.observed_at,
      v_after.evidence_event_ids,
      jsonb_build_object('language', 'activity_after_confirmed_closing', 'doesNotInferIntent', true)
    );
    v_count := v_count + 1;
  end if;

  select * into v_first
  from public.routine_observations observation
  where observation.camera_id = p_camera_id
    and observation.local_date = v_previous
    and observation.metric_code = 'first_activity_delay_minutes'
  limit 1;

  if found then
    select * into v_expectation
    from public.operational_expectations expectation
    where expectation.camera_id = p_camera_id
      and expectation.status = 'active'
      and expectation.expectation_code = 'first_activity_delay_minutes'
      and expectation.day_of_week in (extract(dow from v_previous)::smallint, -1)
    order by case when expectation.day_of_week = extract(dow from v_previous)::smallint then 0 else 1 end
    limit 1;

    if found and v_first.observed_value > v_expectation.expected_upper + v_expectation.grace_after then
      v_amount := v_first.observed_value - v_expectation.expected_upper;
      v_severity := private.routine_severity('first_activity_late', v_amount, greatest(v_expectation.grace_after, 10));
      perform private.upsert_operational_deviation_v1(
        v_camera.organization_id, v_camera.site_id, p_camera_id,
        v_expectation.baseline_id, v_expectation.id, v_previous,
        'first_activity_late', 'first_activity_late', 'active', v_severity,
        'Primeira atividade mais tarde que o habitual',
        'A primeira atividade ocorreu ' || round(v_first.observed_value)::text
          || ' minutos após a abertura. A faixa habitual termina em '
          || round(v_expectation.expected_upper)::text || ' minutos.',
        v_first.observed_value, v_expectation.expected_lower,
        v_expectation.expected_center, v_expectation.expected_upper,
        v_amount, 'minutes', least(v_first.confidence, v_expectation.confidence),
        v_first.observed_at, v_first.evidence_event_ids,
        jsonb_build_object('language', 'outside_observed_pattern')
      );
      v_count := v_count + 1;
    end if;
  end if;

  select * into v_volume
  from public.routine_observations observation
  where observation.camera_id = p_camera_id
    and observation.local_date = v_previous
    and observation.metric_code = 'daily_session_count'
  limit 1;

  if found then
    select * into v_expectation
    from public.operational_expectations expectation
    where expectation.camera_id = p_camera_id
      and expectation.status = 'active'
      and expectation.expectation_code = 'daily_session_count'
      and expectation.day_of_week in (extract(dow from v_previous)::smallint, -1)
    order by case when expectation.day_of_week = extract(dow from v_previous)::smallint then 0 else 1 end
    limit 1;

    if found and v_volume.observed_value > v_expectation.expected_upper then
      v_amount := v_volume.observed_value - v_expectation.expected_upper;
      perform private.upsert_operational_deviation_v1(
        v_camera.organization_id, v_camera.site_id, p_camera_id,
        v_expectation.baseline_id, v_expectation.id, v_previous,
        'activity_volume_high', 'activity_volume_high', 'active',
        private.routine_severity('activity_volume_high', v_amount, greatest(v_expectation.expected_upper - v_expectation.expected_lower, 1)),
        'Volume de atividade acima do habitual',
        round(v_volume.observed_value)::text || ' sessões foram observadas; a faixa habitual termina em '
          || round(v_expectation.expected_upper)::text || '.',
        v_volume.observed_value, v_expectation.expected_lower,
        v_expectation.expected_center, v_expectation.expected_upper,
        v_amount, 'count', least(v_volume.confidence, v_expectation.confidence),
        v_volume.observed_at, v_volume.evidence_event_ids,
        jsonb_build_object('language', 'outside_observed_pattern')
      );
      v_count := v_count + 1;
    elsif found and v_volume.observed_value < v_expectation.expected_lower then
      v_amount := v_expectation.expected_lower - v_volume.observed_value;
      perform private.upsert_operational_deviation_v1(
        v_camera.organization_id, v_camera.site_id, p_camera_id,
        v_expectation.baseline_id, v_expectation.id, v_previous,
        'activity_volume_low', 'activity_volume_low', 'active',
        private.routine_severity('activity_volume_low', v_amount, greatest(v_expectation.expected_upper - v_expectation.expected_lower, 1)),
        'Volume de atividade abaixo do habitual',
        round(v_volume.observed_value)::text || ' sessões foram observadas; a faixa habitual começa em '
          || round(v_expectation.expected_lower)::text || '.',
        v_volume.observed_value, v_expectation.expected_lower,
        v_expectation.expected_center, v_expectation.expected_upper,
        -v_amount, 'count', least(v_volume.confidence, v_expectation.confidence),
        v_volume.observed_at, v_volume.evidence_event_ids,
        jsonb_build_object('language', 'outside_observed_pattern')
      );
      v_count := v_count + 1;
    end if;
  end if;

  -- Sessões individuais muito mais longas que o baseline do mesmo tipo.
  for v_session in
    select
      session.id,
      session.session_type,
      session.duration_seconds,
      session.started_at,
      session.confidence,
      expectation.id as expectation_id,
      expectation.baseline_id,
      expectation.expected_lower,
      expectation.expected_center,
      expectation.expected_upper,
      expectation.grace_after,
      expectation.confidence as expectation_confidence,
      coalesce((
        select array_agg(chapter.event_id order by chapter.chapter_order)
        from public.operational_session_events chapter
        where chapter.session_id = session.id
          and chapter.is_key_chapter
      ), '{}'::uuid[]) as evidence_event_ids
    from public.operational_sessions session
    join lateral (
      select expectation.*
      from public.operational_expectations expectation
      where expectation.camera_id = p_camera_id
        and expectation.status = 'active'
        and expectation.expectation_code = 'session_duration_seconds'
        and expectation.session_type = session.session_type
        and expectation.day_of_week in (
          extract(dow from session.started_at at time zone v_site.timezone)::smallint,
          -1
        )
      order by case
        when expectation.day_of_week = extract(dow from session.started_at at time zone v_site.timezone)::smallint then 0
        else 1
      end
      limit 1
    ) expectation on true
    where session.camera_id = p_camera_id
      and (session.started_at at time zone v_site.timezone)::date in (v_today, v_previous)
      and session.status <> 'open'
      and session.duration_seconds > expectation.expected_upper + expectation.grace_after
  loop
    v_amount := v_session.duration_seconds - v_session.expected_upper;
    perform private.upsert_operational_deviation_v1(
      v_camera.organization_id, v_camera.site_id, p_camera_id,
      v_session.baseline_id, v_session.expectation_id,
      (v_session.started_at at time zone v_site.timezone)::date,
      'session_duration_high:' || v_session.id,
      'session_duration_high', 'active',
      private.routine_severity('session_duration_high', v_amount, greatest(v_session.grace_after, 60)),
      'Sessão mais longa que o habitual',
      'A sessão de ' || replace(v_session.session_type, '_', ' ')
        || ' durou ' || round(v_session.duration_seconds / 60, 1)::text
        || ' minutos; a faixa habitual termina em '
        || round(v_session.expected_upper / 60, 1)::text || ' minutos.',
      v_session.duration_seconds, v_session.expected_lower,
      v_session.expected_center, v_session.expected_upper,
      v_amount, 'seconds', least(v_session.confidence, v_session.expectation_confidence),
      v_session.started_at, v_session.evidence_event_ids,
      jsonb_build_object('operationalSessionId', v_session.id, 'sessionType', v_session.session_type)
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object(
    'enabled', true,
    'cameraId', p_camera_id,
    'evaluatedAt', p_observed_at,
    'deviationsWritten', v_count
  );
end;
$$;

create or replace function public.refresh_camera_routine_intelligence_v1(
  p_camera_id uuid,
  p_reference_date date default null,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera public.cameras%rowtype;
  v_site public.sites%rowtype;
  v_reference date;
  v_run_id uuid;
  v_observations jsonb;
  v_baselines jsonb;
  v_insights jsonb;
  v_deviations jsonb;
begin
  select * into v_camera from public.cameras where id = p_camera_id;
  if not found then raise exception 'camera_not_found'; end if;
  select * into v_site from public.sites where id = v_camera.site_id;
  if not found then raise exception 'site_not_found'; end if;

  v_reference := coalesce(p_reference_date, (p_observed_at at time zone v_site.timezone)::date);

  insert into public.routine_refresh_runs(
    organization_id, camera_id, reference_date, status, metadata
  ) values (
    v_camera.organization_id, p_camera_id, v_reference, 'running',
    jsonb_build_object('phase', 'int-4', 'method', 'deterministic_routine_v1')
  ) returning id into v_run_id;

  begin
    v_observations := public.refresh_camera_routine_observations_v1(p_camera_id, v_reference);
    v_baselines := public.refresh_camera_behavior_baselines_v1(p_camera_id, v_reference);
    v_insights := public.refresh_camera_routine_insights_v1(p_camera_id);
    v_deviations := public.evaluate_camera_routine_deviations_v1(p_camera_id, p_observed_at);

    update public.routine_refresh_runs
    set status = 'completed',
        observations_written = coalesce((v_observations->>'observationsWritten')::integer, 0),
        baselines_written = coalesce((v_baselines->>'baselinesWritten')::integer, 0),
        deviations_written = coalesce((v_deviations->>'deviationsWritten')::integer, 0),
        completed_at = now(),
        metadata = metadata || jsonb_build_object(
          'routineInsightsWritten', coalesce((v_insights->>'routineInsightsWritten')::integer, 0)
        )
    where id = v_run_id;

    return jsonb_build_object(
      'ok', true,
      'runId', v_run_id,
      'cameraId', p_camera_id,
      'referenceDate', v_reference,
      'observations', v_observations,
      'baselines', v_baselines,
      'insights', v_insights,
      'deviations', v_deviations
    );
  exception when others then
    update public.routine_refresh_runs
    set status = 'failed',
        error_code = sqlstate,
        completed_at = now(),
        metadata = metadata || jsonb_build_object('error', left(sqlerrm, 500))
    where id = v_run_id;
    raise;
  end;
end;
$$;

create or replace function public.refresh_all_routine_intelligence_v1(
  p_reference_date date default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera record;
  v_result jsonb;
  v_processed integer := 0;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  for v_camera in
    select camera.id
    from public.cameras camera
    where camera.routine_intelligence_enabled
    order by camera.created_at, camera.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  loop
    begin
      v_result := public.refresh_camera_routine_intelligence_v1(
        v_camera.id,
        p_reference_date,
        now()
      );
      v_processed := v_processed + 1;
    exception when others then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object(
          'cameraId', v_camera.id,
          'sqlState', sqlstate,
          'error', left(sqlerrm, 300)
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'processed', v_processed,
    'failed', v_failed,
    'failures', v_failures,
    'executedAt', now()
  );
end;
$$;

create or replace function public.evaluate_all_routine_deviations_v1(
  p_observed_at timestamptz default now(),
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_camera record;
  v_result jsonb;
  v_processed integer := 0;
  v_failed integer := 0;
  v_deviations_written integer := 0;
  v_failures jsonb := '[]'::jsonb;
begin
  for v_camera in
    select camera.id
    from public.cameras camera
    where camera.routine_intelligence_enabled
    order by camera.created_at, camera.id
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  loop
    begin
      v_result := public.evaluate_camera_routine_deviations_v1(
        v_camera.id,
        coalesce(p_observed_at, now())
      );
      v_processed := v_processed + 1;
      v_deviations_written := v_deviations_written
        + coalesce((v_result->>'deviationsWritten')::integer, 0);
    exception when others then
      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(
        jsonb_build_object(
          'cameraId', v_camera.id,
          'sqlState', sqlstate,
          'error', left(sqlerrm, 300)
        )
      );
    end;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'mode', 'evaluate',
    'processed', v_processed,
    'failed', v_failed,
    'deviationsWritten', v_deviations_written,
    'failures', v_failures,
    'executedAt', coalesce(p_observed_at, now())
  );
end;
$$;

create or replace function public.assistant_routine_deviation_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_org_member(p_organization_id) then
      jsonb_build_object('error', 'not_authorized')
    else jsonb_build_object(
      'period', jsonb_build_object('from', p_from, 'to', p_to),
      'definitions', jsonb_build_object(
        'routine', 'Faixa recorrente calculada a partir de observações históricas.',
        'deviation', 'Diferença em relação ao padrão observado; não implica crime, intenção ou falha operacional.',
        'missingEvidence', 'Ausência de confirmação visual não prova que a ação não aconteceu.'
      ),
      'baselines', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', baseline.id,
            'camera_id', baseline.camera_id,
            'baseline_code', baseline.baseline_code,
            'day_of_week', baseline.day_of_week,
            'bucket_hour', baseline.bucket_hour,
            'session_type', baseline.session_type,
            'status', baseline.status,
            'sample_count', baseline.sample_count,
            'day_count', baseline.day_count,
            'period_start', baseline.period_start,
            'period_end', baseline.period_end,
            'expected_lower', baseline.lower_value,
            'expected_center', baseline.center_value,
            'expected_upper', baseline.upper_value,
            'unit', baseline.unit,
            'confidence', baseline.confidence
          ) order by baseline.confidence desc, baseline.baseline_code
        )
        from public.camera_behavior_baselines baseline
        where baseline.organization_id = p_organization_id
          and baseline.status in ('active', 'learning')
          and baseline.day_of_week = -1
          and (p_camera_id is null or baseline.camera_id = p_camera_id)
          and (p_site_id is null or baseline.site_id = p_site_id)
      ), '[]'::jsonb),
      'deviations', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', deviation.id,
            'observed_at', deviation.observed_at,
            'local_date', deviation.local_date,
            'camera_id', deviation.camera_id,
            'deviation_code', deviation.deviation_code,
            'status', deviation.status,
            'severity', deviation.severity,
            'title', deviation.title,
            'summary', deviation.summary,
            'confidence', deviation.confidence,
            'evidence_event_ids', deviation.evidence_event_ids,
            'observed_value', deviation.observed_value,
            'expected_lower', deviation.expected_lower,
            'expected_center', deviation.expected_center,
            'expected_upper', deviation.expected_upper,
            'unit', deviation.unit,
            'data', deviation.data
          ) order by deviation.observed_at desc
        )
        from public.operational_deviations deviation
        where deviation.organization_id = p_organization_id
          and deviation.observed_at >= p_from
          and deviation.observed_at < p_to
          and (p_camera_id is null or deviation.camera_id = p_camera_id)
          and (p_site_id is null or deviation.site_id = p_site_id)
      ), '[]'::jsonb)
    )
  end;
$$;

create or replace function public.review_routine_expectation_v1(
  p_expectation_id uuid,
  p_action text,
  p_expected_lower numeric default null,
  p_expected_center numeric default null,
  p_expected_upper numeric default null,
  p_grace_before numeric default null,
  p_grace_after numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expectation public.operational_expectations%rowtype;
begin
  select * into v_expectation
  from public.operational_expectations
  where id = p_expectation_id
  for update;

  if not found then raise exception 'expectation_not_found'; end if;
  if not private.has_org_role(
    v_expectation.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then
    raise exception 'not_authorized';
  end if;

  if p_action = 'confirm' then
    update public.operational_expectations
    set source = case when source = 'learned' then 'hybrid' else source end,
        confirmed_by = auth.uid(),
        confirmed_at = now(),
        metadata = metadata || jsonb_build_object('reviewNote', left(coalesce(p_note, ''), 500)),
        updated_at = now()
    where id = p_expectation_id;
  elsif p_action = 'adjust' then
    if p_expected_lower is null or p_expected_center is null or p_expected_upper is null
       or p_expected_lower > p_expected_center or p_expected_center > p_expected_upper then
      raise exception 'invalid_expected_range';
    end if;

    update public.operational_expectations
    set source = 'user',
        expected_lower = p_expected_lower,
        expected_center = p_expected_center,
        expected_upper = p_expected_upper,
        grace_before = coalesce(p_grace_before, grace_before),
        grace_after = coalesce(p_grace_after, grace_after),
        confidence = 1,
        confirmed_by = auth.uid(),
        confirmed_at = now(),
        metadata = metadata || jsonb_build_object('reviewNote', left(coalesce(p_note, ''), 500)),
        updated_at = now()
    where id = p_expectation_id;
  elsif p_action = 'pause' then
    update public.operational_expectations
    set status = 'paused',
        confirmed_by = auth.uid(),
        confirmed_at = now(),
        metadata = metadata || jsonb_build_object('reviewNote', left(coalesce(p_note, ''), 500)),
        updated_at = now()
    where id = p_expectation_id;
  elsif p_action = 'resume' then
    update public.operational_expectations
    set status = 'active',
        confirmed_by = auth.uid(),
        confirmed_at = now(),
        metadata = metadata || jsonb_build_object('reviewNote', left(coalesce(p_note, ''), 500)),
        updated_at = now()
    where id = p_expectation_id;
  else
    raise exception 'invalid_action';
  end if;

  select * into v_expectation
  from public.operational_expectations
  where id = p_expectation_id;

  return jsonb_build_object(
    'ok', true,
    'expectationId', v_expectation.id,
    'source', v_expectation.source,
    'status', v_expectation.status,
    'expectedLower', v_expectation.expected_lower,
    'expectedCenter', v_expectation.expected_center,
    'expectedUpper', v_expectation.expected_upper
  );
end;
$$;

insert into public.monitoria_capability_registry(module, status, introduced_phase, description)
values
  ('routines', 'available', '4', 'Rotinas e padrões operacionais calculados deterministicamente'),
  ('deviations', 'available', '4', 'Desvios em relação ao padrão observado, com evidências e incerteza')
on conflict (module) do update
set status = excluded.status,
    introduced_phase = excluded.introduced_phase,
    description = excluded.description,
    updated_at = now();

-- Habilita a fase apenas nas câmeras que já consolidam sessões operacionais.
update public.cameras
set routine_intelligence_enabled = true,
    updated_at = now()
where operational_sessions_enabled = true
  and routine_intelligence_enabled = false;

revoke all on function private.routine_local_minute(timestamptz, text) from public, anon, authenticated;
revoke all on function private.routine_local_minute_relative(timestamptz, date, text) from public, anon, authenticated;
revoke all on function private.routine_format_minute(numeric) from public, anon, authenticated;
revoke all on function private.routine_confidence(integer, integer, numeric, numeric) from public, anon, authenticated;
revoke all on function private.routine_grace_value(text, text, integer) from public, anon, authenticated;
revoke all on function private.routine_severity(text, numeric, numeric) from public, anon, authenticated;
revoke all on function private.upsert_routine_insight_v1(uuid, uuid, uuid, text, text, text, text, text, numeric, timestamptz, timestamptz, text, uuid, uuid[], jsonb) from public, anon, authenticated;
revoke all on function private.upsert_operational_deviation_v1(uuid, uuid, uuid, uuid, uuid, date, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, numeric, timestamptz, uuid[], jsonb) from public, anon, authenticated;

revoke all on function public.refresh_camera_routine_observations_v1(uuid, date) from public, anon, authenticated;
revoke all on function public.refresh_camera_behavior_baselines_v1(uuid, date) from public, anon, authenticated;
revoke all on function public.refresh_camera_routine_insights_v1(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_camera_routine_deviations_v1(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_camera_routine_intelligence_v1(uuid, date, timestamptz) from public, anon, authenticated;
revoke all on function public.refresh_all_routine_intelligence_v1(date, integer, integer) from public, anon, authenticated;
revoke all on function public.evaluate_all_routine_deviations_v1(timestamptz, integer, integer) from public, anon, authenticated;

grant execute on function public.refresh_camera_routine_observations_v1(uuid, date) to service_role;
grant execute on function public.refresh_camera_behavior_baselines_v1(uuid, date) to service_role;
grant execute on function public.refresh_camera_routine_insights_v1(uuid) to service_role;
grant execute on function public.evaluate_camera_routine_deviations_v1(uuid, timestamptz) to service_role;
grant execute on function public.refresh_camera_routine_intelligence_v1(uuid, date, timestamptz) to service_role;
grant execute on function public.refresh_all_routine_intelligence_v1(date, integer, integer) to service_role;
grant execute on function public.evaluate_all_routine_deviations_v1(timestamptz, integer, integer) to service_role;

revoke all on function public.assistant_routine_deviation_summary(uuid, timestamptz, timestamptz, uuid, uuid) from public, anon;
grant execute on function public.assistant_routine_deviation_summary(uuid, timestamptz, timestamptz, uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'monitoria_mcp_readonly') then
    grant execute on function public.assistant_routine_deviation_summary(uuid, timestamptz, timestamptz, uuid, uuid)
      to monitoria_mcp_readonly;
  end if;
end
$$;

revoke all on function public.review_routine_expectation_v1(uuid, text, numeric, numeric, numeric, numeric, numeric, text)
  from public, anon;
grant execute on function public.review_routine_expectation_v1(uuid, text, numeric, numeric, numeric, numeric, numeric, text)
  to authenticated;

-- Atualização em tempo real da seção de rotinas.
do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array[
      'camera_behavior_baselines',
      'operational_deviations',
      'operational_insights'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end
$$;

commit;
