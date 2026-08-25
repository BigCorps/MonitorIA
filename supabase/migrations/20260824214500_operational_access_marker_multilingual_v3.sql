begin;

-- MonitorIA — marcador operacional de abertura/fechamento v3
-- Mantém o fluxo atual intacto e acrescenta um fallback semântico/multilíngue
-- quando o sincronizador legado não reconhece o nome da zona.

create or replace function private.monitoria_operational_access_zone_score_v3(
  p_name text,
  p_description text,
  p_zone_type text
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_name text := lower(coalesce(p_name, ''));
  v_description text := lower(coalesce(p_description, ''));
  v_score integer := 0;
begin
  -- Elemento físico que realmente pode abrir/fechar.
  if v_name ~ '(^|[^[:alpha:]])(porta|port[aã]o|grade|cancela|barreira|persiana|cortina|door|doorway|gate|roller|shutter|barrier)([^[:alpha:]]|$)' then
    v_score := v_score + 10;
  end if;

  if v_description ~ '(^|[^[:alpha:]])(porta|port[aã]o|grade|cancela|barreira|persiana|cortina|door|doorway|gate|roller|shutter|barrier)([^[:alpha:]]|$)' then
    v_score := v_score + 5;
  end if;

  -- Área de acesso ajuda na pontuação, mas não basta sozinha para virar
  -- marcador de funcionamento.
  if v_name ~ '(^|[^[:alpha:]])(entrada|acesso|abertura|entry|entrance|access|opening)([^[:alpha:]]|$)' then
    v_score := v_score + 4;
  end if;

  if v_description ~ '(^|[^[:alpha:]])(entrada|acesso|abertura|entry|entrance|access|opening)([^[:alpha:]]|$)' then
    v_score := v_score + 2;
  end if;

  -- Descrição explícita de abrir/fechar é evidência forte de que a zona cobre
  -- a própria barreira e não só o espaço diante dela.
  if v_description ~ '(^|[^[:alpha:]])(abre|abrir|aberto|aberta|fecha|fechar|fechado|fechada|open|opened|opens|close|closed|closes|opening|closing)([^[:alpha:]]|$)' then
    v_score := v_score + 6;
  end if;

  if lower(coalesce(p_zone_type, '')) in ('entry', 'exit', 'restricted') then
    v_score := v_score + 2;
  end if;

  -- Reduz falsos positivos em áreas de espera/visitantes.
  if v_name ~ '(visitor|visitante|espera|waiting|front.counter|frente.do.balc)' then
    v_score := v_score - 4;
  end if;

  return v_score;
end;
$$;

revoke all on function private.monitoria_operational_access_zone_score_v3(text,text,text)
  from public, anon, authenticated;
grant execute on function private.monitoria_operational_access_zone_score_v3(text,text,text)
  to service_role;

create or replace function private.monitoria_sync_primary_access_barrier_v3(
  p_profile_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.camera_profiles%rowtype;
  v_existing_id uuid;
  v_zone record;
  v_entity_id uuid;
begin
  select cp.*
  into v_profile
  from public.camera_profiles cp
  where cp.id = p_profile_id;

  if not found or not v_profile.is_active then
    return null;
  end if;

  if not exists (
    select 1
    from public.cameras c
    where c.id = v_profile.camera_id
      and c.organization_id = v_profile.organization_id
      and c.visual_state_enabled
  ) then
    return null;
  end if;

  -- Primeiro reaproveita integralmente o sincronizador atual. Ele já cuida de
  -- continuidade entre versões, perfis antigos e marcadores existentes.
  v_existing_id := private.monitoria_sync_primary_access_barrier_v1(p_profile_id);
  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- Se algum caminho paralelo já materializou o marcador, não duplica.
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

  -- Seleciona somente zona com evidência forte. O limiar 10 permite
  -- "porta principal" ou "doorway_roller_gate", mas rejeita uma simples
  -- "área de entrada" sem barreira física.
  select
    z.id,
    z.name,
    z.zone_type,
    z.description,
    z.polygon,
    z.sort_order,
    private.monitoria_operational_access_zone_score_v3(
      z.name,
      z.description,
      z.zone_type
    ) as score
  into v_zone
  from public.camera_zones z
  where z.organization_id = v_profile.organization_id
    and z.camera_profile_id = v_profile.id
    and z.zone_type <> 'ignore'
  order by score desc, z.sort_order, z.id
  limit 1;

  if not found or coalesce(v_zone.score, 0) < 10 then
    return null;
  end if;

  -- Um nome idêntico de entidade visual não pode ser sobrescrito de maneira
  -- silenciosa. Se já for access_barrier, apenas promove; se for outro tipo,
  -- não inventa uma segunda interpretação.
  select e.id
  into v_existing_id
  from public.camera_visual_entities e
  where e.camera_profile_id = v_profile.id
    and lower(e.name) = lower(left(trim(v_zone.name), 120))
    and e.enabled
    and e.entity_type = 'access_barrier'
  limit 1;

  if found then
    update public.camera_visual_entities
    set primary_operational_marker = true,
        updated_at = now()
    where id = v_existing_id;
    return v_existing_id;
  end if;

  if exists (
    select 1
    from public.camera_visual_entities e
    where e.camera_profile_id = v_profile.id
      and lower(e.name) = lower(left(trim(v_zone.name), 120))
      and e.enabled
  ) then
    return null;
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
        'description', 'A barreira está visualmente fechada e bloqueia o acesso observado.'
      ),
      jsonb_build_object(
        'state', 'partially_open',
        'description', 'A barreira está parcialmente aberta; ainda não há abertura completa.'
      ),
      jsonb_build_object(
        'state', 'open',
        'description', 'A barreira está visualmente aberta e permite passagem pelo acesso observado.'
      )
    ),
    true,
    0.780,
    'medium',
    true,
    coalesce(v_zone.sort_order, 0),
    jsonb_build_object(
      'source', 'profile_zone_auto_access_barrier_v3',
      'zone_id', v_zone.id,
      'profile_version', v_profile.version,
      'auto_score', v_zone.score,
      'generated_from', 'approved_camera_profile'
    ),
    v_profile.reviewed_by,
    coalesce(v_profile.reviewed_at, now())
  )
  returning id into v_entity_id;

  return v_entity_id;
end;
$$;

revoke all on function private.monitoria_sync_primary_access_barrier_v3(uuid)
  from public, anon, authenticated;
grant execute on function private.monitoria_sync_primary_access_barrier_v3(uuid)
  to service_role;

-- Garante que qualquer aprovação futura passe pelo fallback v3 sem alterar o
-- contrato existente de activate_camera_profile.
create or replace function private.monitoria_sync_primary_access_barrier_trigger_v3()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active and (tg_op = 'INSERT' or not coalesce(old.is_active, false)) then
    perform private.monitoria_sync_primary_access_barrier_v3(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists camera_profiles_sync_operational_access_v3
  on public.camera_profiles;
create trigger camera_profiles_sync_operational_access_v3
after insert or update of is_active
on public.camera_profiles
for each row
execute function private.monitoria_sync_primary_access_barrier_trigger_v3();

-- Autoteste da classificação antes do backfill.
do $assertions$
begin
  if private.monitoria_operational_access_zone_score_v3(
    'doorway_roller_gate',
    'The visible doorway/roller gate element that opens to the exterior; monitor its open/closed state.',
    'service'
  ) < 10 then
    raise exception 'operational_access_v3_failed_to_recognize_english_gate';
  end if;

  if private.monitoria_operational_access_zone_score_v3(
    'Abertura do balcão / limite de acesso',
    'Faixa diante da janela que marca o limite visual entre interior e via pública.',
    'entry'
  ) >= 10 then
    raise exception 'operational_access_v3_false_positive_generic_entry';
  end if;
end;
$assertions$;

-- Repara perfis ativos existentes. Não cria abertura/fechamento retroativo:
-- somente prepara os próximos acontecimentos visuais.
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
    order by cp.created_at
  loop
    perform private.monitoria_sync_primary_access_barrier_v3(v_profile_id);
  end loop;
end;
$backfill$;

commit;
