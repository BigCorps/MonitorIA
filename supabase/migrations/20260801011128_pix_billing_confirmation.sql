create or replace function public.apply_confirmed_monitoria_pix_payment(
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
  v_item public.billing_invoice_items%rowtype;
  v_subscription public.camera_subscriptions%rowtype;
  v_duration interval;
  v_item_start timestamptz;
  v_item_end timestamptz;
  v_period_start timestamptz := null;
  v_period_end timestamptz := null;
  v_grace_days integer := 3;
  v_allowance integer := 90;
  v_allowance_id uuid;
  v_activated jsonb := '[]'::jsonb;
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

  if v_payment.status = 'confirmed' and v_invoice.status = 'paid' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'paymentId', v_payment.id,
      'invoiceId', v_invoice.id,
      'invoiceNumber', v_invoice.invoice_number,
      'periodStart', v_invoice.service_period_start,
      'periodEnd', v_invoice.service_period_end
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
     or p_paid_amount_cents <> v_payment.amount_cents then
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
      'pix.amount_mismatch',
      p_provider_status,
      p_paid_amount_cents,
      'pix-amount-mismatch:' || v_payment.id::text || ':' ||
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

  if v_invoice.total_cents <> v_payment.amount_cents then
    raise exception 'invoice_payment_amount_mismatch';
  end if;

  v_duration := v_invoice.service_period_end - v_invoice.service_period_start;
  if v_duration < interval '1 day' then
    v_duration := interval '30 days';
  end if;

  select account.grace_period_days,
         account.monthly_assistant_allowance
    into v_grace_days, v_allowance
  from public.billing_accounts account
  where account.organization_id = v_payment.organization_id;

  v_grace_days := coalesce(v_grace_days, 3);
  v_allowance := coalesce(v_allowance, 90);

  for v_item in
    select item.*
    from public.billing_invoice_items item
    where item.invoice_id = v_invoice.id
      and item.camera_id is not null
      and item.plan_code is not null
      and item.item_type in ('camera_subscription', 'camera_upgrade')
    order by item.billing_position nulls last, item.created_at
    for update
  loop
    select subscription.*
      into v_subscription
    from public.camera_subscriptions subscription
    where subscription.camera_id = v_item.camera_id
    for update;

    if found
       and v_subscription.current_period_end is not null
       and v_subscription.current_period_end > p_confirmed_at
       and v_subscription.status in (
         'active'::public.camera_subscription_status,
         'grace_period'::public.camera_subscription_status,
         'cancel_at_period_end'::public.camera_subscription_status
       ) then
      v_item_start := v_subscription.current_period_end;
    elsif v_invoice.service_period_start > p_confirmed_at then
      v_item_start := v_invoice.service_period_start;
    else
      v_item_start := p_confirmed_at;
    end if;

    v_item_end := v_item_start + v_duration;

    insert into public.camera_subscriptions (
      camera_id,
      organization_id,
      plan_code,
      price_version_id,
      status,
      current_period_start,
      current_period_end,
      grace_ends_at,
      cancel_at_period_end,
      activated_at,
      suspended_at,
      cancelled_at,
      metadata
    )
    values (
      v_item.camera_id,
      v_payment.organization_id,
      v_item.plan_code,
      v_item.price_version_id,
      'active',
      v_item_start,
      v_item_end,
      v_item_end + pg_catalog.make_interval(days => v_grace_days),
      false,
      p_confirmed_at,
      null,
      null,
      jsonb_build_object(
        'lastInvoiceId', v_invoice.id,
        'lastPaymentId', v_payment.id
      )
    )
    on conflict (camera_id)
    do update set
      organization_id = excluded.organization_id,
      plan_code = excluded.plan_code,
      price_version_id = excluded.price_version_id,
      status = 'active',
      current_period_start = excluded.current_period_start,
      current_period_end = excluded.current_period_end,
      grace_ends_at = excluded.grace_ends_at,
      cancel_at_period_end = false,
      activated_at = coalesce(
        public.camera_subscriptions.activated_at,
        excluded.activated_at
      ),
      suspended_at = null,
      cancelled_at = null,
      metadata = public.camera_subscriptions.metadata || excluded.metadata,
      updated_at = now();

    update public.cameras
    set analysis_plan_code = v_item.plan_code,
        updated_at = now()
    where id = v_item.camera_id
      and organization_id = v_payment.organization_id;

    update public.camera_subscription_changes
    set status = 'applied',
        effective_at = v_item_start,
        updated_at = now(),
        metadata = metadata || jsonb_build_object(
          'appliedInvoiceId', v_invoice.id,
          'appliedPaymentId', v_payment.id
        )
    where invoice_item_id = v_item.id
      and status = 'pending_payment';

    v_period_start := least(
      coalesce(v_period_start, v_item_start),
      v_item_start
    );
    v_period_end := greatest(
      coalesce(v_period_end, v_item_end),
      v_item_end
    );

    v_activated := v_activated || jsonb_build_array(
      jsonb_build_object(
        'cameraId', v_item.camera_id,
        'planCode', v_item.plan_code,
        'periodStart', v_item_start,
        'periodEnd', v_item_end
      )
    );
  end loop;

  if v_period_start is null or v_period_end is null then
    raise exception 'invoice_has_no_camera_items';
  end if;

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
      service_period_start = v_period_start,
      service_period_end = v_period_end,
      due_at = null,
      expires_at = null,
      updated_at = now()
  where id = v_invoice.id;

  update public.billing_accounts
  set status = 'active',
      current_period_start = v_period_start,
      current_period_end = v_period_end,
      next_invoice_at = v_period_end - interval '7 days',
      updated_at = now()
  where organization_id = v_payment.organization_id;

  v_allowance_id := public.renew_assistant_allowance(
    v_payment.organization_id,
    'subscription'::public.assistant_allowance_source,
    v_period_start,
    v_period_end,
    v_allowance,
    v_invoice.id
  );

  update public.trial_runs
  set status = 'converted',
      converted_at = p_confirmed_at,
      updated_at = now()
  where organization_id = v_payment.organization_id
    and status not in ('converted', 'purged');

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
    'pix.confirmed',
    p_provider_status,
    p_paid_amount_cents,
    'pix-confirmed:' || v_payment.id::text,
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
    'billing.pix_confirmed',
    'billing_invoice',
    v_invoice.id::text,
    jsonb_build_object(
      'paymentId', v_payment.id,
      'invoiceNumber', v_invoice.invoice_number,
      'amountCents', p_paid_amount_cents,
      'cameraCount', jsonb_array_length(v_activated),
      'allowanceId', v_allowance_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'paymentId', v_payment.id,
    'invoiceId', v_invoice.id,
    'invoiceNumber', v_invoice.invoice_number,
    'periodStart', v_period_start,
    'periodEnd', v_period_end,
    'assistantAllowanceId', v_allowance_id,
    'assistantInteractions', v_allowance,
    'activatedCameras', v_activated
  );
end;
$$;

revoke all on function public.apply_confirmed_monitoria_pix_payment(
  uuid, text, integer, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_confirmed_monitoria_pix_payment(
  uuid, text, integer, text, jsonb, timestamptz
) to service_role;

