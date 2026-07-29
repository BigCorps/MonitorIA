-- MonitorIA v0.7.3 — segmentação, telemetria, A/B e modos reais.

alter table public.cameras
  add column if not exists motion_adaptive_enabled boolean not null default true,
  add column if not exists motion_overlay_mask text not null default 'auto',
  add column if not exists motion_start_consecutive_frames smallint not null default 3,
  add column if not exists motion_end_consecutive_frames smallint not null default 6,
  add column if not exists motion_cooldown_seconds integer not null default 10,
  add column if not exists monitoring_schedule jsonb not null default '{"mode":"always"}'::jsonb,
  add column if not exists motion_calibration jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_motion_overlay_mask_check'
  ) then
    alter table public.cameras
      add constraint cameras_motion_overlay_mask_check
      check (
        motion_overlay_mask = any (
          array[
            'auto'::text,
            'none'::text,
            'top-left'::text,
            'top-right'::text,
            'bottom-left'::text,
            'bottom-right'::text
          ]
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_motion_start_consecutive_frames_check'
  ) then
    alter table public.cameras
      add constraint cameras_motion_start_consecutive_frames_check
      check (
        motion_start_consecutive_frames between 1 and 20
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_motion_end_consecutive_frames_check'
  ) then
    alter table public.cameras
      add constraint cameras_motion_end_consecutive_frames_check
      check (
        motion_end_consecutive_frames between 2 and 120
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_motion_cooldown_seconds_check'
  ) then
    alter table public.cameras
      add constraint cameras_motion_cooldown_seconds_check
      check (
        motion_cooldown_seconds between 0 and 3600
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_monitoring_schedule_object_check'
  ) then
    alter table public.cameras
      add constraint cameras_monitoring_schedule_object_check
      check (jsonb_typeof(monitoring_schedule) = 'object');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'cameras_motion_calibration_object_check'
  ) then
    alter table public.cameras
      add constraint cameras_motion_calibration_object_check
      check (jsonb_typeof(motion_calibration) = 'object');
  end if;
end
$$;

-- Configurações iniciais dos três modos durante a fase de validação.
update public.cameras
set capture_interval_seconds = case analysis_plan_code
      when 'basic' then 3
      else 1
    end,
    consolidation_interval_seconds = case analysis_plan_code
      when 'basic' then 60
      when 'intensive' then 1
      else 10
    end,
    motion_start_threshold = case analysis_plan_code
      when 'basic' then 1.5
      when 'intensive' then 1.0
      else 1.25
    end,
    motion_continue_threshold = case analysis_plan_code
      when 'basic' then 0.75
      when 'intensive' then 0.50
      else 0.60
    end,
    event_close_after_seconds = case analysis_plan_code
      when 'basic' then 45
      when 'intensive' then 8
      else 15
    end,
    motion_start_consecutive_frames = case analysis_plan_code
      when 'intensive' then 2
      else 3
    end,
    motion_end_consecutive_frames = case analysis_plan_code
      when 'basic' then 4
      when 'intensive' then 5
      else 6
    end,
    motion_cooldown_seconds = case analysis_plan_code
      when 'basic' then 15
      when 'intensive' then 5
      else 10
    end,
    motion_adaptive_enabled = true,
    updated_at = now();

alter table public.analysis_jobs
  add column if not exists cached_input_tokens integer not null default 0,
  add column if not exists reasoning_tokens integer not null default 0,
  add column if not exists analysis_plan_code text null,
  add column if not exists model_chain jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_jobs_analysis_plan_code_check'
  ) then
    alter table public.analysis_jobs
      add constraint analysis_jobs_analysis_plan_code_check
      check (
        analysis_plan_code is null
        or analysis_plan_code = any (
          array['basic'::text, 'standard'::text, 'intensive'::text]
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'analysis_jobs_model_chain_array_check'
  ) then
    alter table public.analysis_jobs
      add constraint analysis_jobs_model_chain_array_check
      check (jsonb_typeof(model_chain) = 'array');
  end if;
end
$$;

alter table public.usage_events
  add column if not exists cached_input_tokens integer not null default 0,
  add column if not exists reasoning_tokens integer not null default 0,
  add column if not exists analysis_plan_code text null,
  add column if not exists pricing jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usage_events_analysis_plan_code_check'
  ) then
    alter table public.usage_events
      add constraint usage_events_analysis_plan_code_check
      check (
        analysis_plan_code is null
        or analysis_plan_code = any (
          array['basic'::text, 'standard'::text, 'intensive'::text]
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usage_events_pricing_object_check'
  ) then
    alter table public.usage_events
      add constraint usage_events_pricing_object_check
      check (jsonb_typeof(pricing) = 'object');
  end if;
end
$$;

create index if not exists usage_events_plan_time_idx
  on public.usage_events(
    organization_id,
    analysis_plan_code,
    created_at desc
  );

create table if not exists public.vision_model_experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  camera_id uuid not null
    references public.cameras(id) on delete cascade,
  analysis_job_id uuid not null unique
    references public.analysis_jobs(id) on delete cascade,
  plan_code text not null
    check (
      plan_code = any (
        array['basic'::text, 'standard'::text, 'intensive'::text]
      )
    ),
  nano_model text not null,
  mini_model text not null,
  nano_payload jsonb not null,
  mini_payload jsonb not null,
  nano_usage jsonb not null default '{}'::jsonb,
  mini_usage jsonb not null default '{}'::jsonb,
  nano_latency_ms integer not null default 0,
  mini_latency_ms integer not null default 0,
  nano_cost_usd numeric null,
  mini_cost_usd numeric null,
  human_preference text null
    check (
      human_preference is null
      or human_preference = any (
        array[
          'nano'::text,
          'mini'::text,
          'equivalent'::text,
          'both_bad'::text
        ]
      )
    ),
  review_notes text not null default '',
  reviewed_by uuid null
    references auth.users(id) on delete set null,
  reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(nano_payload) = 'object'),
  check (jsonb_typeof(mini_payload) = 'object'),
  check (jsonb_typeof(nano_usage) = 'object'),
  check (jsonb_typeof(mini_usage) = 'object')
);

create index if not exists vision_model_experiments_camera_time_idx
  on public.vision_model_experiments(
    camera_id,
    created_at desc
  );

alter table public.vision_model_experiments enable row level security;

drop policy if exists vision_model_experiments_select
  on public.vision_model_experiments;
create policy vision_model_experiments_select
on public.vision_model_experiments
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists vision_model_experiments_review
  on public.vision_model_experiments;

revoke all on public.vision_model_experiments
  from public, anon;
grant select on public.vision_model_experiments
  to authenticated;
grant all on public.vision_model_experiments
  to service_role;

create or replace function public.rate_vision_model_experiment(
  p_experiment_id uuid,
  p_preference text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  if p_preference is null
     or p_preference <> all (
       array[
         'nano'::text,
         'mini'::text,
         'equivalent'::text,
         'both_bad'::text
       ]
     ) then
    raise exception 'invalid_preference';
  end if;

  select experiment.organization_id
    into v_organization_id
  from public.vision_model_experiments experiment
  where experiment.id = p_experiment_id;

  if not found then
    raise exception 'experiment_not_found';
  end if;

  if not private.has_org_role(
    v_organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  ) then
    raise exception 'not_authorized';
  end if;

  update public.vision_model_experiments
  set human_preference = p_preference,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = p_experiment_id;
end;
$$;

revoke all on function public.rate_vision_model_experiment(uuid, text)
  from public, anon;
grant execute on function public.rate_vision_model_experiment(uuid, text)
  to authenticated;

create table if not exists public.agent_health_hourly (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  agent_id uuid not null
    references public.agents(id) on delete cascade,
  hour timestamptz not null,
  status public.agent_status not null,
  average_cpu_percent numeric null,
  maximum_cpu_percent numeric null,
  average_memory_bytes numeric null,
  minimum_disk_free_bytes bigint null,
  maximum_queued_events integer not null default 0,
  samples integer not null default 0,
  primary key (agent_id, hour)
);

create index if not exists agent_health_hourly_org_time_idx
  on public.agent_health_hourly(
    organization_id,
    hour desc
  );

alter table public.agent_health_hourly enable row level security;

drop policy if exists agent_health_hourly_select
  on public.agent_health_hourly;
create policy agent_health_hourly_select
on public.agent_health_hourly
for select
to authenticated
using (private.is_org_member(organization_id));

revoke all on public.agent_health_hourly
  from public, anon;
grant select on public.agent_health_hourly
  to authenticated;
grant all on public.agent_health_hourly
  to service_role;

create or replace function public.rollup_and_purge_agent_health(
  p_raw_days integer default 7,
  p_rollup_days integer default 365
)
returns table(
  hourly_rows_upserted bigint,
  raw_rows_deleted bigint,
  rollup_rows_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_upserted bigint := 0;
  v_raw_deleted bigint := 0;
  v_rollup_deleted bigint := 0;
  v_raw_days integer :=
    greatest(1, least(coalesce(p_raw_days, 7), 90));
  v_rollup_days integer :=
    greatest(7, least(coalesce(p_rollup_days, 365), 3650));
begin
  insert into public.agent_health_hourly (
    organization_id,
    agent_id,
    hour,
    status,
    average_cpu_percent,
    maximum_cpu_percent,
    average_memory_bytes,
    minimum_disk_free_bytes,
    maximum_queued_events,
    samples
  )
  select
    ah.organization_id,
    ah.agent_id,
    date_trunc('hour', ah.recorded_at),
    (
      array_agg(ah.status order by ah.recorded_at desc)
    )[1],
    avg(ah.cpu_percent),
    max(ah.cpu_percent),
    avg(ah.memory_bytes),
    min(ah.disk_free_bytes),
    max(ah.queued_events),
    count(*)::integer
  from public.agent_health ah
  where ah.recorded_at <
    date_trunc('hour', now())
  group by
    ah.organization_id,
    ah.agent_id,
    date_trunc('hour', ah.recorded_at)
  on conflict (agent_id, hour)
  do update set
    organization_id = excluded.organization_id,
    status = excluded.status,
    average_cpu_percent = excluded.average_cpu_percent,
    maximum_cpu_percent = excluded.maximum_cpu_percent,
    average_memory_bytes = excluded.average_memory_bytes,
    minimum_disk_free_bytes = excluded.minimum_disk_free_bytes,
    maximum_queued_events = excluded.maximum_queued_events,
    samples = excluded.samples;

  get diagnostics v_upserted = row_count;

  delete from public.agent_health
  where recorded_at <
    now() - pg_catalog.make_interval(days => v_raw_days);

  get diagnostics v_raw_deleted = row_count;

  delete from public.agent_health_hourly
  where hour <
    now() - pg_catalog.make_interval(days => v_rollup_days);

  get diagnostics v_rollup_deleted = row_count;

  return query
  select v_upserted, v_raw_deleted, v_rollup_deleted;
end;
$$;

revoke all on function public.rollup_and_purge_agent_health(integer, integer)
  from public, anon, authenticated;
grant execute on function public.rollup_and_purge_agent_health(integer, integer)
  to service_role;

comment on column public.cameras.motion_overlay_mask is
  'Máscara de overlay. Auto detecta ruído repetitivo apenas nas bordas.';
comment on column public.cameras.motion_calibration is
  'Reserva para persistir calibração aprovada; a v0.7.3 calcula localmente.';
comment on table public.vision_model_experiments is
  'Comparações temporárias entre GPT-5 nano e mini para validação de qualidade e custo.';
