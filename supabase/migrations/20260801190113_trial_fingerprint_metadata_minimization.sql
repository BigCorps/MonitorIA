create or replace function private.register_monitoria_trial_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint_hash text;
  v_platform text;
begin
  if new.status <> 'running'
     or old.status = 'running'
     or new.agent_id is null then
    return new;
  end if;

  select nullif(agent.metadata->>'installationFingerprintHash', ''),
         nullif(agent.metadata->>'osType', '')
    into v_fingerprint_hash,
         v_platform
  from public.agents agent
  where agent.id = new.agent_id;

  if v_fingerprint_hash is null then
    return new;
  end if;

  if v_fingerprint_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_installation_fingerprint_hash';
  end if;

  insert into public.trial_device_fingerprints (
    trial_run_id,
    organization_id,
    fingerprint_hash,
    metadata
  )
  values (
    new.id,
    new.organization_id,
    v_fingerprint_hash,
    jsonb_build_object(
      'agentId', new.agent_id,
      'platform', v_platform
    )
  );

  return new;
end;
$$;

revoke all on function private.register_monitoria_trial_fingerprint()
  from public, anon, authenticated;
grant execute on function private.register_monitoria_trial_fingerprint()
  to service_role;
