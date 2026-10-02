-- MonitorIA VIP — Gate 4: reabertura repetida usa somente o contrato aberto mais recente.

create or replace function public.reopen_vip_proposal_v1(
  p_project_id uuid,
  p_actor_user_id uuid default null,
  p_actor_sales_operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
  v_contract public.vip_contracts%rowtype;
  v_proposal public.vip_proposals%rowtype;
begin
  perform private.require_monitoria_service_role();

  select project.*
    into v_project
  from public.vip_projects project
  where project.id = p_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if p_actor_sales_operator_id is not null
     and p_actor_sales_operator_id is distinct from v_project.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  if v_project.status <> 'payment_pending' then
    raise exception 'vip_project_not_payment_pending';
  end if;

  select contract.*
    into v_contract
  from public.vip_contracts contract
  where contract.project_id = v_project.id
    and contract.status = 'awaiting_payment'
  order by contract.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'vip_contract_not_reopenable';
  end if;

  if exists (
    select 1
    from public.billing_pix_payments payment
    where payment.invoice_id = v_contract.invoice_id
      and payment.status = 'confirmed'
  ) then
    raise exception 'vip_payment_already_confirmed';
  end if;

  update public.billing_pix_payments
  set status = 'cancelled',
      error_code = 'vip_proposal_reopened',
      error_message = 'Cobrança cancelada porque a proposta VIP foi reaberta.',
      updated_at = now()
  where invoice_id = v_contract.invoice_id
    and status = 'pending';

  update public.billing_invoices
  set status = 'void',
      due_at = null,
      expires_at = null,
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'voidReason', 'vip_proposal_reopened'
      )
  where id = v_contract.invoice_id
    and status <> 'paid';

  update public.vip_contracts
  set status = 'cancelled',
      cancelled_at = now(),
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'cancelReason', 'vip_proposal_reopened'
      )
  where id = v_contract.id;

  select proposal.*
    into v_proposal
  from public.vip_proposals proposal
  where proposal.id = v_contract.proposal_id
  for update;

  if not found then
    raise exception 'vip_proposal_not_found';
  end if;

  update public.vip_proposals
  set status = 'presented',
      selected_billing_cycle = null,
      accepted_at = null,
      accepted_by = null,
      updated_at = now()
  where id = v_proposal.id;

  update public.vip_projects
  set billing_cycle = null,
      updated_at = now()
  where id = v_project.id;

  perform public.transition_vip_project(
    v_project.id,
    'proposal',
    p_actor_user_id,
    p_actor_sales_operator_id,
    jsonb_build_object(
      'source', 'vip_proposal_reopened',
      'proposalId', v_proposal.id,
      'cancelledContractId', v_contract.id
    )
  );

  return jsonb_build_object(
    'success', true,
    'projectId', v_project.id,
    'proposalId', v_proposal.id,
    'status', 'proposal'
  );
end;
$$;

revoke all on function public.reopen_vip_proposal_v1(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_vip_proposal_v1(uuid, uuid, uuid)
  to service_role;
