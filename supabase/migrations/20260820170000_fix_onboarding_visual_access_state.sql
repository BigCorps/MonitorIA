-- MonitorIA — correção de estados visuais no onboarding/contexto.
--
-- Objetivos:
-- 1. Câmeras novas dos planos basic/standard/intensive já nascem com as
--    inteligências incluídas ativas (o trigger anterior rodava só em UPDATE).
-- 2. Ao aprovar um perfil, uma zona que represente explicitamente a principal
--    porta/portão/grade/cancela/barreira passa a alimentar automaticamente
--    camera_visual_entities como access_barrier.
-- 3. Perfis ativos existentes recebem o mesmo backfill sem refazer onboarding.
--
-- A correção é aditiva: não altera Agent, eventos, planos, zonas existentes,
-- frames, perfis já aprovados nem a API da Pesquisa IA.

begin;

-- -------------------------------------------------------------------
-- Parte 1 — inteligências incluídas também no INSERT da câmera.
-- -------------------------------------------------------------------

create or replace function private.apply_monitoria_included_intelligence_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.analysis_plan_code in ('basic', 'standard', 'intensive') then
    new.visual_state_enabled := true;
    new.short_memory_enabled := true;
    new.operational_sessions_enabled := true;
    new.routine_intelligence_enabled := true;
    new.process_intelligence_enabled := true;
    new.staff_profile_intelligence_enabled := true;
    new.health_intelligence_enabled := true;
    new.vehicle_memory_enabled := true;
  end if;

  return new;
end;
$$;

drop trigger if exists cameras_apply_included_intelligence
  on public.cameras;

create trigger cameras_apply_included_intelligence
before insert or update of analysis_plan_code
on public.cameras
for each row
execute function private.apply_monitoria_included_intelligence_v1();

-- Faz as câmeras existentes passarem uma vez pelo trigger corrigido.
-- O UPDATE mantém o mesmo plano; serve apenas para aplicar as inteligências
-- que deveriam ter sido ligadas na criação original.
update public.cameras
set analysis_plan_code = analysis_plan_code
where analysis_plan_code in ('basic', 'standard', 'intensive')
  and (
    not visual_state_enabled
    or not short_memory_enabled
    or not operational_sessions_enabled
    or not routine_intelligence_enabled
    or not process_intelligence_enabled
    or not staff_profile_intelligence_enabled
    or not health_intelligence_enabled
    or not vehicle_memory_enabled
  );

-- -------------------------------------------------------------------
-- Parte 2 — materializa a principal barreira de acesso do perfil.
-- -------------------------------------------------------------------

create or replace function private.monitoria_sync_primary_access_barrier_v1(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.camera_profiles%rowtype;
  v_visual_state_enabled boolean := false;
  v_existing_id uuid;
  v_existing_type text;
  v_zone record;
  v_entity_id uuid;
begin
  select *
    into v_profile
  from public.camera_profiles cp
  where cp.id = p_profile_id;

  if not found or not v_profile.is_active then
    return null;
  end if;

  select c.visual_state_enabled
    into v_visual_state_enabled
  from public.cameras c
  where c.id = v_profile.camera_id
    and c.organization_id = v_profile.organization_id;

  if not coalesce(v_visual_state_enabled, false) then
    return null;
  end if;

  -- Se já existe um marcador operacional configurado manualmente ou por uma
  -- execução anterior, ele é preservado integralmente.
  select e.id
    into v_existing_id
  from public.camera_visual_entities e
  where e.organization_id = v_profile.organization_id
    and e.camera_id = v_profile.camera_id
    and e.camera_profile_id = v_profile.id
    and e.enabled
    and e.primary_operational_marker
  order by e.sort_order, e.created_at
  limit 1;

  if found then
    return v_existing_id;
  end if;

  -- Seleciona UMA barreira principal. O nome da zona tem prioridade sobre a
  -- descrição, evitando transformar "área próxima ao portão" em entidade
  -- quando também existe a zona específica do próprio portão.
  select
    z.id,
    z.name,
    z.zone_type,
    z.description,
    z.polygon,
    z.sort_order
  into v_zone
  from public.camera_zones z
  where z.organization_id = v_profile.organization_id
    and z.camera_profile_id = v_profile.id
    and (
      lower(coalesce(z.name, '')) ~
        '(^|[^[:alpha:]])(portão|portao|porta|grade|cancela|barreira|persiana)([^[:alpha:]]|$)'
      or (
        z.zone_type in ('entry', 'exit', 'restricted')
        and lower(coalesce(z.description, '')) ~
          '(^|[^[:alpha:]])(portão|portao|porta|grade|cancela|barreira|persiana)([^[:alpha:]]|$)'
      )
    )
  order by
    case
      when lower(coalesce(z.name, '')) ~
        '(^|[^[:alpha:]])(portão|portao|porta|cancela|barreira|persiana)([^[:alpha:]]|$)'
        then 0
      when lower(coalesce(z.name, '')) ~
        '(^|[^[:alpha:]])grade([^[:alpha:]]|$)'
        then 1
      else 2
    end,
    case
      when z.zone_type = 'restricted' then 0
      when z.zone_type in ('entry', 'exit') then 1
      else 2
    end,
    z.sort_order,
    z.id
  limit 1;

  if not found then
    return null;
  end if;

  -- Se alguém já criou uma entidade com o mesmo nome, não duplica.
  -- Caso ela já seja access_barrier, e ainda não exista marcador principal,
  -- apenas a promove ao papel operacional esperado.
  select e.id, e.entity_type
    into v_existing_id, v_existing_type
  from public.camera_visual_entities e
  where e.camera_profile_id = v_profile.id
    and lower(e.name) = lower(left(trim(v_zone.name), 120))
    and e.enabled
  limit 1;

  if found then
    if v_existing_type = 'access_barrier' then
      update public.camera_visual_entities
      set primary_operational_marker = true,
          updated_at = now()
      where id = v_existing_id;
    end if;

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
    left(trim(v_zone.name), 120),
    'access_barrier',
    v_zone.polygon,
    jsonb_build_array(
      jsonb_build_object(
        'state', 'closed',
        'description',
        'A barreira está visualmente fechada e bloqueia o acesso observado.'
      ),
      jsonb_build_object(
        'state', 'partially_open',
        'description',
        'A barreira está parcialmente aberta; ainda não há abertura completa.'
      ),
      jsonb_build_object(
        'state', 'open',
        'description',
        'A barreira está visualmente aberta e permite passagem pelo acesso observado.'
      )
    ),
    true,
    0.780,
    'medium',
    true,
    coalesce(v_zone.sort_order, 0),
    jsonb_build_object(
      'source', 'profile_zone_auto_access_barrier_v1',
      'zone_id', v_zone.id,
      'profile_version', v_profile.version,
      'generated_from', 'approved_camera_profile'
    ),
    v_profile.reviewed_by,
    coalesce(v_profile.reviewed_at, now())
  )
  returning id into v_entity_id;

  return v_entity_id;
end;
$$;

revoke all on function
  private.monitoria_sync_primary_access_barrier_v1(uuid)
from public, anon, authenticated;

-- -------------------------------------------------------------------
-- Parte 3 — perfil aprovado passa a sincronizar a entidade automaticamente.
-- Mantém a mesma assinatura e o mesmo retorno já usados pelo frontend.
-- -------------------------------------------------------------------

create or replace function public.activate_camera_profile(
  p_organization_id uuid,
  p_profile_id uuid,
  p_reviewed_by uuid
)
returns table(
  camera_id uuid,
  active_profile_id uuid,
  active_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.camera_profiles%rowtype;
begin
  select *
    into v_profile
  from public.camera_profiles cp
  where cp.id = p_profile_id
    and cp.organization_id = p_organization_id;

  if not found then
    raise exception 'profile_not_found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_profile.camera_id::text, 0)
  );

  update public.camera_profiles
  set is_active = false,
      updated_at = now()
  where camera_profiles.camera_id = v_profile.camera_id
    and camera_profiles.organization_id = p_organization_id
    and camera_profiles.is_active;

  update public.camera_profiles
  set is_active = true,
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      updated_at = now()
  where id = p_profile_id;

  update public.cameras
  set description = v_profile.environment_description,
      monitoring_goals = v_profile.monitoring_goals,
      updated_at = now()
  where id = v_profile.camera_id
    and organization_id = p_organization_id;

  perform private.monitoria_sync_primary_access_barrier_v1(
    p_profile_id
  );

  return query
  select
    v_profile.camera_id,
    p_profile_id,
    v_profile.version;
end;
$$;

revoke all on function
  public.activate_camera_profile(uuid, uuid, uuid)
from public, anon, authenticated;

grant execute on function
  public.activate_camera_profile(uuid, uuid, uuid)
to service_role;

-- -------------------------------------------------------------------
-- Parte 4 — backfill dos perfis ativos já aprovados.
-- Não recria perfis, não altera zonas e não apaga entidades existentes.
-- -------------------------------------------------------------------

do $backfill$
declare
  v_profile_id uuid;
begin
  for v_profile_id in
    select cp.id
    from public.camera_profiles cp
    join public.cameras c
      on c.id = cp.camera_id
     and c.organization_id = cp.organization_id
    where cp.is_active
      and c.visual_state_enabled
  loop
    perform private.monitoria_sync_primary_access_barrier_v1(
      v_profile_id
    );
  end loop;
end;
$backfill$;

commit;
