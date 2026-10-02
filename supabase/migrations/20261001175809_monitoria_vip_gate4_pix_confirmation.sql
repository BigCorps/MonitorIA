-- MonitorIA VIP — Gate 4: confirmação Pix sem criar assinaturas por câmera.

create or replace function public.apply_confirmed_vip_contract_pix_payment(
  p_payment_id uuid,
  p_txid text,
  p_paid_amount_cents integer,
  p_provider_status text,
  p_provider_payload jsonb default '{}'::jsonb,
  p_confirmed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.billing_pix_payments%rowtype;
  v_invoice public.billing_invoices%rowtype;
  v_contract public.vip_contracts%rowtype;
  v_project public.vip_projects%rowtype;
  v_period_end timestamptz;
  v_excess_end timestamptz;
begin
  perform private.require_monitoria_service_role();

  select payment.* into v_payment
  from public.billing_pix_payments payment
  where payment.id=p_payment_id
  for update;

  if not found then raise exception 'payment_not_found'; end if;

  select invoice.* into v_invoice
  from public.billing_invoices invoice
  where invoice.id=v_payment.invoice_id
  for update;

  if not found then raise exception 'invoice_not_found'; end if;

  select contract.* into v_contract
  from public.vip_contracts contract
  where contract.invoice_id=v_invoice.id
  for update;

  if not found then raise exception 'vip_contract_not_found'; end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id=v_contract.project_id
  for update;

  if not found then raise exception 'vip_project_not_found'; end if;

  if v_payment.status='confirmed'
     and v_invoice.status='paid'
     and v_contract.status in ('paid_pending_activation','active') then
    return jsonb_build_object(
      'success',true,'duplicate',true,'paymentId',v_payment.id,'invoiceId',v_invoice.id,
      'invoiceNumber',v_invoice.invoice_number,'vipContractId',v_contract.id,
      'vipProjectId',v_project.id,'vipContractStatus',v_contract.status,
      'activationPending',v_contract.status='paid_pending_activation',
      'activatedCameras','[]'::jsonb,'assistantPacks','[]'::jsonb
    );
  end if;

  if v_contract.status <> 'awaiting_payment' then
    raise exception 'vip_contract_not_payable';
  end if;

  if v_payment.status not in ('pending','manual_review') then
    raise exception 'payment_not_confirmable';
  end if;

  if v_payment.txid is null or v_payment.txid <> p_txid then
    update public.billing_pix_payments
    set status='manual_review',bank_status=p_provider_status,
        provider_last_response=coalesce(p_provider_payload,'{}'::jsonb),
        last_checked_at=now(),check_attempts=check_attempts+1,
        error_code='txid_mismatch',
        error_message='O txid confirmado não corresponde à cobrança VIP.',
        updated_at=now()
    where id=v_payment.id;

    return jsonb_build_object('success',false,'status','manual_review','reason','txid_mismatch');
  end if;

  if p_paid_amount_cents is null
     or p_paid_amount_cents <> v_payment.amount_cents
     or p_paid_amount_cents <> v_invoice.total_cents
     or p_paid_amount_cents <> v_contract.initial_invoice_total_cents then
    update public.billing_pix_payments
    set status='manual_review',bank_status=p_provider_status,
        provider_last_response=coalesce(p_provider_payload,'{}'::jsonb),
        last_checked_at=now(),check_attempts=check_attempts+1,
        error_code='amount_mismatch',
        error_message='O valor recebido não corresponde ao contrato VIP.',
        updated_at=now()
    where id=v_payment.id;

    insert into public.billing_payment_events (
      organization_id,invoice_id,pix_payment_id,event_type,provider_status,
      amount_cents,idempotency_key,payload
    )
    values (
      v_payment.organization_id,v_invoice.id,v_payment.id,'vip_pix.amount_mismatch',
      p_provider_status,p_paid_amount_cents,
      'vip-pix-amount-mismatch:'||v_payment.id::text||':'||coalesce(p_paid_amount_cents,-1)::text,
      coalesce(p_provider_payload,'{}'::jsonb)
    )
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
      'success',false,'status','manual_review','reason','amount_mismatch',
      'expectedAmountCents',v_payment.amount_cents,'paidAmountCents',p_paid_amount_cents
    );
  end if;

  if v_contract.billing_cycle='annual' then
    v_period_end := p_confirmed_at+interval '1 year';
  else
    v_period_end := p_confirmed_at+interval '30 days';
  end if;

  v_excess_end := case
    when v_contract.excess_camera_count>0 then p_confirmed_at+interval '30 days'
    else null
  end;

  update public.billing_pix_payments
  set status='confirmed',bank_status=p_provider_status,confirmed_at=p_confirmed_at,
      last_checked_at=now(),check_attempts=check_attempts+1,
      provider_last_response=coalesce(p_provider_payload,'{}'::jsonb),
      error_code=null,error_message=null,updated_at=now()
  where id=v_payment.id;

  update public.billing_invoices
  set status='paid',paid_at=p_confirmed_at,service_period_start=p_confirmed_at,
      service_period_end=v_period_end,due_at=null,expires_at=null,updated_at=now()
  where id=v_invoice.id;

  update public.vip_contracts
  set status='paid_pending_activation',payment_id=v_payment.id,paid_at=p_confirmed_at,
      base_period_start=p_confirmed_at,base_period_end=v_period_end,
      excess_period_start=case when excess_camera_count>0 then p_confirmed_at else null end,
      excess_period_end=v_excess_end,next_excess_invoice_at=v_excess_end,updated_at=now(),
      metadata=metadata||jsonb_build_object(
        'confirmedProviderStatus',p_provider_status,'activationPending',true
      )
  where id=v_contract.id
  returning * into v_contract;

  update public.vip_projects
  set metadata=metadata||jsonb_build_object(
        'paymentConfirmedAt',p_confirmed_at,'vipContractId',v_contract.id,
        'vipInvoiceId',v_invoice.id,'vipPaymentId',v_payment.id
      ),
      updated_at=now()
  where id=v_project.id;

  update public.trial_runs
  set status='converted',converted_at=p_confirmed_at,updated_at=now()
  where vip_project_id=v_project.id and status not in ('converted','purged');

  insert into public.billing_payment_events (
    organization_id,invoice_id,pix_payment_id,event_type,provider_status,
    amount_cents,idempotency_key,payload
  )
  values (
    v_payment.organization_id,v_invoice.id,v_payment.id,'vip_pix.confirmed',
    p_provider_status,p_paid_amount_cents,'vip-pix-confirmed:'||v_payment.id::text,
    coalesce(p_provider_payload,'{}'::jsonb)||jsonb_build_object(
      'vipProjectId',v_project.id,'vipContractId',v_contract.id,
      'billingCycle',v_contract.billing_cycle,'planCode',v_contract.plan_code
    )
  )
  on conflict (idempotency_key) do nothing;

  insert into public.audit_logs (
    organization_id,actor_user_id,action,entity_type,entity_id,metadata
  )
  values (
    v_payment.organization_id,v_invoice.created_by,'vip.payment_confirmed',
    'vip_contract',v_contract.id::text,
    jsonb_build_object(
      'paymentId',v_payment.id,'invoiceId',v_invoice.id,
      'invoiceNumber',v_invoice.invoice_number,'amountCents',p_paid_amount_cents,
      'activationPending',true
    )
  );

  return jsonb_build_object(
    'success',true,'duplicate',false,'paymentId',v_payment.id,'invoiceId',v_invoice.id,
    'invoiceNumber',v_invoice.invoice_number,'periodStart',p_confirmed_at,'periodEnd',v_period_end,
    'vipContractId',v_contract.id,'vipProjectId',v_project.id,
    'vipContractStatus',v_contract.status,'activationPending',true,
    'activatedCameras','[]'::jsonb,'assistantPacks','[]'::jsonb
  );
end;
$$;

revoke all on function public.apply_confirmed_vip_contract_pix_payment(
  uuid,text,integer,text,jsonb,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_confirmed_vip_contract_pix_payment(
  uuid,text,integer,text,jsonb,timestamptz
) to service_role;

create or replace function public.apply_confirmed_monitoria_payment(
  p_payment_id uuid,
  p_txid text,
  p_paid_amount_cents integer,
  p_provider_status text,
  p_provider_payload jsonb default '{}'::jsonb,
  p_confirmed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_has_vip_items boolean;
  v_has_camera_items boolean;
  v_has_assistant_items boolean;
  v_result jsonb;
  v_packs jsonb := '[]'::jsonb;
begin
  perform private.require_monitoria_service_role();

  select payment.invoice_id into v_invoice_id
  from public.billing_pix_payments payment
  where payment.id=p_payment_id;

  if v_invoice_id is null then raise exception 'payment_not_found'; end if;

  select
    exists (
      select 1 from public.billing_invoice_items item
      where item.invoice_id=v_invoice_id
        and item.item_type in ('vip_contract_base','vip_contract_excess')
    ),
    exists (
      select 1 from public.billing_invoice_items item
      where item.invoice_id=v_invoice_id
        and item.camera_id is not null
        and item.plan_code is not null
        and item.item_type in ('camera_subscription','camera_upgrade')
    ),
    exists (
      select 1 from public.billing_invoice_items item
      where item.invoice_id=v_invoice_id
        and item.item_type='assistant_credit_pack'
    )
  into v_has_vip_items,v_has_camera_items,v_has_assistant_items;

  if v_has_vip_items then
    if v_has_camera_items or v_has_assistant_items then
      raise exception 'vip_invoice_mixed_items_not_supported';
    end if;

    return public.apply_confirmed_vip_contract_pix_payment(
      p_payment_id,p_txid,p_paid_amount_cents,p_provider_status,p_provider_payload,p_confirmed_at
    );
  end if;

  if v_has_camera_items then
    v_result := public.apply_confirmed_monitoria_pix_payment(
      p_payment_id,p_txid,p_paid_amount_cents,p_provider_status,p_provider_payload,p_confirmed_at
    );

    if coalesce((v_result->>'success')::boolean,false)
       and v_has_assistant_items then
      v_packs := private.activate_assistant_credit_packs(
        v_invoice_id,p_payment_id,p_confirmed_at
      );
      v_result := v_result||jsonb_build_object('assistantPacks',v_packs);
    end if;

    return v_result;
  end if;

  if v_has_assistant_items then
    return public.apply_confirmed_assistant_credit_pix_payment(
      p_payment_id,p_txid,p_paid_amount_cents,p_provider_status,p_provider_payload,p_confirmed_at
    );
  end if;

  raise exception 'invoice_has_no_supported_items';
end;
$$;

revoke all on function public.apply_confirmed_monitoria_payment(
  uuid,text,integer,text,jsonb,timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_confirmed_monitoria_payment(
  uuid,text,integer,text,jsonb,timestamptz
) to service_role;
