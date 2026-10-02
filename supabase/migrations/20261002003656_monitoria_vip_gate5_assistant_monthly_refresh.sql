-- MonitorIA VIP — Gate 5
-- Franquia mensal da Pesquisa IA em contratos mensais ou anuais.

create or replace function private.ensure_vip_assistant_allowance_internal(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_contract public.vip_contracts%rowtype;
  v_start timestamptz;
  v_end timestamptz;
  v_allowance integer:=90;
  v_id uuid;
begin
  select contract.* into v_contract
  from public.vip_contracts contract
  join public.vip_projects project on project.id=contract.project_id
  where contract.organization_id=p_organization_id
    and contract.status in ('active','grace_period')
    and project.status='active'
    and contract.base_period_start is not null
    and contract.base_period_end is not null
    and contract.base_period_start<=now()
    and contract.base_period_end>now()
  order by contract.activated_at desc nulls last,contract.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('success',true,'active',false,'organizationId',p_organization_id);
  end if;

  select coalesce(monthly_assistant_allowance,90) into v_allowance
  from public.billing_accounts where organization_id=p_organization_id;
  v_allowance:=greatest(coalesce(v_allowance,90),0);

  v_start:=v_contract.base_period_start;
  v_end:=least(v_start+interval '1 month',v_contract.base_period_end);
  while v_end<=now() and v_end<v_contract.base_period_end loop
    v_start:=v_end;
    v_end:=least(v_start+interval '1 month',v_contract.base_period_end);
  end loop;

  if not(v_start<=now() and v_end>now()) then
    return jsonb_build_object('success',true,'active',false,'organizationId',p_organization_id,'contractId',v_contract.id);
  end if;

  insert into public.assistant_allowances(
    organization_id,source,source_reference_id,period_start,period_end,
    included_interactions,used_interactions,expires_at
  ) values(
    p_organization_id,'vip_subscription'::public.assistant_allowance_source,
    v_contract.id,v_start,v_end,v_allowance,0,v_end
  )
  on conflict(organization_id,source,period_start) do update set
    source_reference_id=excluded.source_reference_id,
    period_end=excluded.period_end,
    included_interactions=excluded.included_interactions,
    used_interactions=least(public.assistant_allowances.used_interactions,excluded.included_interactions),
    expires_at=excluded.expires_at,
    updated_at=now()
  returning id into v_id;

  return jsonb_build_object('success',true,'active',true,'organizationId',p_organization_id,'contractId',v_contract.id,'allowanceId',v_id,'includedInteractions',v_allowance,'periodStart',v_start,'periodEnd',v_end);
end;
$$;
revoke all on function private.ensure_vip_assistant_allowance_internal(uuid) from public,anon,authenticated;
grant execute on function private.ensure_vip_assistant_allowance_internal(uuid) to service_role;

create or replace function public.ensure_vip_assistant_allowance_v1(p_organization_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform private.require_monitoria_service_role();
  return private.ensure_vip_assistant_allowance_internal(p_organization_id);
end;
$$;
revoke all on function public.ensure_vip_assistant_allowance_v1(uuid) from public,anon,authenticated;
grant execute on function public.ensure_vip_assistant_allowance_v1(uuid) to service_role;

create or replace function private.reserve_assistant_message_before_insert()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_usage_id uuid;
begin
  if new.role<>'user' or new.created_by is null then return new; end if;
  perform private.ensure_vip_assistant_allowance_internal(new.organization_id);
  v_usage_id:=private.reserve_assistant_interaction(
    new.organization_id,'assistant-message:'||new.id::text,new.thread_id,new.id,new.created_by,
    jsonb_build_object('channel','dashboard','reservationOrigin','assistant_messages_before_insert')
  );
  return new;
exception when unique_violation then raise exception 'assistant_request_already_running';
end;
$$;
revoke all on function private.reserve_assistant_message_before_insert() from public,anon,authenticated;
