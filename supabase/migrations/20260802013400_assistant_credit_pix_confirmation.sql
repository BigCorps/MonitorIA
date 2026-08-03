-- MonitorIA Fase 6 — ativação de pacotes extras após confirmação Pix

create or replace function private.activate_assistant_credit_packs(
  p_invoice_id uuid,
  p_payment_id uuid,
  p_confirmed_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.billing_invoices%rowtype;
  v_item public.billing_invoice_items%rowtype;
  v_existing public.assistant_credit_purchases%rowtype;
  v_purchase_id uuid;
  v_package_code text;
  v_interactions integer;
  v_validity_days integer;
  v_activated jsonb := '[]'::jsonb;
begin
  select invoice.*
    into v_invoice
  from public.billing_invoices invoice
  where invoice.id = p_invoice_id;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  for v_item in
    select item.*
    from public.billing_invoice_items item
    where item.invoice_id = p_invoice_id
      and item.item_type = 'assistant_credit_pack'
    order by item.created_at, item.id
    for update
  loop
    v_package_code := v_item.metadata->>'packageCode';
    v_interactions := coalesce(
      nullif(v_item.metadata->>'interactions', '')::integer,
      0
    );
    v_validity_days := coalesce(
      nullif(v_item.metadata->>'validityDays', '')::integer,
      365
    );

    if v_package_code is null
       or v_interactions <= 0
       or v_validity_days < 1
       or v_item.total_amount_cents <= 0 then
      raise exception 'assistant_credit_invoice_item_invalid';
    end if;

    select purchase.*
      into v_existing
    from public.assistant_credit_purchases purchase
    where purchase.invoice_item_id = v_item.id
    for update;

    if found then
      v_activated := v_activated || jsonb_build_array(
        jsonb_build_object(
          'purchaseId', v_existing.id,
          'packageCode', v_existing.package_code,
          'purchasedInteractions', v_existing.purchased_interactions,
          'remainingInteractions', v_existing.remaining_interactions,
          'validUntil', v_existing.valid_until,
          'duplicate', true
        )
      );
      continue;
    end if;

    insert into public.assistant_credit_purchases (
      organization_id,
      invoice_id,
      invoice_item_id,
      package_code,
      amount_cents,
      status,
      purchased_interactions,
      remaining_interactions,
      valid_until,
      activated_at,
      metadata
    )
    values (
      v_invoice.organization_id,
      v_invoice.id,
      v_item.id,
      v_package_code,
      v_item.total_amount_cents,
      'active',
      v_interactions,
      v_interactions,
      p_confirmed_at + pg_catalog.make_interval(days => v_validity_days),
      p_confirmed_at,
      jsonb_build_object(
        'paymentId', p_payment_id,
        'invoiceNumber', v_invoice.invoice_number,
        'validityDays', v_validity_days
      )
    )
    returning id into v_purchase_id;

    insert into public.assistant_credit_ledger (
      organization_id,
      purchase_id,
      delta_interactions,
      reason,
      balance_after
    )
    values (
      v_invoice.organization_id,
      v_purchase_id,
      v_interactions,
      'assistant_credit_pack_activated',
      v_interactions
    );

    v_activated := v_activated || jsonb_build_array(
      jsonb_build_object(
        'purchaseId', v_purchase_id,
        'packageCode', v_package_code,
        'purchasedInteractions', v_interactions,
        'remainingInteractions', v_interactions,
        'validUntil', p_confirmed_at + pg_catalog.make_interval(days => v_validity_days),
        'duplicate', false
      )
    );
  end loop;

  return v_activated;
end;
$$;

revoke all on function private.activate_assistant_credit_packs(uuid, uuid, timestamptz)
from public, anon, authenticated;
grant execute on function private.activate_assistant_credit_packs(uuid, uuid, timestamptz)
to service_role;

create or replace function public.apply_confirmed_assistant_credit_pix_payment(
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
  v_activated jsonb;
begin
  perform private.require_monitoria_service_role();

  select payment.*
    into v_payment
  from public.billing_pix_payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  select invoice.*
    into v_invoice
  from public.billing_invoices invoice
  where invoice.id = v_payment.invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if not exists (
    select 1
    from public.billing_invoice_items item
    where item.invoice_id = v_invoice.id
      and item.item_type = 'assistant_credit_pack'
  ) then
    raise exception 'invoice_has_no_assistant_credit_items';
  end if;

  if v_payment.status = 'confirmed' and v_invoice.status = 'paid' then
    v_activated := private.activate_assistant_credit_packs(
      v_invoice.id,
      v_payment.id,
      coalesce(v_payment.confirmed_at, p_confirmed_at)
    );

    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'paymentId', v_payment.id,
      'invoiceId', v_invoice.id,
      'invoiceNumber', v_invoice.invoice_number,
      'assistantPacks', v_activated,
      'balance', public.get_assistant_balance(v_invoice.organization_id)
    );
  end if;

  if v_payment.status not in ('pending', 'manual_review') then
    raise exception 'payment_not_confirmable';
  end if;

  if v_payment.txid is null or v_payment.txid <> p_txid then
    update public.billing_pix_payments
    set status = 'manual_review',
        bank_status = p_provider_status,
        provider_last_response = coalesce(p_provider_payload, '{}'::jsonb),
        last_checked_at = now(),
        check_attempts = check_attempts + 1,
        error_code = 'txid_mismatch',
        error_message = 'O txid confirmado não corresponde à cobrança.',
        updated_at = now()
    where id = v_payment.id;

    return jsonb_build_object(
      'success', false,
      'status', 'manual_review',
      'reason', 'txid_mismatch'
    );
  end if;

  if p_paid_amount_cents is null
     or p_paid_amount_cents <> v_payment.amount_cents
     or p_paid_amount_cents <> v_invoice.total_cents then
    update public.billing_pix_payments
    set status = 'manual_review',
        bank_status = p_provider_status,
        provider_last_response = coalesce(p_provider_payload, '{}'::jsonb),
        last_checked_at = now(),
        check_attempts = check_attempts + 1,
        error_code = 'amount_mismatch',
        error_message = 'O valor recebido não corresponde ao valor da fatura.',
        updated_at = now()
    where id = v_payment.id;

    insert into public.billing_payment_events (
      organization_id,
      invoice_id,
      pix_payment_id,
      event_type,
      provider_status,
      amount_cents,
      idempotency_key,
      payload
    )
    values (
      v_payment.organization_id,
      v_payment.invoice_id,
      v_payment.id,
      'assistant_pix.amount_mismatch',
      p_provider_status,
      p_paid_amount_cents,
      'assistant-pix-amount-mismatch:' || v_payment.id::text || ':' ||
        coalesce(p_paid_amount_cents, -1)::text,
      coalesce(p_provider_payload, '{}'::jsonb)
    )
    on conflict (idempotency_key) do nothing;

    return jsonb_build_object(
      'success', false,
      'status', 'manual_review',
      'reason', 'amount_mismatch',
      'expectedAmountCents', v_payment.amount_cents,
      'paidAmountCents', p_paid_amount_cents
    );
  end if;

  v_activated := private.activate_assistant_credit_packs(
    v_invoice.id,
    v_payment.id,
    p_confirmed_at
  );

  update public.billing_pix_payments
  set status = 'confirmed',
      bank_status = p_provider_status,
      confirmed_at = p_confirmed_at,
      last_checked_at = now(),
      check_attempts = check_attempts + 1,
      provider_last_response = coalesce(p_provider_payload, '{}'::jsonb),
      error_code = null,
      error_message = null,
      updated_at = now()
  where id = v_payment.id;

  update public.billing_invoices
  set status = 'paid',
      paid_at = p_confirmed_at,
      due_at = null,
      expires_at = null,
      updated_at = now()
  where id = v_invoice.id;

  insert into public.billing_payment_events (
    organization_id,
    invoice_id,
    pix_payment_id,
    event_type,
    provider_status,
    amount_cents,
    idempotency_key,
    payload
  )
  values (
    v_payment.organization_id,
    v_invoice.id,
    v_payment.id,
    'assistant_pix.confirmed',
    p_provider_status,
    p_paid_amount_cents,
    'assistant-pix-confirmed:' || v_payment.id::text,
    coalesce(p_provider_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_payment.organization_id,
    v_invoice.created_by,
    'assistant.credit_pack_activated',
    'billing_invoice',
    v_invoice.id::text,
    jsonb_build_object(
      'paymentId', v_payment.id,
      'invoiceNumber', v_invoice.invoice_number,
      'amountCents', p_paid_amount_cents,
      'packs', v_activated
    )
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'paymentId', v_payment.id,
    'invoiceId', v_invoice.id,
    'invoiceNumber', v_invoice.invoice_number,
    'assistantPacks', v_activated,
    'balance', public.get_assistant_balance(v_invoice.organization_id)
  );
end;
$$;

revoke all on function public.apply_confirmed_assistant_credit_pix_payment(
  uuid, text, integer, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_confirmed_assistant_credit_pix_payment(
  uuid, text, integer, text, jsonb, timestamptz
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
  v_has_camera_items boolean;
  v_has_assistant_items boolean;
  v_result jsonb;
  v_packs jsonb := '[]'::jsonb;
begin
  perform private.require_monitoria_service_role();

  select payment.invoice_id
    into v_invoice_id
  from public.billing_pix_payments payment
  where payment.id = p_payment_id;

  if v_invoice_id is null then
    raise exception 'payment_not_found';
  end if;

  select
    exists (
      select 1
      from public.billing_invoice_items item
      where item.invoice_id = v_invoice_id
        and item.camera_id is not null
        and item.plan_code is not null
        and item.item_type in ('camera_subscription', 'camera_upgrade')
    ),
    exists (
      select 1
      from public.billing_invoice_items item
      where item.invoice_id = v_invoice_id
        and item.item_type = 'assistant_credit_pack'
    )
  into v_has_camera_items, v_has_assistant_items;

  if v_has_camera_items then
    v_result := public.apply_confirmed_monitoria_pix_payment(
      p_payment_id,
      p_txid,
      p_paid_amount_cents,
      p_provider_status,
      p_provider_payload,
      p_confirmed_at
    );

    if coalesce((v_result->>'success')::boolean, false)
       and v_has_assistant_items then
      v_packs := private.activate_assistant_credit_packs(
        v_invoice_id,
        p_payment_id,
        p_confirmed_at
      );
      v_result := v_result || jsonb_build_object(
        'assistantPacks', v_packs
      );
    end if;

    return v_result;
  end if;

  if v_has_assistant_items then
    return public.apply_confirmed_assistant_credit_pix_payment(
      p_payment_id,
      p_txid,
      p_paid_amount_cents,
      p_provider_status,
      p_provider_payload,
      p_confirmed_at
    );
  end if;

  raise exception 'invoice_has_no_supported_items';
end;
$$;

revoke all on function public.apply_confirmed_monitoria_payment(
  uuid, text, integer, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_confirmed_monitoria_payment(
  uuid, text, integer, text, jsonb, timestamptz
) to service_role;
