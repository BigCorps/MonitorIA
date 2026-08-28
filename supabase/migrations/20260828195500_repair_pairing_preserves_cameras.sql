-- MonitorIA 1.0.3 RC — reparo/troca de computador
--
-- O pareamento por local precisa substituir o Agent sem criar novas câmeras.
-- O novo Agent nasce sem RTSP no servidor (credenciais continuam locais), então
-- as câmeras antigas são colocadas novamente em "pairing". A descoberta validada
-- do onboarding as reencontra e /api/agent/cameras/discovered reutiliza esses IDs,
-- preservando histórico, perfil, zonas, plano e acontecimentos.

create or replace function public.consume_agent_pairing_code(
  p_code_hash text,
  p_agent_name text,
  p_agent_token_hash text,
  p_platform text default null,
  p_architecture text default null,
  p_version text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns table(
  agent_id uuid,
  organization_id uuid,
  site_id uuid,
  camera_id uuid,
  camera_name text,
  analysis_plan_code text,
  capture_interval_seconds numeric,
  consolidation_interval_seconds integer,
  motion_start_threshold numeric,
  motion_continue_threshold numeric,
  event_close_after_seconds integer,
  monitoring_goals jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_pairing public.agent_pairing_codes%rowtype;
  v_agent_id uuid;
  v_camera public.cameras%rowtype;
  v_previous_agent_ids uuid[] := array[]::uuid[];
  v_previous_camera_ids uuid[] := array[]::uuid[];
begin
  select pc.* into v_pairing
  from public.agent_pairing_codes pc
  where pc.code_hash = p_code_hash
    and pc.used_at is null
    and pc.revoked_at is null
    and pc.expires_at > now()
  for update;

  if v_pairing.id is null then
    raise exception 'invalid or expired pairing code';
  end if;

  if v_pairing.camera_id is not null then
    select c.* into v_camera
    from public.cameras c
    where c.id = v_pairing.camera_id;

    if v_camera.id is null then
      raise exception 'camera not found';
    end if;

    update public.agent_cameras ac
       set enabled = false,
           updated_at = now()
     where ac.camera_id = v_camera.id
       and ac.enabled;
  else
    select coalesce(array_agg(a.id order by a.created_at), array[]::uuid[])
      into v_previous_agent_ids
    from public.agents a
    where a.organization_id = v_pairing.organization_id
      and a.site_id = v_pairing.site_id
      and a.status <> 'disabled';
  end if;

  -- Continua valendo o contrato "um computador ativo por local".
  update public.agents a
     set status = 'disabled',
         updated_at = now()
   where a.organization_id = v_pairing.organization_id
     and a.site_id = v_pairing.site_id
     and a.status <> 'disabled';

  -- No pareamento por local, o Agent antigo deixa de possuir as câmeras.
  -- Os registros das câmeras NÃO são apagados: voltam apenas para "pairing"
  -- até a descoberta do novo computador validar os streams locais.
  if v_pairing.camera_id is null
     and cardinality(v_previous_agent_ids) > 0 then
    select coalesce(
      array_agg(distinct ac.camera_id order by ac.camera_id),
      array[]::uuid[]
    )
      into v_previous_camera_ids
    from public.agent_cameras ac
    where ac.agent_id = any(v_previous_agent_ids)
      and ac.enabled;

    update public.agent_cameras ac
       set enabled = false,
           updated_at = now()
     where ac.agent_id = any(v_previous_agent_ids)
       and ac.camera_id = any(v_previous_camera_ids)
       and ac.enabled;

    update public.cameras c
       set pairing_status = 'pairing',
           status = 'offline'
     where c.organization_id = v_pairing.organization_id
       and c.site_id = v_pairing.site_id
       and c.id = any(v_previous_camera_ids);
  end if;

  insert into public.agents(
    organization_id,
    site_id,
    name,
    status,
    version,
    platform,
    architecture,
    agent_token_hash,
    metadata
  ) values (
    v_pairing.organization_id,
    v_pairing.site_id,
    left(coalesce(nullif(trim(p_agent_name), ''), 'MonitorIA Agent'), 160),
    'pending',
    nullif(trim(p_version), ''),
    nullif(trim(p_platform), ''),
    nullif(trim(p_architecture), ''),
    p_agent_token_hash,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_agent_id;

  if v_camera.id is not null then
    insert into public.agent_cameras(agent_id, camera_id, enabled)
    values (v_agent_id, v_camera.id, true);

    update public.cameras c
       set pairing_status = 'paired',
           paired_at = now()
     where c.id = v_camera.id;
  elsif cardinality(v_previous_agent_ids) > 0 then
    -- Uma demonstração ativa acompanha o computador substituto. Isso evita
    -- precisar de intervenção administrativa durante troca 24/7 <-> Store.
    update public.trial_runs tr
       set agent_id = v_agent_id
     where tr.organization_id = v_pairing.organization_id
       and tr.agent_id = any(v_previous_agent_ids)
       and tr.status in ('ready', 'running', 'capture_completed', 'exploration');
  end if;

  update public.agent_pairing_codes pc
     set used_at = now(),
         used_by_agent_id = v_agent_id
   where pc.id = v_pairing.id;

  return query
  select
    v_agent_id,
    v_pairing.organization_id,
    v_pairing.site_id,
    v_camera.id,
    v_camera.name,
    v_camera.analysis_plan_code,
    v_camera.capture_interval_seconds,
    v_camera.consolidation_interval_seconds,
    v_camera.motion_start_threshold,
    v_camera.motion_continue_threshold,
    v_camera.event_close_after_seconds,
    v_camera.monitoring_goals;
end;
$$;

revoke execute on function public.consume_agent_pairing_code(
  text, text, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.consume_agent_pairing_code(
  text, text, text, text, text, text, jsonb
) to service_role;
