-- MonitorIA VIP — Gate 4: histórico de contratos + reaceite seguro.

alter table public.vip_contracts
  drop constraint if exists vip_contracts_project_id_key,
  drop constraint if exists vip_contracts_proposal_id_key;

create unique index if not exists vip_contracts_one_open_project_idx
  on public.vip_contracts(project_id)
  where status in ('awaiting_payment','paid_pending_activation','active','grace_period','suspended');

create unique index if not exists vip_contracts_one_open_proposal_idx
  on public.vip_contracts(proposal_id)
  where status in ('awaiting_payment','paid_pending_activation','active','grace_period','suspended');

create or replace function public.accept_vip_proposal_v1(
  p_proposal_id uuid,
  p_billing_cycle text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.vip_proposals%rowtype;
  v_project public.vip_projects%rowtype;
  v_contract public.vip_contracts%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_pricing jsonb;
  v_base_amount integer;
  v_excess_amount integer;
  v_total integer;
  v_estimated_year integer;
  v_service_start timestamptz := now();
  v_service_end timestamptz;
begin
  perform private.require_monitoria_service_role();

  if p_billing_cycle not in ('monthly','annual') then
    raise exception 'vip_billing_cycle_invalid';
  end if;

  select proposal.* into v_proposal
  from public.vip_proposals proposal
  where proposal.id=p_proposal_id
  for update;

  if not found then raise exception 'vip_proposal_not_found'; end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id=v_proposal.project_id
  for update;

  if not found or v_project.organization_id is null then
    raise exception 'vip_project_organization_missing';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id=v_project.organization_id
      and member.user_id=p_actor_user_id
      and member.role in ('owner'::public.organization_role,'admin'::public.organization_role)
  ) then
    raise exception 'not_authorized';
  end if;

  select contract.* into v_contract
  from public.vip_contracts contract
  where contract.project_id=v_project.id
    and contract.status in ('awaiting_payment','paid_pending_activation','active','grace_period','suspended')
  order by contract.created_at desc
  limit 1
  for update;

  if found then
    if v_contract.proposal_id=v_proposal.id
       and v_contract.billing_cycle=p_billing_cycle
       and v_contract.status in ('awaiting_payment','paid_pending_activation','active') then
      return jsonb_build_object(
        'success',true,'duplicate',true,'contractId',v_contract.id,
        'invoiceId',v_contract.invoice_id,'status',v_contract.status
      );
    end if;
    raise exception 'vip_contract_already_exists';
  end if;

  if v_proposal.status <> 'presented' or v_project.status <> 'proposal' then
    raise exception 'vip_proposal_not_acceptable';
  end if;

  v_pricing := v_proposal.pricing_snapshot;
  v_excess_amount := (v_pricing->>'monthlyExcessCents')::integer;

  if p_billing_cycle='monthly' then
    v_base_amount := (v_pricing->>'monthlyBaseCents')::integer;
    v_total := (v_pricing->>'monthlyPayNowCents')::integer;
    v_estimated_year := (v_pricing->>'monthlyEstimatedFirstYearCents')::integer;
    v_service_end := v_service_start+interval '30 days';
  else
    v_base_amount := (v_pricing->>'annualBaseCents')::integer;
    v_total := (v_pricing->>'annualPayNowCents')::integer;
    v_estimated_year := (v_pricing->>'annualEstimatedFirstYearCents')::integer;
    v_service_end := v_service_start+interval '1 year';
  end if;

  insert into public.vip_contracts (
    project_id,proposal_id,organization_id,plan_code,billing_cycle,
    included_cameras,contracted_camera_count,excess_camera_count,
    base_amount_cents,excess_camera_monthly_cents,initial_excess_amount_cents,
    initial_invoice_total_cents,estimated_first_year_total_cents,status,metadata
  )
  values (
    v_project.id,v_proposal.id,v_project.organization_id,v_proposal.plan_code,p_billing_cycle,
    (v_pricing->>'includedCameras')::integer,v_proposal.camera_count,
    (v_pricing->>'excessCameraCount')::integer,v_base_amount,
    (v_pricing->>'excessCameraMonthlyCents')::integer,v_excess_amount,v_total,
    v_estimated_year,'awaiting_payment',
    jsonb_build_object('productFamily','monitoria_vip','pricingVersion',v_pricing->>'version','annualExcessBilling','monthly')
  )
  returning * into v_contract;

  v_invoice_number := private.next_monitoria_invoice_number();

  insert into public.billing_invoices (
    organization_id,invoice_number,status,currency,service_period_start,service_period_end,
    subtotal_cents,discount_cents,adjustment_cents,total_cents,created_by,metadata
  )
  values (
    v_project.organization_id,v_invoice_number,'draft','BRL',v_service_start,v_service_end,
    v_total,0,0,v_total,p_actor_user_id,
    jsonb_build_object('productFamily','monitoria_vip','vipProjectId',v_project.id,'vipProposalId',v_proposal.id,'vipContractId',v_contract.id,'billingCycle',p_billing_cycle)
  )
  returning id into v_invoice_id;

  insert into public.billing_invoice_items (
    invoice_id,organization_id,camera_id,plan_code,price_version_id,item_type,description,
    quantity,base_amount_cents,discount_basis_points,discount_amount_cents,adjustment_amount_cents,
    total_amount_cents,service_start,service_end,metadata
  )
  values (
    v_invoice_id,v_project.organization_id,null,null,null,'vip_contract_base',
    case when p_billing_cycle='annual'
      then 'MonitorIA VIP — plano anual '||upper(v_proposal.plan_code)
      else 'MonitorIA VIP — plano mensal '||upper(v_proposal.plan_code) end,
    1,v_base_amount,0,0,0,v_base_amount,v_service_start,v_service_end,
    jsonb_build_object('vipProjectId',v_project.id,'vipContractId',v_contract.id,'vipPlanCode',v_proposal.plan_code,'billingCycle',p_billing_cycle,'includedCameras',(v_pricing->>'includedCameras')::integer)
  );

  if (v_pricing->>'excessCameraCount')::integer > 0 then
    insert into public.billing_invoice_items (
      invoice_id,organization_id,item_type,description,quantity,base_amount_cents,
      discount_basis_points,discount_amount_cents,adjustment_amount_cents,total_amount_cents,
      service_start,service_end,metadata
    )
    values (
      v_invoice_id,v_project.organization_id,'vip_contract_excess',
      'MonitorIA VIP — câmeras excedentes do primeiro mês',
      (v_pricing->>'excessCameraCount')::integer,
      (v_pricing->>'excessCameraMonthlyCents')::integer,0,0,0,v_excess_amount,
      v_service_start,v_service_start+interval '30 days',
      jsonb_build_object('vipProjectId',v_project.id,'vipContractId',v_contract.id,'vipPlanCode',v_proposal.plan_code,'unitAmountCents',(v_pricing->>'excessCameraMonthlyCents')::integer,'billingCadence','monthly')
    );
  end if;

  insert into public.billing_price_snapshots (
    invoice_id,organization_id,calculation_version,input,output
  )
  values (
    v_invoice_id,v_project.organization_id,'vip-contract-v1',
    jsonb_build_object('proposalId',v_proposal.id,'projectId',v_project.id,'billingCycle',p_billing_cycle,'cameraCount',v_proposal.camera_count),
    v_pricing||jsonb_build_object('selectedBillingCycle',p_billing_cycle,'initialInvoiceTotalCents',v_total)
  );

  update public.vip_contracts
  set invoice_id=v_invoice_id,updated_at=now()
  where id=v_contract.id returning * into v_contract;

  update public.vip_proposals
  set status='accepted',selected_billing_cycle=p_billing_cycle,accepted_at=now(),
      accepted_by=p_actor_user_id,updated_at=now()
  where id=v_proposal.id;

  update public.vip_projects
  set billing_cycle=p_billing_cycle,updated_at=now()
  where id=v_project.id;

  perform public.transition_vip_project(
    v_project.id,'payment_pending',p_actor_user_id,null,
    jsonb_build_object('source','vip_proposal_accepted','proposalId',v_proposal.id,'contractId',v_contract.id,'invoiceId',v_invoice_id,'billingCycle',p_billing_cycle)
  );

  insert into public.audit_logs (
    organization_id,actor_user_id,action,entity_type,entity_id,metadata
  )
  values (
    v_project.organization_id,p_actor_user_id,'vip.contract_awaiting_payment',
    'vip_contract',v_contract.id::text,
    jsonb_build_object('invoiceId',v_invoice_id,'invoiceNumber',v_invoice_number,'planCode',v_proposal.plan_code,'billingCycle',p_billing_cycle,'cameraCount',v_proposal.camera_count,'totalCents',v_total)
  );

  return jsonb_build_object(
    'success',true,'duplicate',false,'projectId',v_project.id,'proposalId',v_proposal.id,
    'contractId',v_contract.id,'invoiceId',v_invoice_id,'invoiceNumber',v_invoice_number,
    'billingCycle',p_billing_cycle,'totalCents',v_total,'status','awaiting_payment'
  );
end;
$$;

revoke all on function public.accept_vip_proposal_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.accept_vip_proposal_v1(uuid,text,uuid)
  to service_role;
