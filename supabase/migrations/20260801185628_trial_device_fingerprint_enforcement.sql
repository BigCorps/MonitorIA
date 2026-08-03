create or replace function private.assert_monitoria_trial_eligibility(
  p_organization_id uuid,
  p_camera_id uuid,
  p_agent_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint_hash text;
begin
  if exists (
    select 1
    from public.billing_invoices invoice
    where invoice.organization_id = p_organization_id
      and invoice.status = 'paid'
  ) or exists (
    select 1
    from public.billing_pix_payments payment
    where payment.organization_id = p_organization_id
      and payment.status = 'confirmed'
  ) then
    raise exception 'organization_already_paid';
  end if;

  if exists (
    select 1
    from public.camera_subscriptions subscription
    where subscription.organization_id = p_organization_id
      and subscription.status <> 'cancelled'
  ) then
    raise exception 'organization_already_subscribed';
  end if;

  if p_user_id is not null and exists (
    select 1
    from public.trial_runs trial
    where trial.started_by = p_user_id
      and trial.organization_id <> p_organization_id
  ) then
    raise exception 'user_trial_already_used';
  end if;

  if p_agent_id is not null and exists (
    select 1
    from public.trial_runs trial
    where trial.agent_id = p_agent_id
      and trial.organization_id <> p_organization_id
  ) then
    raise exception 'agent_trial_already_used';
  end if;

  if exists (
    select 1
    from public.trial_runs trial
    where trial.camera_id = p_camera_id
      and trial.organization_id <> p_organization_id
  ) then
    raise exception 'camera_trial_already_used';
  end if;

  if p_agent_id is not null then
    select nullif(agent.metadata->>'installationFingerprintHash', '')
      into v_fingerprint_hash
    from public.agents agent
    where agent.id = p_agent_id;

    if v_fingerprint_hash ~ '^[a-f0-9]{64}$'
       and exists (
         select 1
         from public.trial_device_fingerprints fingerprint
         where fingerprint.fingerprint_hash = v_fingerprint_hash
           and fingerprint.organization_id <> p_organization_id
       ) then
      raise exception 'device_trial_already_used';
    end if;
  end if;
end;
$$;

revoke all on function private.assert_monitoria_trial_eligibility(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.assert_monitoria_trial_eligibility(uuid, uuid, uuid, uuid)
  to service_role;

create or replace function private.register_monitoria_trial_fingerprint()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fingerprint_hash text;
  v_agent_metadata jsonb;
begin
  if new.status <> 'running'
     or old.status = 'running'
     or new.agent_id is null then
    return new;
  end if;

  select agent.metadata,
         nullif(agent.metadata->>'installationFingerprintHash', '')
    into v_agent_metadata,
         v_fingerprint_hash
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
      'platform', v_agent_metadata->>'osType',
      'hostname', v_agent_metadata->>'hostname'
    )
  );

  return new;
end;
$$;

revoke all on function private.register_monitoria_trial_fingerprint()
  from public, anon, authenticated;
grant execute on function private.register_monitoria_trial_fingerprint()
  to service_role;

drop trigger if exists trg_trial_runs_register_fingerprint
  on public.trial_runs;
create trigger trg_trial_runs_register_fingerprint
after update of status on public.trial_runs
for each row execute function private.register_monitoria_trial_fingerprint();
