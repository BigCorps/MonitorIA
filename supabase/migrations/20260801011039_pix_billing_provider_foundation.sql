-- MonitorIA v1.0 — Fase 2: cobrança Pix BigCorps, confirmação
-- transacional, ativação das câmeras e renovação mensal.

alter table public.billing_pix_payments
  add column if not exists provider text not null default 'banco_inter',
  add column if not exists provider_payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_last_response jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.billing_pix_payments
  drop constraint if exists billing_pix_provider_payload_object_check,
  add constraint billing_pix_provider_payload_object_check
    check (jsonb_typeof(provider_payload) = 'object'),
  drop constraint if exists billing_pix_provider_last_response_object_check,
  add constraint billing_pix_provider_last_response_object_check
    check (jsonb_typeof(provider_last_response) = 'object');

create unique index if not exists billing_pix_one_pending_per_invoice_idx
  on public.billing_pix_payments(invoice_id)
  where status = 'pending';

create index if not exists billing_pix_org_created_idx
  on public.billing_pix_payments(organization_id, created_at desc);

create or replace function private.require_monitoria_service_role()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;
end;
$$;

revoke all on function private.require_monitoria_service_role()
  from public, anon, authenticated;
grant execute on function private.require_monitoria_service_role()
  to service_role;

create or replace function public.create_monitoria_pix_payment(
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.billing_invoices%rowtype;
  v_payment_id uuid;
  v_existing public.billing_pix_payments%rowtype;
begin
  perform private.require_monitoria_service_role();

  if p_expires_at <= now() then
    raise exception 'invalid_pix_expiration';
  end if;

  select invoice.*
    into v_invoice
  from public.billing_invoices invoice
  where invoice.id = p_invoice_id
  for update;

  if not found then
    raise exception 'invoice_not_found';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = v_invoice.organization_id
      and member.user_id = p_actor_user_id
      and member.role in (
        'owner'::public.organization_role,
        'admin'::public.organization_role
      )
  ) then
    raise exception 'not_authorized';
  end if;

  if v_invoice.status = 'paid' then
    raise exception 'invoice_already_paid';
  end if;

  if v_invoice.status not in ('draft', 'open', 'pending_payment') then
    raise exception 'invoice_not_payable';
  end if;

  if v_invoice.total_cents <= 0 then
    raise exception 'invoice_amount_invalid';
  end if;

  select payment.*
    into v_existing
  from public.billing_pix_payments payment
  where payment.invoice_id = p_invoice_id
    and payment.status = 'pending'
    and payment.expires_at > now()
    and payment.txid is not null
    and payment.pix_copy_paste is not null
  order by payment.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'paymentId', v_existing.id,
      'invoiceId', v_existing.invoice_id,
      'organizationId', v_existing.organization_id,
      'amountCents', v_existing.amount_cents,
      'expiresAt', v_existing.expires_at,
      'reused', true
    );
  end if;

  update public.billing_pix_payments
  set status = 'cancelled',
      error_code = 'replaced_by_new_pix',
      error_message = 'Cobrança substituída por uma nova geração.',
      updated_at = now()
  where invoice_id = p_invoice_id
    and status = 'pending';

  insert into public.billing_pix_payments (
    organization_id,
    invoice_id,
    status,
    amount_cents,
    provider,
    expires_at,
    created_by,
    metadata
  )
  values (
    v_invoice.organization_id,
    v_invoice.id,
    'pending',
    v_invoice.total_cents,
    'banco_inter',
    p_expires_at,
    p_actor_user_id,
    jsonb_build_object(
      'invoiceNumber', v_invoice.invoice_number,
      'createdByEdge', 'monitoria-create-pix'
    )
  )
  returning id into v_payment_id;

  update public.billing_invoices
  set status = 'pending_payment',
      due_at = p_expires_at,
      expires_at = p_expires_at,
      updated_at = now()
  where id = v_invoice.id;

  insert into public.billing_payment_events (
    organization_id,
    invoice_id,
    pix_payment_id,
    event_type,
    amount_cents,
    idempotency_key,
    payload
  )
  values (
    v_invoice.organization_id,
    v_invoice.id,
    v_payment_id,
    'pix.created_locally',
    v_invoice.total_cents,
    'pix-created:' || v_payment_id::text,
    jsonb_build_object('expiresAt', p_expires_at)
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
    v_invoice.organization_id,
    p_actor_user_id,
    'billing.pix_requested',
    'billing_pix_payment',
    v_payment_id::text,
    jsonb_build_object(
      'invoiceId', v_invoice.id,
      'invoiceNumber', v_invoice.invoice_number,
      'amountCents', v_invoice.total_cents
    )
  );

  return jsonb_build_object(
    'paymentId', v_payment_id,
    'invoiceId', v_invoice.id,
    'organizationId', v_invoice.organization_id,
    'invoiceNumber', v_invoice.invoice_number,
    'amountCents', v_invoice.total_cents,
    'expiresAt', p_expires_at,
    'reused', false
  );
end;
$$;

revoke all on function public.create_monitoria_pix_payment(
  uuid, uuid, timestamptz
) from public, anon, authenticated;
grant execute on function public.create_monitoria_pix_payment(
  uuid, uuid, timestamptz
) to service_role;

create or replace function public.attach_monitoria_pix_provider_data(
  p_payment_id uuid,
  p_txid text,
  p_pix_copy_paste text,
  p_qr_code_payload text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.billing_pix_payments%rowtype;
begin
  perform private.require_monitoria_service_role();

  if p_txid is null or btrim(p_txid) = '' then
    raise exception 'txid_required';
  end if;

  if p_pix_copy_paste is null or btrim(p_pix_copy_paste) = '' then
    raise exception 'pix_copy_paste_required';
  end if;

  select payment.*
    into v_payment
  from public.billing_pix_payments payment
  where payment.id = p_payment_id
  for update;

  if not found then
    raise exception 'payment_not_found';
  end if;

  if v_payment.status <> 'pending' then
    raise exception 'payment_not_pending';
  end if;

  update public.billing_pix_payments
  set txid = p_txid,
      pix_copy_paste = p_pix_copy_paste,
      qr_code_payload = nullif(p_qr_code_payload, ''),
      provider_payload = coalesce(p_provider_payload, '{}'::jsonb),
      error_code = null,
      error_message = null,
      updated_at = now()
  where id = p_payment_id;

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
    'pix.created_at_provider',
    'ATIVA',
    v_payment.amount_cents,
    'pix-provider-created:' || v_payment.id::text,
    coalesce(p_provider_payload, '{}'::jsonb)
  )
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object(
    'paymentId', v_payment.id,
    'invoiceId', v_payment.invoice_id,
    'txid', p_txid,
    'status', 'pending'
  );
end;
$$;

revoke all on function public.attach_monitoria_pix_provider_data(
  uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.attach_monitoria_pix_provider_data(
  uuid, text, text, text, jsonb
) to service_role;

create or replace function public.mark_monitoria_pix_checked(
  p_payment_id uuid,
  p_bank_status text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_monitoria_service_role();

  update public.billing_pix_payments
  set bank_status = nullif(p_bank_status, ''),
      provider_last_response = coalesce(p_provider_payload, '{}'::jsonb),
      last_checked_at = now(),
      check_attempts = check_attempts + 1,
      updated_at = now()
  where id = p_payment_id;

  if not found then
    raise exception 'payment_not_found';
  end if;
end;
$$;

revoke all on function public.mark_monitoria_pix_checked(
  uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.mark_monitoria_pix_checked(
  uuid, text, jsonb
) to service_role;

create or replace function public.mark_monitoria_pix_failed(
  p_payment_id uuid,
  p_error_code text,
  p_error_message text,
  p_provider_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid;
  v_org_id uuid;
begin
  perform private.require_monitoria_service_role();

  update public.billing_pix_payments
  set status = 'failed',
      error_code = left(coalesce(p_error_code, 'provider_error'), 120),
      error_message = left(coalesce(p_error_message, 'Falha ao gerar Pix.'), 1000),
      provider_last_response = coalesce(p_provider_payload, '{}'::jsonb),
      updated_at = now()
  where id = p_payment_id
    and status = 'pending'
  returning invoice_id, organization_id
    into v_invoice_id, v_org_id;

  if v_invoice_id is null then
    return;
  end if;

  update public.billing_invoices
  set status = 'open',
      due_at = null,
      expires_at = null,
      updated_at = now()
  where id = v_invoice_id
    and status = 'pending_payment';

  insert into public.billing_payment_events (
    organization_id,
    invoice_id,
    pix_payment_id,
    event_type,
    provider_status,
    idempotency_key,
    payload
  )
  values (
    v_org_id,
    v_invoice_id,
    p_payment_id,
    'pix.creation_failed',
    p_error_code,
    'pix-failed:' || p_payment_id::text,
    jsonb_build_object(
      'message', p_error_message,
      'provider', coalesce(p_provider_payload, '{}'::jsonb)
    )
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function public.mark_monitoria_pix_failed(
  uuid, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.mark_monitoria_pix_failed(
  uuid, text, text, jsonb
) to service_role;

