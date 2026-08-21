-- MonitorIA — Hotfix fechamento + continuidade do marcador visual
-- Base investigada: main c89c061086814b61287e623296ec4c63226e74d5
--
-- Problema:
-- camera_visual_entities estava ligada à versão antiga do camera_profile.
-- Ao aprovar uma nova versão sem uma zona cujo nome ainda dissesse
-- porta/portão/grade, o marcador primário não era recriado e stateObservations
-- passava a chegar vazio.
--
-- Correção:
-- 1. preserva o marcador já configurado no perfil atual;
-- 2. se ele sumiu na troca de versão, move o MESMO entity_id para o perfil
--    ativo, preservando visual_entity_current_states e todo o histórico;
-- 3. só usa inferência por nome de zona quando a câmera nunca teve marcador.
--
-- Não cria nem inventa um fechamento passado. O estado perdido precisa de uma
-- nova observação visual para voltar a ser confirmado.

begin;

create or replace function private.monitoria_sync_primary_access_barrier_v1(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile public.camera_profiles%rowtype;
  v_visual_state_enabled boolean := false;
  v_existing_id uuid;
  v_existing_type text;
  v_previous_id uuid;
  v_previous_profile_id uuid;
  v_previous_name text;
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

  -- 1. Perfil atual já possui marcador primário: nada a fazer.
  select e.id
  into v_existing_id
  from public.camera_visual_entities e
  where e.organization_id = v_profile.organization_id
    and e.camera_id = v_profile.camera_id
    and e.camera_profile_id = v_profile.id
    and e.enabled
    and e.primary_operational_marker
    and e.entity_type = 'access_barrier'
  order by e.sort_order, e.created_at
  limit 1;

  if found then
    return v_existing_id;
  end if;

  -- 2. Se existe uma access_barrier no perfil atual, promove-a antes de
  -- procurar versões anteriores.
  select e.id
  into v_existing_id
  from public.camera_visual_entities e
  where e.organization_id = v_profile.organization_id
    and e.camera_id = v_profile.camera_id
    and e.camera_profile_id = v_profile.id
    and e.enabled
    and e.entity_type = 'access_barrier'
  order by e.sort_order, e.created_at
  limit 1;

  if found then
    update public.camera_visual_entities
    set primary_operational_marker = true,
        updated_at = now()
    where id = v_existing_id;

    return v_existing_id;
  end if;

  -- 3. Continuidade entre versões: um marcador aprovado da mesma câmera é
  -- uma configuração operacional persistente. Renomear zonas não significa
  -- apagar o portão/porta que já foi aprovado.
  select
    e.id,
    e.camera_profile_id,
    e.name
  into
    v_previous_id,
    v_previous_profile_id,
    v_previous_name
  from public.camera_visual_entities e
  join public.camera_profiles previous_profile
    on previous_profile.id = e.camera_profile_id
  where e.organization_id = v_profile.organization_id
    and e.camera_id = v_profile.camera_id
    and e.camera_profile_id <> v_profile.id
    and e.enabled
    and e.primary_operational_marker
    and e.entity_type = 'access_barrier'
  order by
    previous_profile.version desc,
    e.updated_at desc,
    e.created_at desc
  limit 1;

  if found then
    -- Se por algum motivo o novo perfil já possui uma entidade com o mesmo
    -- nome, só a promove quando ela também é uma barreira.
    select e.id, e.entity_type
    into v_existing_id, v_existing_type
    from public.camera_visual_entities e
    where e.camera_profile_id = v_profile.id
      and lower(e.name) = lower(v_previous_name)
      and e.enabled
    limit 1;

    if found and v_existing_type = 'access_barrier' then
      update public.camera_visual_entities
      set primary_operational_marker = true,
          updated_at = now()
      where id = v_existing_id;

      -- Transfere a fotografia atual para a entidade do novo perfil.
      insert into public.visual_entity_current_states (
        entity_id,
        organization_id,
        site_id,
        camera_id,
        current_state,
        since_at,
        last_observed_at,
        confidence,
        source_observation_id,
        source_event_id,
        transition_was_visible,
        updated_at
      )
      select
        v_existing_id,
        state.organization_id,
        state.site_id,
        state.camera_id,
        state.current_state,
        state.since_at,
        state.last_observed_at,
        state.confidence,
        null,
        state.source_event_id,
        state.transition_was_visible,
        now()
      from public.visual_entity_current_states state
      where state.entity_id = v_previous_id
      on conflict (entity_id) do update
      set current_state = excluded.current_state,
          since_at = excluded.since_at,
          last_observed_at = excluded.last_observed_at,
          confidence = excluded.confidence,
          source_observation_id = null,
          source_event_id = excluded.source_event_id,
          transition_was_visible = excluded.transition_was_visible,
          updated_at = now();

      update public.camera_visual_entities
      set enabled = false,
          primary_operational_marker = false,
          metadata = coalesce(metadata, '{}'::jsonb)
            || jsonb_build_object(
              'supersededByEntityId', v_existing_id,
              'supersededAt', now(),
              'reason', 'profile_version_continuity'
            ),
          updated_at = now()
      where id = v_previous_id;

      return v_existing_id;
    elsif not found then
      -- Caminho preferencial: mantém o MESMO entity_id. Todas as observações,
      -- transições e o estado atual continuam apontando para a mesma entidade.
      update public.camera_visual_entities
      set camera_profile_id = v_profile.id,
          metadata =
            (coalesce(metadata, '{}'::jsonb) - 'zone_id')
            || jsonb_build_object(
              'source', 'profile_primary_marker_continuity_v2',
              'inheritedFromProfileId', v_previous_profile_id,
              'profile_version', v_profile.version,
              'reboundAt', now()
            ),
          updated_at = now()
      where id = v_previous_id;

      return v_previous_id;
    end if;
  end if;

  -- 4. Fallback legado: só para câmera que ainda não possui marcador.
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
      'source', 'profile_zone_auto_access_barrier_v2',
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
$function$;

revoke all on function private.monitoria_sync_primary_access_barrier_v1(uuid)
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_sync_primary_access_barrier_v1(uuid)
  to service_role;

-- Repara imediatamente os perfis atualmente ativos.
do $repair$
declare
  v_profile record;
begin
  for v_profile in
    select profile.id
    from public.camera_profiles profile
    join public.cameras camera
      on camera.id = profile.camera_id
     and camera.organization_id = profile.organization_id
    where profile.is_active = true
      and camera.visual_state_enabled = true
    order by profile.created_at
  loop
    perform private.monitoria_sync_primary_access_barrier_v1(
      v_profile.id
    );
  end loop;
end;
$repair$;

commit;
