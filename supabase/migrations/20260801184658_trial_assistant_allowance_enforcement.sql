-- Reserva uma interação antes da chamada da IA, pois a rota atual insere a
-- mensagem do usuário antes de executar o planejador e o redator. Se a rota
-- falhar, ela apaga a mensagem e o trigger de DELETE devolve a interação.
create or replace function private.reserve_monitoria_assistant_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enforcement boolean := true;
  v_allowance public.assistant_allowances%rowtype;
  v_request_key text;
begin
  if new.role <> 'user' then
    return new;
  end if;

  select coalesce(account.entitlement_enforcement_enabled, true)
    into v_enforcement
  from public.billing_accounts account
  where account.organization_id = new.organization_id;

  if not coalesce(v_enforcement, true) then
    return new;
  end if;

  select allowance.*
    into v_allowance
  from public.assistant_allowances allowance
  where allowance.organization_id = new.organization_id
    and allowance.period_start <= now()
    and allowance.period_end > now()
    and allowance.expires_at > now()
    and allowance.used_interactions < allowance.included_interactions
  order by
    case allowance.source
      when 'trial' then 1
      when 'subscription' then 2
      else 3
    end,
    allowance.period_end
  for update skip locked
  limit 1;

  if not found then
    raise exception 'assistant_allowance_exhausted';
  end if;

  update public.assistant_allowances
  set used_interactions = used_interactions + 1,
      updated_at = now()
  where id = v_allowance.id;

  v_request_key := 'assistant-message:' || new.id::text;

  insert into public.assistant_usage_events (
    organization_id,
    allowance_id,
    request_key,
    thread_id,
    message_id,
    status,
    metadata
  )
  values (
    new.organization_id,
    v_allowance.id,
    v_request_key,
    new.thread_id,
    new.id,
    'completed',
    jsonb_build_object(
      'reservation', true,
      'source', v_allowance.source
    )
  )
  on conflict (organization_id, request_key) do nothing;

  if v_allowance.source = 'trial' then
    update public.trial_runs
    set interactions_used = least(interactions_used + 1, interaction_limit),
        updated_at = now()
    where id = v_allowance.source_reference_id;
  end if;

  return new;
end;
$$;

create or replace function private.release_monitoria_assistant_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage public.assistant_usage_events%rowtype;
  v_allowance public.assistant_allowances%rowtype;
begin
  if old.role <> 'user' then
    return old;
  end if;

  select usage.*
    into v_usage
  from public.assistant_usage_events usage
  where usage.organization_id = old.organization_id
    and usage.request_key = 'assistant-message:' || old.id::text
    and usage.status = 'completed'
  for update;

  if not found then
    return old;
  end if;

  select allowance.*
    into v_allowance
  from public.assistant_allowances allowance
  where allowance.id = v_usage.allowance_id
  for update;

  if found then
    update public.assistant_allowances
    set used_interactions = greatest(used_interactions - 1, 0),
        updated_at = now()
    where id = v_allowance.id;

    if v_allowance.source = 'trial' then
      update public.trial_runs
      set interactions_used = greatest(interactions_used - 1, 0),
          updated_at = now()
      where id = v_allowance.source_reference_id;
    end if;
  end if;

  update public.assistant_usage_events
  set status = 'released',
      metadata = metadata || jsonb_build_object(
        'releasedAt', now(),
        'reason', 'user_message_deleted_after_failure'
      )
  where id = v_usage.id;

  return old;
end;
$$;

revoke all on function private.reserve_monitoria_assistant_interaction()
  from public, anon, authenticated;
revoke all on function private.release_monitoria_assistant_interaction()
  from public, anon, authenticated;
grant execute on function private.reserve_monitoria_assistant_interaction()
  to service_role;
grant execute on function private.release_monitoria_assistant_interaction()
  to service_role;

drop trigger if exists trg_assistant_messages_reserve_allowance
  on public.assistant_messages;
create trigger trg_assistant_messages_reserve_allowance
before insert on public.assistant_messages
for each row execute function private.reserve_monitoria_assistant_interaction();

drop trigger if exists trg_assistant_messages_release_allowance
  on public.assistant_messages;
create trigger trg_assistant_messages_release_allowance
after delete on public.assistant_messages
for each row execute function private.release_monitoria_assistant_interaction();
