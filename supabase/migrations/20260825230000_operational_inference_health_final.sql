-- MonitorIA — inferência operacional de abertura/fechamento sem alterar o Agent 1.0.2
-- Migration de convergência: é idempotente e parte das migrations já existentes
-- de câmera-saúde, rotinas e visual_state_engine.
--
-- Objetivos:
-- 1. impedir que uma única leitura visual não transitiva feche/reabra a loja;
-- 2. aceitar somente marcadores automáticos cujo NOME identifique barreira física;
-- 3. usar camera_health_observations já enviadas pelo Agent para estimar uma
--    janela de abertura/fechamento quando não houve evento de movimento;
-- 4. exigir estabilidade e, quando há outra câmera saudável no local,
--    corroborar a mudança de regime em mais de uma câmera;
-- 5. expor faixa, precisão, confiança e significado ao MCP/Pesquisa IA.

begin;

alter table public.sites
  add column if not exists operational_inference_config jsonb not null default '{}'::jsonb;

alter table public.site_operating_sessions
  add column if not exists opening_window_start_at timestamptz null,
  add column if not exists opening_window_end_at timestamptz null,
  add column if not exists closing_window_start_at timestamptz null,
  add column if not exists closing_window_end_at timestamptz null,
  add column if not exists opening_inference_source text null,
  add column if not exists closing_inference_source text null,
  add column if not exists opening_confidence numeric(5,4) null,
  add column if not exists closing_confidence numeric(5,4) null;

alter table public.site_operating_sessions
  drop constraint if exists site_operating_sessions_opening_precision_check,
  drop constraint if exists site_operating_sessions_closing_precision_check,
  drop constraint if exists site_operating_sessions_opening_window_check,
  drop constraint if exists site_operating_sessions_closing_window_check;

alter table public.site_operating_sessions
  add constraint site_operating_sessions_opening_precision_check
    check (opening_precision in (
      'visible_transition',
      'persistent_confirmation',
      'observed_only',
      'estimated_interval'
    )),
  add constraint site_operating_sessions_closing_precision_check
    check (
      closing_precision is null
      or closing_precision in (
        'visible_transition',
        'persistent_confirmation',
        'strong_snapshot',
        'estimated_interval'
      )
    ),
  add constraint site_operating_sessions_opening_window_check
    check (
      opening_window_start_at is null
      or opening_window_end_at is null
      or opening_window_end_at >= opening_window_start_at
    ),
  add constraint site_operating_sessions_closing_window_check
    check (
      closing_window_start_at is null
      or closing_window_end_at is null
      or closing_window_end_at >= closing_window_start_at
    );

create table if not exists public.operational_state_inferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  entity_id uuid not null references public.camera_visual_entities(id) on delete cascade,
  session_id uuid null references public.site_operating_sessions(id) on delete set null,
  direction text not null,
  source text not null,
  window_start_at timestamptz not null,
  window_end_at timestamptz not null,
  estimated_at timestamptz not null,
  confidence numeric(5,4) not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint operational_state_inferences_direction_check
    check (direction in ('opening','closing')),
  constraint operational_state_inferences_source_check
    check (source in ('camera_health_regime_shift')),
  constraint operational_state_inferences_time_check
    check (
      window_end_at >= window_start_at
      and estimated_at >= window_start_at
      and estimated_at <= window_end_at
    ),
  constraint operational_state_inferences_confidence_check
    check (confidence between 0 and 1),
  constraint operational_state_inferences_evidence_check
    check (jsonb_typeof(evidence) = 'object')
);

create index if not exists operational_state_inferences_site_time_idx
  on public.operational_state_inferences(site_id, estimated_at desc);

create unique index if not exists operational_state_inferences_session_direction_uidx
  on public.operational_state_inferences(session_id, direction)
  where session_id is not null;

alter table public.operational_state_inferences enable row level security;

drop policy if exists operational_state_inferences_select
  on public.operational_state_inferences;
create policy operational_state_inferences_select
on public.operational_state_inferences
for select
to authenticated
using (private.is_org_member(organization_id));

grant select on public.operational_state_inferences to authenticated;
grant all on public.operational_state_inferences to service_role;

create or replace function private.monitoria_health_grid_distance_v1(
  p_left jsonb,
  p_right jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    (
      select avg(
        abs((l.value::text)::numeric - (r.value::text)::numeric)
      ) / 255.0
      from jsonb_array_elements(
        case when jsonb_typeof(p_left) = 'array' then p_left else '[]'::jsonb end
      ) with ordinality l(value, ord)
      join jsonb_array_elements(
        case when jsonb_typeof(p_right) = 'array' then p_right else '[]'::jsonb end
      ) with ordinality r(value, ord)
        using (ord)
    ),
    0
  );
$$;

create or replace function private.monitoria_health_change_score_v1(
  p_left_grid jsonb,
  p_right_grid jsonb,
  p_left_brightness numeric,
  p_right_brightness numeric,
  p_left_contrast numeric,
  p_right_contrast numeric,
  p_left_dark numeric,
  p_right_dark numeric,
  p_left_bright numeric,
  p_right_bright numeric
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select least(
    1.0,
    private.monitoria_health_grid_distance_v1(p_left_grid, p_right_grid)
    + 0.35 * abs(coalesce(p_left_dark,0) - coalesce(p_right_dark,0))
    + 0.15 * least(
        1.0,
        abs(coalesce(p_left_contrast,0) - coalesce(p_right_contrast,0)) / 64.0
      )
    + 0.10 * least(
        1.0,
        abs(coalesce(p_left_brightness,0) - coalesce(p_right_brightness,0)) / 80.0
      )
    + 0.05 * abs(coalesce(p_left_bright,0) - coalesce(p_right_bright,0))
  );
$$;

create or replace function private.monitoria_access_name_is_physical_v1(p_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(coalesce(p_name,'')) ~
    '(^|[^[:alpha:]])(porta|port[aã]o|grade|cancela|barreira|persiana|cortina|door|doorway|gate|roller|shutter|barrier)([^[:alpha:]]|$)';
$$;

-- O sincronizador legado continua podendo rodar. Esta camada final remove um
-- marcador automático genérico e escolhe apenas uma zona cujo nome identifica
-- uma barreira física real.
create or replace function private.monitoria_sync_operational_access_marker_v5(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.camera_profiles%rowtype;
  v_zone record;
  v_existing_id uuid;
begin
  select * into v_profile
  from public.camera_profiles
  where id = p_profile_id;

  if not found or not v_profile.is_active then
    return null;
  end if;

  update public.camera_visual_entities entity
  set enabled = false,
      primary_operational_marker = false,
      metadata = coalesce(entity.metadata,'{}'::jsonb)
        || jsonb_build_object(
          'invalidatedBy','operational_access_marker_v5',
          'invalidatedAt',now(),
          'reason','zone_name_does_not_identify_physical_barrier'
        ),
      updated_at = now()
  where entity.camera_profile_id = v_profile.id
    and entity.enabled
    and entity.primary_operational_marker
    and entity.entity_type = 'access_barrier'
    and coalesce(entity.metadata->>'source','') like 'profile_zone_auto_access_barrier_%'
    and not private.monitoria_access_name_is_physical_v1(entity.name);

  select entity.id
  into v_existing_id
  from public.camera_visual_entities entity
  where entity.camera_profile_id = v_profile.id
    and entity.enabled
    and entity.primary_operational_marker
    and entity.entity_type = 'access_barrier'
    and (
      coalesce(entity.metadata->>'source','') not like 'profile_zone_auto_access_barrier_%'
      or private.monitoria_access_name_is_physical_v1(entity.name)
    )
  order by
    coalesce((entity.metadata->>'auto_score')::integer,0) desc,
    entity.sort_order,
    entity.created_at
  limit 1;

  if found then
    return v_existing_id;
  end if;

  select
    zone.id,
    zone.name,
    zone.zone_type,
    zone.description,
    zone.polygon,
    zone.sort_order,
    private.monitoria_operational_access_zone_score_v3(
      zone.name,
      zone.description,
      zone.zone_type
    ) as score
  into v_zone
  from public.camera_zones zone
  where zone.organization_id = v_profile.organization_id
    and zone.camera_profile_id = v_profile.id
    and zone.zone_type <> 'ignore'
    and private.monitoria_access_name_is_physical_v1(zone.name)
  order by score desc, zone.sort_order, zone.id
  limit 1;

  if not found or coalesce(v_zone.score,0) < 10 then
    return null;
  end if;

  select entity.id
  into v_existing_id
  from public.camera_visual_entities entity
  where entity.organization_id = v_profile.organization_id
    and entity.camera_id = v_profile.camera_id
    and entity.camera_profile_id = v_profile.id
    and lower(entity.name) = lower(left(trim(v_zone.name),120))
    and entity.entity_type = 'access_barrier'
  order by entity.enabled desc, entity.updated_at desc
  limit 1;

  if found then
    update public.camera_visual_entities
    set enabled = true,
        primary_operational_marker = true,
        polygon = v_zone.polygon,
        sort_order = coalesce(v_zone.sort_order,0),
        metadata = coalesce(metadata,'{}'::jsonb)
          || jsonb_build_object(
            'source','profile_zone_auto_access_barrier_v5',
            'zone_id',v_zone.id,
            'profile_version',v_profile.version,
            'auto_score',v_zone.score,
            'generated_from','approved_camera_profile'
          ),
        updated_at = now()
    where id = v_existing_id;
    return v_existing_id;
  end if;

  insert into public.camera_visual_entities (
    organization_id,
    camera_id,
    camera_profile_id,
    name,
    entity_type,
    polygon,
    state_definitions,
    primary_operational_marker,
    min_confidence,
    reliability,
    enabled,
    sort_order,
    metadata,
    approved_by,
    approved_at
  ) values (
    v_profile.organization_id,
    v_profile.camera_id,
    v_profile.id,
    left(trim(v_zone.name),120),
    'access_barrier',
    v_zone.polygon,
    jsonb_build_array(
      jsonb_build_object(
        'state','closed',
        'description','A barreira está visualmente fechada e bloqueia o acesso observado.'
      ),
      jsonb_build_object(
        'state','partially_open',
        'description','A barreira está parcialmente aberta; ainda não há abertura completa.'
      ),
      jsonb_build_object(
        'state','open',
        'description','A barreira está visualmente aberta e permite passagem pelo acesso observado.'
      )
    ),
    true,
    0.780,
    'medium',
    true,
    coalesce(v_zone.sort_order,0),
    jsonb_build_object(
      'source','profile_zone_auto_access_barrier_v5',
      'zone_id',v_zone.id,
      'profile_version',v_profile.version,
      'auto_score',v_zone.score,
      'generated_from','approved_camera_profile'
    ),
    v_profile.reviewed_by,
    coalesce(v_profile.reviewed_at,now())
  )
  returning id into v_existing_id;

  return v_existing_id;
end;
$$;

create or replace function private.monitoria_operational_access_marker_trigger_v5()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active then
    perform private.monitoria_sync_operational_access_marker_v5(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists camera_profiles_sync_operational_access_v5
  on public.camera_profiles;
create trigger camera_profiles_sync_operational_access_v5
after insert or update of is_active
on public.camera_profiles
for each row
execute function private.monitoria_operational_access_marker_trigger_v5();

-- Uma única leitura sem transição visível não muda o estado primário.
create or replace function private.monitoria_guard_primary_visual_transition_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity public.camera_visual_entities%rowtype;
  v_observation public.visual_state_observations%rowtype;
  v_confirmations integer := 0;
begin
  if old.current_state is not distinct from new.current_state then
    return new;
  end if;

  select * into v_entity
  from public.camera_visual_entities
  where id = new.entity_id;

  if not found
     or not v_entity.enabled
     or not v_entity.primary_operational_marker
     or v_entity.entity_type <> 'access_barrier' then
    return new;
  end if;

  if new.source_observation_id is null then
    return new;
  end if;

  select * into v_observation
  from public.visual_state_observations
  where id = new.source_observation_id;

  if not found
     or coalesce(new.transition_was_visible,false)
     or coalesce(v_observation.transition_visible,false) then
    return new;
  end if;

  select count(distinct observation.event_id)
  into v_confirmations
  from public.visual_state_observations observation
  where observation.entity_id = new.entity_id
    and observation.observed_state = new.current_state
    and observation.visibility = 'clear'
    and observation.confidence >= v_entity.min_confidence
    and observation.observed_at between
      v_observation.observed_at - interval '20 minutes'
      and v_observation.observed_at;

  if v_confirmations >= 2 then
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists visual_entity_current_states_guard_primary_transition_v2
  on public.visual_entity_current_states;
create trigger visual_entity_current_states_guard_primary_transition_v2
before update of current_state
on public.visual_entity_current_states
for each row
execute function private.monitoria_guard_primary_visual_transition_v2();

-- A transição auditável também só nasce quando a mudança não vista já possui
-- duas observações independentes.
create or replace function private.monitoria_guard_primary_transition_insert_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity public.camera_visual_entities%rowtype;
  v_confirmations integer := 0;
begin
  if new.from_state is null
     or new.from_state is not distinct from new.to_state then
    return new;
  end if;

  select * into v_entity
  from public.camera_visual_entities
  where id = new.entity_id;

  if not found
     or not v_entity.enabled
     or not v_entity.primary_operational_marker
     or v_entity.entity_type <> 'access_barrier'
     or coalesce(new.transition_visible,false) then
    return new;
  end if;

  select count(distinct observation.event_id)
  into v_confirmations
  from public.visual_state_observations observation
  where observation.entity_id = new.entity_id
    and observation.observed_state = new.to_state
    and observation.visibility = 'clear'
    and observation.confidence >= v_entity.min_confidence
    and observation.observed_at between
      new.occurred_at - interval '20 minutes'
      and new.occurred_at;

  if v_confirmations >= 2 then
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists visual_state_transitions_guard_primary_insert_v1
  on public.visual_state_transitions;
create trigger visual_state_transitions_guard_primary_insert_v1
before insert on public.visual_state_transitions
for each row
execute function private.monitoria_guard_primary_transition_insert_v1();

-- Fechamento não visto: duas observações independentes. Inferência por health
-- e transição visível têm autoridade própria.
create or replace function private.monitoria_guard_operating_session_close_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity public.camera_visual_entities%rowtype;
  v_confirmations integer := 0;
begin
  if old.status <> 'open' or new.status <> 'closed' then
    return new;
  end if;

  if new.closing_precision in ('visible_transition','estimated_interval') then
    return new;
  end if;

  select * into v_entity
  from public.camera_visual_entities
  where id = new.entity_id;

  if not found
     or not v_entity.enabled
     or not v_entity.primary_operational_marker
     or v_entity.entity_type <> 'access_barrier' then
    return new;
  end if;

  select count(distinct observation.event_id)
  into v_confirmations
  from public.visual_state_observations observation
  where observation.entity_id = new.entity_id
    and observation.observed_state = 'closed'
    and observation.visibility = 'clear'
    and observation.confidence >= v_entity.min_confidence
    and observation.observed_at between
      coalesce(new.closed_at,now()) - interval '20 minutes'
      and coalesce(new.closed_at,now());

  if v_confirmations >= 2 then
    return new;
  end if;

  new.status := old.status;
  new.closed_at := old.closed_at;
  new.closing_precision := old.closing_precision;
  new.close_transition_id := old.close_transition_id;
  new.closing_event_id := old.closing_event_id;
  new.closing_window_start_at := old.closing_window_start_at;
  new.closing_window_end_at := old.closing_window_end_at;
  new.closing_inference_source := old.closing_inference_source;
  new.closing_confidence := old.closing_confidence;
  new.updated_at := old.updated_at;
  return new;
end;
$$;

drop trigger if exists site_operating_sessions_guard_close_v2
  on public.site_operating_sessions;
create trigger site_operating_sessions_guard_close_v2
before update of status
on public.site_operating_sessions
for each row
execute function private.monitoria_guard_operating_session_close_v2();

-- Após já existir um fechamento, uma reabertura sem transição direta também
-- exige confirmação independente. A primeira observação histórica continua
-- podendo ser observed_only.
create or replace function private.monitoria_guard_operating_session_open_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity public.camera_visual_entities%rowtype;
  v_has_closed boolean := false;
  v_confirmations integer := 0;
begin
  if new.status <> 'open'
     or new.opening_precision in ('visible_transition','estimated_interval') then
    return new;
  end if;

  select * into v_entity
  from public.camera_visual_entities
  where id = new.entity_id;

  if not found
     or not v_entity.enabled
     or not v_entity.primary_operational_marker
     or v_entity.entity_type <> 'access_barrier' then
    return new;
  end if;

  select exists(
    select 1
    from public.site_operating_sessions previous
    where previous.entity_id = new.entity_id
      and previous.status = 'closed'
      and previous.closed_at is not null
      and previous.closed_at < new.first_open_observed_at
  )
  into v_has_closed;

  if not v_has_closed then
    return new;
  end if;

  select count(distinct observation.event_id)
  into v_confirmations
  from public.visual_state_observations observation
  where observation.entity_id = new.entity_id
    and observation.observed_state = 'open'
    and observation.visibility = 'clear'
    and observation.confidence >= v_entity.min_confidence
    and observation.observed_at between
      new.first_open_observed_at - interval '20 minutes'
      and new.first_open_observed_at;

  if v_confirmations >= 2 then
    return new;
  end if;

  return null;
end;
$$;

drop trigger if exists site_operating_sessions_guard_open_v1
  on public.site_operating_sessions;
create trigger site_operating_sessions_guard_open_v1
before insert on public.site_operating_sessions
for each row
execute function private.monitoria_guard_operating_session_open_v1();

-- Janela de inferência. Se o local tem configuração explícita, usa-a. Caso
-- contrário reutiliza a referência de rotina já existente.
create or replace function private.monitoria_inference_window_v1(
  p_site_id uuid,
  p_camera_id uuid,
  p_moment timestamptz,
  p_direction text
)
returns table(
  window_start_at timestamptz,
  window_end_at timestamptz,
  center_at timestamptz,
  source text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_site public.sites%rowtype;
  v_config jsonb;
  v_reference jsonb;
  v_local_date date;
  v_minute integer;
  v_before integer;
  v_after integer;
  v_center_local timestamp;
begin
  select * into v_site
  from public.sites
  where id = p_site_id;

  if not found then
    return;
  end if;

  v_config := coalesce(v_site.operational_inference_config,'{}'::jsonb);
  v_local_date := (p_moment at time zone v_site.timezone)::date;

  if coalesce((v_config->>'enabled')::boolean,false) then
    if p_direction = 'opening' then
      v_minute := nullif(v_config->>'openingMinute','')::integer;
      v_before := coalesce(
        nullif(v_config->>'openingWindowBeforeMinutes','')::integer,
        90
      );
      v_after := coalesce(
        nullif(v_config->>'openingWindowAfterMinutes','')::integer,
        120
      );
    elsif p_direction = 'closing' then
      v_minute := nullif(v_config->>'closingMinute','')::integer;
      v_before := coalesce(
        nullif(v_config->>'closingWindowBeforeMinutes','')::integer,
        120
      );
      v_after := coalesce(
        nullif(v_config->>'closingWindowAfterMinutes','')::integer,
        180
      );
    else
      return;
    end if;
    source := 'site_config';
  else
    v_reference := private.routine_day_reference_v2(p_camera_id,v_local_date);

    if not coalesce((v_reference->>'configured')::boolean,false)
       or coalesce((v_reference->>'closed')::boolean,false) then
      return;
    end if;

    if p_direction = 'opening' then
      v_minute := nullif(v_reference->>'openCenter','')::numeric::integer;
      v_before := greatest(
        30,
        coalesce(
          nullif(v_reference->>'openGraceBefore','')::numeric::integer,
          60
        ) + 60
      );
      v_after := greatest(
        60,
        coalesce(
          nullif(v_reference->>'openGraceAfter','')::numeric::integer,
          60
        ) + 90
      );
    elsif p_direction = 'closing' then
      v_minute := nullif(v_reference->>'closeCenter','')::numeric::integer;
      v_before := greatest(
        60,
        coalesce(
          nullif(v_reference->>'closeGraceBefore','')::numeric::integer,
          60
        ) + 90
      );
      v_after := greatest(
        90,
        coalesce(
          nullif(v_reference->>'closeGraceAfter','')::numeric::integer,
          60
        ) + 120
      );
    else
      return;
    end if;

    source := coalesce(v_reference->>'reference','routine_reference');
  end if;

  if v_minute is null then
    return;
  end if;

  v_center_local :=
    v_local_date::timestamp
    + make_interval(days => floor(v_minute / 1440.0)::integer)
    + make_interval(mins => ((v_minute % 1440) + 1440) % 1440);

  center_at := v_center_local at time zone v_site.timezone;
  window_start_at :=
    center_at - make_interval(mins => greatest(15,least(v_before,360)));
  window_end_at :=
    center_at + make_interval(mins => greatest(15,least(v_after,360)));
  return next;
end;
$$;

create or replace function private.monitoria_find_health_shift_v1(
  p_camera_id uuid,
  p_baseline_cutoff timestamptz,
  p_search_start timestamptz,
  p_search_end timestamptz
)
returns table(
  baseline_at timestamptz,
  shift_at timestamptz,
  confirm_at timestamptz,
  shift_score numeric,
  stability_score numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base public.camera_health_observations%rowtype;
  v_candidate public.camera_health_observations%rowtype;
  v_confirm public.camera_health_observations%rowtype;
  v_shift numeric;
  v_stability numeric;
begin
  select * into v_base
  from public.camera_health_observations observation
  where observation.camera_id = p_camera_id
    and observation.captured_at <= p_baseline_cutoff
    and observation.captured_at >= p_baseline_cutoff - interval '3 hours'
  order by observation.captured_at desc
  limit 1;

  if not found then
    return;
  end if;

  for v_candidate in
    select observation.*
    from public.camera_health_observations observation
    where observation.camera_id = p_camera_id
      and observation.captured_at > greatest(v_base.captured_at,p_search_start)
      and observation.captured_at <= p_search_end
    order by observation.captured_at
  loop
    v_shift := private.monitoria_health_change_score_v1(
      v_base.grid_signature,
      v_candidate.grid_signature,
      v_base.brightness_mean,
      v_candidate.brightness_mean,
      v_base.contrast_stddev,
      v_candidate.contrast_stddev,
      v_base.dark_pixel_ratio,
      v_candidate.dark_pixel_ratio,
      v_base.bright_pixel_ratio,
      v_candidate.bright_pixel_ratio
    );

    if v_shift < 0.16 then
      continue;
    end if;

    select * into v_confirm
    from public.camera_health_observations observation
    where observation.camera_id = p_camera_id
      and observation.captured_at > v_candidate.captured_at
      and observation.captured_at <=
        v_candidate.captured_at + interval '15 minutes'
    order by observation.captured_at
    limit 1;

    if not found then
      continue;
    end if;

    v_stability := private.monitoria_health_change_score_v1(
      v_candidate.grid_signature,
      v_confirm.grid_signature,
      v_candidate.brightness_mean,
      v_confirm.brightness_mean,
      v_candidate.contrast_stddev,
      v_confirm.contrast_stddev,
      v_candidate.dark_pixel_ratio,
      v_confirm.dark_pixel_ratio,
      v_candidate.bright_pixel_ratio,
      v_confirm.bright_pixel_ratio
    );

    if v_stability > 0.06 then
      continue;
    end if;

    baseline_at := v_base.captured_at;
    shift_at := v_candidate.captured_at;
    confirm_at := v_confirm.captured_at;
    shift_score := v_shift;
    stability_score := v_stability;
    return next;
    return;
  end loop;
end;
$$;

create or replace function private.monitoria_last_health_same_regime_v1(
  p_camera_id uuid,
  p_baseline_at timestamptz,
  p_before_at timestamptz
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base public.camera_health_observations%rowtype;
  v_result timestamptz;
begin
  select * into v_base
  from public.camera_health_observations observation
  where observation.camera_id = p_camera_id
    and observation.captured_at = p_baseline_at
  limit 1;

  if not found then
    return p_baseline_at;
  end if;

  select max(observation.captured_at)
  into v_result
  from public.camera_health_observations observation
  where observation.camera_id = p_camera_id
    and observation.captured_at >= p_baseline_at
    and observation.captured_at < p_before_at
    and private.monitoria_health_change_score_v1(
      v_base.grid_signature,
      observation.grid_signature,
      v_base.brightness_mean,
      observation.brightness_mean,
      v_base.contrast_stddev,
      observation.contrast_stddev,
      v_base.dark_pixel_ratio,
      observation.dark_pixel_ratio,
      v_base.bright_pixel_ratio,
      observation.bright_pixel_ratio
    ) < 0.08;

  return coalesce(v_result,p_baseline_at);
end;
$$;

-- Em local com 2+ câmeras online, a mudança global precisa aparecer em pelo
-- menos outra câmera. Em local de câmera única, a confirmação temporal da
-- própria câmera continua suficiente.
create or replace function private.monitoria_health_shift_corroborated_v1(
  p_site_id uuid,
  p_primary_camera_id uuid,
  p_primary_shift_at timestamptz
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_camera record;
  v_shift record;
  v_eligible integer := 0;
  v_confirmed integer := 0;
begin
  for v_camera in
    select camera.id
    from public.cameras camera
    where camera.site_id = p_site_id
      and camera.id <> p_primary_camera_id
      and camera.status = 'online'
      and exists (
        select 1
        from public.camera_health_observations observation
        where observation.camera_id = camera.id
          and observation.captured_at between
            p_primary_shift_at - interval '20 minutes'
            and p_primary_shift_at + interval '20 minutes'
      )
  loop
    v_eligible := v_eligible + 1;

    select * into v_shift
    from private.monitoria_find_health_shift_v1(
      v_camera.id,
      p_primary_shift_at - interval '10 minutes',
      p_primary_shift_at - interval '10 minutes',
      p_primary_shift_at + interval '12 minutes'
    )
    limit 1;

    if found
       and abs(
         extract(epoch from (v_shift.shift_at - p_primary_shift_at))
       ) <= 600 then
      v_confirmed := v_confirmed + 1;
    end if;
  end loop;

  return v_eligible = 0 or v_confirmed > 0;
end;
$$;

create or replace function private.monitoria_reconcile_operating_from_health_v1(
  p_site_id uuid,
  p_observed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marker record;
  v_open_session public.site_operating_sessions%rowtype;
  v_closed_session public.site_operating_sessions%rowtype;
  v_window record;
  v_shift record;
  v_anchor timestamptz;
  v_last_same_at timestamptz;
  v_estimated timestamptz;
  v_confidence numeric;
  v_local_date date;
  v_existing_same_day boolean;
  v_result jsonb := jsonb_build_object('changed',false);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_site_id::text,0));

  select
    entity.id as entity_id,
    entity.camera_id,
    entity.organization_id,
    camera.site_id,
    site.timezone
  into v_marker
  from public.camera_visual_entities entity
  join public.cameras camera on camera.id = entity.camera_id
  join public.camera_profiles profile
    on profile.id = entity.camera_profile_id
   and profile.is_active
  join public.sites site on site.id = camera.site_id
  where camera.site_id = p_site_id
    and entity.enabled
    and entity.primary_operational_marker
    and entity.entity_type = 'access_barrier'
    and private.monitoria_access_name_is_physical_v1(entity.name)
  order by
    coalesce((entity.metadata->>'auto_score')::integer,0) desc,
    entity.sort_order,
    entity.created_at
  limit 1;

  if not found then
    return v_result || jsonb_build_object(
      'reason','primary_marker_unavailable'
    );
  end if;

  select * into v_open_session
  from public.site_operating_sessions session
  where session.entity_id = v_marker.entity_id
    and session.status = 'open'
  order by session.first_open_observed_at desc
  limit 1
  for update;

  if found then
    select coalesce(
      (
        select max(observation.observed_at)
        from public.visual_state_observations observation
        where observation.entity_id = v_marker.entity_id
          and observation.observed_state = 'open'
          and observation.visibility = 'clear'
          and observation.confidence >= 0.70
          and observation.observed_at >=
            v_open_session.first_open_observed_at
      ),
      v_open_session.first_open_observed_at
    )
    into v_anchor;

    select * into v_window
    from private.monitoria_inference_window_v1(
      p_site_id,
      v_marker.camera_id,
      p_observed_at,
      'closing'
    )
    limit 1;

    if not found
       or p_observed_at < v_window.window_start_at
       or v_anchor > v_window.window_end_at then
      return v_result || jsonb_build_object(
        'reason','outside_closing_window'
      );
    end if;

    select * into v_shift
    from private.monitoria_find_health_shift_v1(
      v_marker.camera_id,
      v_anchor,
      greatest(v_anchor,v_window.window_start_at),
      least(p_observed_at,v_window.window_end_at)
    )
    limit 1;

    if not found then
      return v_result || jsonb_build_object(
        'reason','closing_shift_not_confirmed'
      );
    end if;

    if not private.monitoria_health_shift_corroborated_v1(
      p_site_id,
      v_marker.camera_id,
      v_shift.shift_at
    ) then
      return v_result || jsonb_build_object(
        'reason','closing_shift_not_corroborated'
      );
    end if;

    v_estimated := to_timestamp(
      (
        extract(epoch from v_anchor)
        + extract(epoch from v_shift.shift_at)
      ) / 2.0
    );

    v_confidence := least(
      0.97,
      0.78
      + least(0.14,v_shift.shift_score * 0.30)
      + greatest(0,0.05 - v_shift.stability_score)
    );

    update public.site_operating_sessions
    set status = 'closed',
        closed_at = v_estimated,
        closing_precision = 'estimated_interval',
        close_transition_id = null,
        closing_event_id = null,
        closing_window_start_at = v_anchor,
        closing_window_end_at = v_shift.shift_at,
        closing_inference_source = 'camera_health_regime_shift',
        closing_confidence = v_confidence,
        updated_at = now()
    where id = v_open_session.id;

    insert into public.operational_state_inferences (
      organization_id,
      site_id,
      camera_id,
      entity_id,
      session_id,
      direction,
      source,
      window_start_at,
      window_end_at,
      estimated_at,
      confidence,
      evidence
    ) values (
      v_marker.organization_id,
      p_site_id,
      v_marker.camera_id,
      v_marker.entity_id,
      v_open_session.id,
      'closing',
      'camera_health_regime_shift',
      v_anchor,
      v_shift.shift_at,
      v_estimated,
      v_confidence,
      jsonb_build_object(
        'baselineAt',v_shift.baseline_at,
        'shiftAt',v_shift.shift_at,
        'confirmedAt',v_shift.confirm_at,
        'shiftScore',v_shift.shift_score,
        'stabilityScore',v_shift.stability_score,
        'corroborated',true,
        'windowSource',v_window.source
      )
    )
    on conflict (session_id,direction)
      where session_id is not null
    do update set
      window_start_at = excluded.window_start_at,
      window_end_at = excluded.window_end_at,
      estimated_at = excluded.estimated_at,
      confidence = excluded.confidence,
      evidence = excluded.evidence;

    perform private.apply_live_routine_open_close_v2(
      v_marker.camera_id,
      p_observed_at
    );

    return jsonb_build_object(
      'changed',true,
      'direction','closing',
      'sessionId',v_open_session.id,
      'estimatedAt',v_estimated,
      'windowStartAt',v_anchor,
      'windowEndAt',v_shift.shift_at,
      'confidence',v_confidence
    );
  end if;

  select * into v_closed_session
  from public.site_operating_sessions session
  where session.entity_id = v_marker.entity_id
    and session.status = 'closed'
    and session.closed_at is not null
  order by session.closed_at desc
  limit 1;

  if not found then
    return v_result || jsonb_build_object(
      'reason','no_closed_reference'
    );
  end if;

  select * into v_window
  from private.monitoria_inference_window_v1(
    p_site_id,
    v_marker.camera_id,
    p_observed_at,
    'opening'
  )
  limit 1;

  if not found
     or p_observed_at < v_window.window_start_at
     or v_closed_session.closed_at >= v_window.window_end_at then
    return v_result || jsonb_build_object(
      'reason','outside_opening_window'
    );
  end if;

  v_local_date :=
    (p_observed_at at time zone v_marker.timezone)::date;

  select exists (
    select 1
    from public.site_operating_sessions session
    where session.entity_id = v_marker.entity_id
      and (
        session.first_open_observed_at
        at time zone v_marker.timezone
      )::date = v_local_date
  )
  into v_existing_same_day;

  if v_existing_same_day then
    return v_result || jsonb_build_object(
      'reason','opening_already_recorded'
    );
  end if;

  select * into v_shift
  from private.monitoria_find_health_shift_v1(
    v_marker.camera_id,
    v_window.window_start_at,
    v_window.window_start_at,
    least(p_observed_at,v_window.window_end_at)
  )
  limit 1;

  if not found then
    return v_result || jsonb_build_object(
      'reason','opening_shift_not_confirmed'
    );
  end if;

  if not private.monitoria_health_shift_corroborated_v1(
    p_site_id,
    v_marker.camera_id,
    v_shift.shift_at
  ) then
    return v_result || jsonb_build_object(
      'reason','opening_shift_not_corroborated'
    );
  end if;

  v_last_same_at :=
    private.monitoria_last_health_same_regime_v1(
      v_marker.camera_id,
      v_shift.baseline_at,
      v_shift.shift_at
    );

  v_estimated := to_timestamp(
    (
      extract(epoch from v_last_same_at)
      + extract(epoch from v_shift.shift_at)
    ) / 2.0
  );

  v_confidence := least(
    0.95,
    0.76
    + least(0.14,v_shift.shift_score * 0.30)
    + greatest(0,0.05 - v_shift.stability_score)
  );

  insert into public.site_operating_sessions (
    organization_id,
    site_id,
    camera_id,
    entity_id,
    status,
    opened_at,
    first_open_observed_at,
    closed_at,
    opening_precision,
    closing_precision,
    open_transition_id,
    close_transition_id,
    opening_event_id,
    closing_event_id,
    opening_window_start_at,
    opening_window_end_at,
    opening_inference_source,
    opening_confidence,
    updated_at
  ) values (
    v_marker.organization_id,
    p_site_id,
    v_marker.camera_id,
    v_marker.entity_id,
    'open',
    v_estimated,
    v_shift.shift_at,
    null,
    'estimated_interval',
    null,
    null,
    null,
    null,
    null,
    v_last_same_at,
    v_shift.shift_at,
    'camera_health_regime_shift',
    v_confidence,
    now()
  )
  returning * into v_open_session;

  insert into public.operational_state_inferences (
    organization_id,
    site_id,
    camera_id,
    entity_id,
    session_id,
    direction,
    source,
    window_start_at,
    window_end_at,
    estimated_at,
    confidence,
    evidence
  ) values (
    v_marker.organization_id,
    p_site_id,
    v_marker.camera_id,
    v_marker.entity_id,
    v_open_session.id,
    'opening',
    'camera_health_regime_shift',
    v_last_same_at,
    v_shift.shift_at,
    v_estimated,
    v_confidence,
    jsonb_build_object(
      'baselineAt',v_shift.baseline_at,
      'lastSameRegimeAt',v_last_same_at,
      'shiftAt',v_shift.shift_at,
      'confirmedAt',v_shift.confirm_at,
      'shiftScore',v_shift.shift_score,
      'stabilityScore',v_shift.stability_score,
      'corroborated',true,
      'windowSource',v_window.source
    )
  )
  on conflict (session_id,direction)
    where session_id is not null
  do nothing;

  perform private.apply_live_routine_open_close_v2(
    v_marker.camera_id,
    p_observed_at
  );

  return jsonb_build_object(
    'changed',true,
    'direction','opening',
    'sessionId',v_open_session.id,
    'estimatedAt',v_estimated,
    'windowStartAt',v_last_same_at,
    'windowEndAt',v_shift.shift_at,
    'confidence',v_confidence
  );
end;
$$;

create or replace function private.monitoria_health_operating_trigger_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform private.monitoria_reconcile_operating_from_health_v1(
      new.site_id,
      new.captured_at
    );
  exception
    when others then
      -- Nunca deixa a inteligência operacional quebrar a ingestão de saúde.
      null;
  end;
  return new;
end;
$$;

drop trigger if exists camera_health_observations_operating_inference_v1
  on public.camera_health_observations;
create trigger camera_health_observations_operating_inference_v1
after insert
on public.camera_health_observations
for each row
execute function private.monitoria_health_operating_trigger_v1();

-- Corrige perfis ativos existentes.
do $backfill$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select profile.id
    from public.camera_profiles profile
    join public.cameras camera
      on camera.id = profile.camera_id
    where profile.is_active
      and camera.visual_state_enabled
  loop
    perform private.monitoria_sync_operational_access_marker_v5(
      v_profile_id
    );
  end loop;
end;
$backfill$;

-- Remove apenas sessões que pertenciam a marcadores automáticos invalidados.
-- Observações visuais permanecem como histórico de auditoria.
delete from public.site_operating_sessions session
using public.camera_visual_entities entity
where session.entity_id = entity.id
  and not entity.enabled
  and entity.metadata->>'invalidatedBy' = 'operational_access_marker_v5';

create or replace function public.assistant_operating_hours_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  return jsonb_build_object(
    'from',p_from,
    'to',p_to,
    'sessions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',session.id,
          'siteId',session.site_id,
          'cameraId',session.camera_id,
          'entityId',session.entity_id,
          'status',session.status,
          'openedAt',session.opened_at,
          'firstOpenObservedAt',session.first_open_observed_at,
          'closedAt',session.closed_at,
          'openingPrecision',session.opening_precision,
          'closingPrecision',session.closing_precision,
          'openingEventId',session.opening_event_id,
          'closingEventId',session.closing_event_id,
          'openingWindowStartAt',session.opening_window_start_at,
          'openingWindowEndAt',session.opening_window_end_at,
          'closingWindowStartAt',session.closing_window_start_at,
          'closingWindowEndAt',session.closing_window_end_at,
          'openingInferenceSource',session.opening_inference_source,
          'closingInferenceSource',session.closing_inference_source,
          'openingConfidence',session.opening_confidence,
          'closingConfidence',session.closing_confidence,
          'openingDirectlyObserved',
            session.opening_precision = 'visible_transition',
          'closingDirectlyObserved',
            session.closing_precision = 'visible_transition',
          'openingTimingNote',
            case
              when session.opening_precision = 'estimated_interval' then
                'Horário aproximado: a transição não foi vista diretamente. Use openedAt como estimativa representativa e informe também a faixa openingWindowStartAt–openingWindowEndAt.'
              when session.opening_precision = 'observed_only' then
                'A câmera apenas confirmou que o local já estava aberto em firstOpenObservedAt; não trate esse instante como horário exato da abertura.'
              else
                'A abertura foi sustentada pelas observações visuais registradas.'
            end,
          'closingTimingNote',
            case
              when session.closing_precision = 'estimated_interval' then
                'Horário aproximado: a transição não foi vista diretamente. Use closedAt como estimativa representativa e informe também a faixa closingWindowStartAt–closingWindowEndAt.'
              when session.closing_precision is null then
                'O fechamento ainda não foi confirmado.'
              when session.closing_precision = 'visible_transition' then
                'A transição de fechamento foi vista diretamente.'
              else
                'O fechamento foi confirmado visualmente sem uma transição direta única.'
            end
        )
        order by session.first_open_observed_at
      )
      from public.site_operating_sessions session
      join public.camera_visual_entities entity
        on entity.id = session.entity_id
       and entity.enabled
       and entity.primary_operational_marker
       and entity.entity_type = 'access_barrier'
      where session.organization_id = p_organization_id
        and session.first_open_observed_at < p_to
        and coalesce(session.closed_at,p_to) >= p_from
        and (p_camera_id is null or session.camera_id = p_camera_id)
        and (p_site_id is null or session.site_id = p_site_id)
    ),'[]'::jsonb),
    'currentStates',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entityId',current_state.entity_id,
          'entityName',entity.name,
          'entityType',entity.entity_type,
          'cameraId',current_state.camera_id,
          'visualState',current_state.current_state,
          'state',current_state.current_state,
          'sinceAt',current_state.since_at,
          'lastObservedAt',current_state.last_observed_at,
          'confidence',current_state.confidence,
          'effectiveOperationalState',
            case
              when latest_session.status = 'closed'
                   and latest_session.closed_at is not null
                   and latest_session.closed_at > current_state.last_observed_at
                then 'closed_estimated'
              when latest_session.status = 'open'
                   and latest_session.opening_precision = 'estimated_interval'
                   and latest_session.opened_at is not null
                   and latest_session.opened_at > current_state.last_observed_at
                then 'open_estimated'
              else current_state.current_state
            end,
          'supersededByEstimatedSession',
            case
              when latest_session.status = 'closed'
                   and latest_session.closing_precision = 'estimated_interval'
                   and latest_session.closed_at > current_state.last_observed_at
                then true
              when latest_session.status = 'open'
                   and latest_session.opening_precision = 'estimated_interval'
                   and latest_session.opened_at > current_state.last_observed_at
                then true
              else false
            end
        )
        order by entity.sort_order,entity.name
      )
      from public.visual_entity_current_states current_state
      join public.camera_visual_entities entity
        on entity.id = current_state.entity_id
      left join lateral (
        select session.*
        from public.site_operating_sessions session
        where session.entity_id = current_state.entity_id
        order by session.first_open_observed_at desc
        limit 1
      ) latest_session on true
      where current_state.organization_id = p_organization_id
        and entity.enabled
        and entity.primary_operational_marker
        and (p_camera_id is null or current_state.camera_id = p_camera_id)
        and (p_site_id is null or current_state.site_id = p_site_id)
    ),'[]'::jsonb)
  );
end;
$$;

-- O resumo visual continua sendo evidência direta: entidades invalidadas deixam
-- de aparecer nas respostas futuras, mas seus registros seguem auditáveis.
create or replace function public.assistant_visual_state_summary(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_organization_id) then
    raise exception 'organization_access_denied';
  end if;

  return jsonb_build_object(
    'currentStates',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entityId',state.entity_id,
          'entityName',entity.name,
          'entityType',entity.entity_type,
          'cameraId',state.camera_id,
          'siteId',state.site_id,
          'state',state.current_state,
          'sinceAt',state.since_at,
          'lastObservedAt',state.last_observed_at,
          'confidence',state.confidence
        )
        order by entity.sort_order,entity.name
      )
      from public.visual_entity_current_states state
      join public.camera_visual_entities entity
        on entity.id = state.entity_id
      where state.organization_id = p_organization_id
        and entity.enabled
        and (p_camera_id is null or state.camera_id = p_camera_id)
        and (p_site_id is null or state.site_id = p_site_id)
    ),'[]'::jsonb),
    'transitions',
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',transition.id,
          'entityId',transition.entity_id,
          'entityName',entity.name,
          'entityType',entity.entity_type,
          'cameraId',transition.camera_id,
          'siteId',transition.site_id,
          'fromState',transition.from_state,
          'toState',transition.to_state,
          'occurredAt',transition.occurred_at,
          'confidence',transition.confidence,
          'transitionVisible',transition.transition_visible,
          'outsideDeclaredHours',transition.outside_declared_hours,
          'afterConfirmedClosing',transition.after_confirmed_closing,
          'eventId',transition.event_id
        )
        order by transition.occurred_at desc
      )
      from (
        select transition.*
        from public.visual_state_transitions transition
        join public.camera_visual_entities active_entity
          on active_entity.id = transition.entity_id
         and active_entity.enabled
        where transition.organization_id = p_organization_id
          and transition.occurred_at >= p_from
          and transition.occurred_at < p_to
          and (p_camera_id is null or transition.camera_id = p_camera_id)
          and (p_site_id is null or transition.site_id = p_site_id)
        order by transition.occurred_at desc
        limit 100
      ) transition
      join public.camera_visual_entities entity
        on entity.id = transition.entity_id
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.assistant_operating_hours_summary(
  uuid,timestamptz,timestamptz,uuid,uuid
) from public, anon;
grant execute on function public.assistant_operating_hours_summary(
  uuid,timestamptz,timestamptz,uuid,uuid
) to authenticated, service_role;

revoke all on function public.assistant_visual_state_summary(
  uuid,timestamptz,timestamptz,uuid,uuid
) from public, anon;
grant execute on function public.assistant_visual_state_summary(
  uuid,timestamptz,timestamptz,uuid,uuid
) to authenticated, service_role;

do $mcp_grants$
begin
  if exists (
    select 1 from pg_roles where rolname = 'monitoria_mcp_readonly'
  ) then
    grant execute on function public.assistant_operating_hours_summary(
      uuid,timestamptz,timestamptz,uuid,uuid
    ) to monitoria_mcp_readonly;
    grant execute on function public.assistant_visual_state_summary(
      uuid,timestamptz,timestamptz,uuid,uuid
    ) to monitoria_mcp_readonly;
  end if;
end;
$mcp_grants$;

revoke all on function private.monitoria_health_grid_distance_v1(jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function private.monitoria_health_change_score_v1(
  jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) from public, anon, authenticated;
revoke all on function private.monitoria_access_name_is_physical_v1(text)
  from public, anon, authenticated;
revoke all on function private.monitoria_sync_operational_access_marker_v5(uuid)
  from public, anon, authenticated;
revoke all on function private.monitoria_inference_window_v1(
  uuid,uuid,timestamptz,text
) from public, anon, authenticated;
revoke all on function private.monitoria_find_health_shift_v1(
  uuid,timestamptz,timestamptz,timestamptz
) from public, anon, authenticated;
revoke all on function private.monitoria_last_health_same_regime_v1(
  uuid,timestamptz,timestamptz
) from public, anon, authenticated;
revoke all on function private.monitoria_health_shift_corroborated_v1(
  uuid,uuid,timestamptz
) from public, anon, authenticated;
revoke all on function private.monitoria_reconcile_operating_from_health_v1(
  uuid,timestamptz
) from public, anon, authenticated;

grant execute on function private.monitoria_health_grid_distance_v1(jsonb,jsonb)
  to service_role;
grant execute on function private.monitoria_health_change_score_v1(
  jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric
) to service_role;
grant execute on function private.monitoria_access_name_is_physical_v1(text)
  to service_role;
grant execute on function private.monitoria_sync_operational_access_marker_v5(uuid)
  to service_role;
grant execute on function private.monitoria_inference_window_v1(
  uuid,uuid,timestamptz,text
) to service_role;
grant execute on function private.monitoria_find_health_shift_v1(
  uuid,timestamptz,timestamptz,timestamptz
) to service_role;
grant execute on function private.monitoria_last_health_same_regime_v1(
  uuid,timestamptz,timestamptz
) to service_role;
grant execute on function private.monitoria_health_shift_corroborated_v1(
  uuid,uuid,timestamptz
) to service_role;
grant execute on function private.monitoria_reconcile_operating_from_health_v1(
  uuid,timestamptz
) to service_role;

commit;
