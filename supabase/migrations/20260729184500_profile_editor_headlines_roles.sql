-- MonitorIA v0.8.1
-- Backend aplicado em produção via MCP.
-- Mantido no repositório para reprodutibilidade.

alter table public.camera_zones
  add column if not exists person_role_hint text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'camera_zones_person_role_hint_check'
  ) then
    alter table public.camera_zones
      add constraint camera_zones_person_role_hint_check
      check (
        person_role_hint = any (
          array[
            'none'::text,
            'staff'::text,
            'customer'::text,
            'delivery_person'::text,
            'visitor'::text,
            'shared'::text
          ]
        )
      );
  end if;
end
$$;

update public.camera_zones
set person_role_hint = case
  when lower(name) like '%prateleira%'
    then 'none'
  when lower(name) like '%terminal%'
    or lower(description) like '%atrás do balcão%'
    then 'staff'
  when zone_type = 'entry'
    then 'customer'
  when lower(name) like '%balcão%'
    then 'shared'
  else person_role_hint
end
where person_role_hint = 'none';

alter table public.events
  add column if not exists headline text not null default '';

alter table public.event_people
  add column if not exists role text not null default 'unknown',
  add column if not exists role_confidence numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'event_people_role_check'
  ) then
    alter table public.event_people
      add constraint event_people_role_check
      check (
        role = any (
          array[
            'staff'::text,
            'customer'::text,
            'delivery_person'::text,
            'visitor'::text,
            'unknown'::text
          ]
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'event_people_role_confidence_check'
  ) then
    alter table public.event_people
      add constraint event_people_role_confidence_check
      check (role_confidence between 0 and 1);
  end if;
end
$$;

create or replace function private.monitoria_event_headline(
  p_payload jsonb,
  p_primary_type text,
  p_summary text,
  p_tags text[]
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_supplied text :=
    pg_catalog.btrim(coalesce(p_payload->>'headline', ''));
  v_summary text :=
    pg_catalog.btrim(coalesce(p_summary, ''));
  v_tags text :=
    lower(coalesce(pg_catalog.array_to_string(p_tags, ' '), ''));
begin
  if char_length(v_supplied) between 3 and 120 then
    return pg_catalog.left(v_supplied, 120);
  end if;

  if v_tags ~ '(object_removed|objeto_removido|retirada)' then
    return 'Objeto retirado do balcão';
  elsif v_tags ~ '(package_handled|entrega|pacote|caixa)' then
    return 'Atendimento com pacote no balcão';
  elsif v_tags ~ '(object_moved|objects_moved|documents_moved|objeto)' then
    return 'Objeto movimentado no balcão';
  elsif v_tags ~ '(gate_activity|exit_through_gate|portão|portao)' then
    return 'Movimentação na entrada ou portão';
  elsif v_tags ~ '(terminal_interaction|terminal_activity|interaction_terminal)' then
    return 'Atividade no terminal de atendimento';
  elsif v_tags ~ '(counter_interaction|customer_interaction|interaction_at_counter|balcão|balcao)' then
    return 'Atendimento no balcão';
  end if;

  return case coalesce(p_primary_type, '')
    when 'person_entered' then 'Pessoa entrou na área monitorada'
    when 'person_exited' then 'Pessoa saiu da área monitorada'
    when 'vehicle_entered' then 'Veículo chegou à entrada'
    when 'vehicle_exited' then 'Veículo deixou a entrada'
    when 'vehicle_stopped' then 'Veículo parou próximo à entrada'
    when 'vehicle_present' then 'Veículo presente na entrada'
    when 'object_appeared' then 'Objeto colocado na área monitorada'
    when 'object_removed' then 'Objeto retirado da área monitorada'
    when 'object_moved' then 'Objeto movimentado na área monitorada'
    when 'zone_intrusion' then 'Entrada em área restrita'
    when 'unusual_activity' then 'Atividade incomum detectada'
    when 'scene_change' then 'Mudança relevante no ambiente'
    when 'person_present' then
      case
        when v_summary ilike '%balcão%'
          or v_summary ilike '%balcao%'
          then 'Interação de pessoas no balcão'
        when v_summary ilike '%entrada%'
          or v_summary ilike '%portão%'
          or v_summary ilike '%portao%'
          then 'Movimentação de pessoas na entrada'
        else 'Pessoas presentes na área monitorada'
      end
    else 'Acontecimento registrado pela câmera'
  end;
end;
$$;

create or replace function private.refresh_monitoria_event_headline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.headline := private.monitoria_event_headline(
    new.analyzed_payload,
    new.primary_event_type,
    new.summary,
    new.tags
  );
  return new;
end;
$$;

drop trigger if exists events_refresh_headline on public.events;

create trigger events_refresh_headline
before insert or update of
  analyzed_payload,
  primary_event_type,
  summary,
  tags
on public.events
for each row
execute function private.refresh_monitoria_event_headline();

update public.events
set headline = private.monitoria_event_headline(
  analyzed_payload,
  primary_event_type,
  summary,
  tags
);

create or replace function private.populate_monitoria_person_role()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_raw_track text;
  v_person jsonb;
begin
  v_raw_track := pg_catalog.regexp_replace(
    coalesce(new.local_track_id, ''),
    '^.*:',
    ''
  );

  select person.value
    into v_person
  from public.events event
  cross join lateral pg_catalog.jsonb_array_elements(
    coalesce(event.analyzed_payload->'people', '[]'::jsonb)
  ) person(value)
  where event.id = new.event_id
    and coalesce(person.value->>'localTrackId', '') = v_raw_track
  limit 1;

  if v_person is not null then
    new.role := case
      when v_person->>'role' = any (
        array[
          'staff'::text,
          'customer'::text,
          'delivery_person'::text,
          'visitor'::text,
          'unknown'::text
        ]
      ) then v_person->>'role'
      else 'unknown'
    end;

    new.role_confidence := greatest(
      0,
      least(
        1,
        coalesce((v_person->>'roleConfidence')::numeric, 0)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists event_people_populate_role
  on public.event_people;

create trigger event_people_populate_role
before insert on public.event_people
for each row
execute function private.populate_monitoria_person_role();

create or replace function public.create_camera_profile_draft(
  p_organization_id uuid,
  p_camera_id uuid,
  p_source_asset_id uuid,
  p_environment_description text,
  p_monitoring_goals jsonb,
  p_ignore_instructions jsonb,
  p_zones jsonb,
  p_provider text,
  p_model text,
  p_response_id text,
  p_profile_metadata jsonb,
  p_created_by uuid
)
returns table(profile_id uuid, profile_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_version integer;
  v_zone jsonb;
  v_role_hint text;
begin
  if not exists (
    select 1
    from public.cameras c
    where c.id = p_camera_id
      and c.organization_id = p_organization_id
  ) then
    raise exception 'camera_not_found';
  end if;

  if not exists (
    select 1
    from public.storage_assets asset
    where asset.id = p_source_asset_id
      and asset.organization_id = p_organization_id
      and asset.camera_id = p_camera_id
      and asset.status = 'ready'::public.asset_status
      and asset.deleted_at is null
  ) then
    raise exception 'source_asset_not_found';
  end if;

  if jsonb_typeof(p_monitoring_goals) <> 'array'
     or jsonb_typeof(p_ignore_instructions) <> 'array'
     or jsonb_typeof(p_zones) <> 'array'
     or jsonb_typeof(p_profile_metadata) <> 'object' then
    raise exception 'invalid_profile_payload';
  end if;

  perform pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_camera_id::text, 0)
  );

  select coalesce(max(profile.version), 0) + 1
    into v_version
  from public.camera_profiles profile
  where profile.camera_id = p_camera_id;

  insert into public.camera_profiles (
    organization_id,
    camera_id,
    version,
    environment_description,
    monitoring_goals,
    ignore_instructions,
    is_active,
    created_by,
    source_asset_id,
    provider,
    model,
    response_id,
    profile_metadata,
    updated_at
  ) values (
    p_organization_id,
    p_camera_id,
    v_version,
    pg_catalog.left(
      pg_catalog.btrim(p_environment_description),
      2000
    ),
    p_monitoring_goals,
    p_ignore_instructions,
    false,
    p_created_by,
    p_source_asset_id,
    nullif(pg_catalog.btrim(p_provider), ''),
    nullif(pg_catalog.btrim(p_model), ''),
    nullif(pg_catalog.btrim(p_response_id), ''),
    p_profile_metadata,
    now()
  )
  returning id into v_profile_id;

  for v_zone in
    select value
    from pg_catalog.jsonb_array_elements(p_zones)
  loop
    if jsonb_typeof(v_zone) <> 'object'
       or jsonb_typeof(v_zone->'polygon') <> 'array' then
      raise exception 'invalid_zone_payload';
    end if;

    v_role_hint := coalesce(
      v_zone->>'personRoleHint',
      'none'
    );

    if not (
      v_role_hint = any (
        array[
          'none'::text,
          'staff'::text,
          'customer'::text,
          'delivery_person'::text,
          'visitor'::text,
          'shared'::text
        ]
      )
    ) then
      v_role_hint := 'none';
    end if;

    insert into public.camera_zones (
      organization_id,
      camera_profile_id,
      name,
      zone_type,
      polygon,
      description,
      sort_order,
      person_role_hint
    ) values (
      p_organization_id,
      v_profile_id,
      pg_catalog.left(
        pg_catalog.btrim(v_zone->>'name'),
        100
      ),
      v_zone->>'type',
      v_zone->'polygon',
      pg_catalog.left(
        coalesce(
          pg_catalog.btrim(v_zone->>'description'),
          ''
        ),
        500
      ),
      coalesce((v_zone->>'sortOrder')::integer, 0),
      v_role_hint
    );
  end loop;

  return query
  select v_profile_id, v_version;
end;
$$;

revoke all on function public.create_camera_profile_draft(
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  jsonb,
  uuid
) from public, anon, authenticated;

grant execute on function public.create_camera_profile_draft(
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  text,
  text,
  text,
  jsonb,
  uuid
) to service_role;

create index if not exists event_people_role_event_idx
  on public.event_people(event_id, role);
