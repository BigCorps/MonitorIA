-- MonitorIA Fase 6 — criação segura de fatura para pacotes extras

create or replace function public.create_assistant_credit_invoice(
  p_organization_id uuid,
  p_package_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_package public.addon_catalog%rowtype;
  v_interactions integer;
  v_validity_days integer;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item_id uuid;
  v_existing_invoice public.billing_invoices%rowtype;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  select addon.*
    into v_package
  from public.addon_catalog addon
  where addon.code = p_package_code
    and addon.is_active
    and addon.billing_scope = 'organization'
    and addon.configuration->>'kind' = 'assistant_credit_pack';

  if not found then
    raise exception 'assistant_credit_package_not_found';
  end if;

  v_interactions := coalesce(
    nullif(v_package.configuration->>'interactions', '')::integer,
    0
  );
  v_validity_days := coalesce(
    nullif(v_package.configuration->>'validityDays', '')::integer,
    365
  );

  if v_package.amount_cents is null
     or v_package.amount_cents <= 0
     or v_interactions <= 0
     or v_validity_days < 1 then
    raise exception 'assistant_credit_package_invalid';
  end if;

  select invoice.*
    into v_existing_invoice
  from public.billing_invoices invoice
  join public.billing_invoice_items item
    on item.invoice_id = invoice.id
  where invoice.organization_id = p_organization_id
    and invoice.status in ('draft', 'open', 'pending_payment')
    and item.item_type = 'assistant_credit_pack'
    and item.metadata->>'packageCode' = p_package_code
    and not exists (
      select 1
      from public.billing_pix_payments payment
      where payment.invoice_id = invoice.id
        and payment.status in ('confirmed', 'manual_review')
    )
  order by invoice.created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'invoiceId', v_existing_invoice.id,
      'invoiceNumber', v_existing_invoice.invoice_number,
      'status', v_existing_invoice.status,
      'packageCode', p_package_code,
      'interactions', v_interactions,
      'amountCents', v_existing_invoice.total_cents,
      'reused', true
    );
  end if;

  v_invoice_number := private.next_monitoria_invoice_number();

  insert into public.billing_invoices (
    organization_id,
    invoice_number,
    status,
    currency,
    service_period_start,
    service_period_end,
    subtotal_cents,
    discount_cents,
    adjustment_cents,
    total_cents,
    created_by,
    metadata
  )
  values (
    p_organization_id,
    v_invoice_number,
    'draft',
    'BRL',
    now(),
    now() + pg_catalog.make_interval(days => v_validity_days),
    v_package.amount_cents,
    0,
    0,
    v_package.amount_cents,
    (select auth.uid()),
    jsonb_build_object(
      'invoiceType', 'assistant_credit_pack',
      'packageCode', p_package_code,
      'interactions', v_interactions,
      'validityDays', v_validity_days
    )
  )
  returning id into v_invoice_id;

  insert into public.billing_invoice_items (
    invoice_id,
    organization_id,
    item_type,
    description,
    quantity,
    base_amount_cents,
    discount_basis_points,
    discount_amount_cents,
    adjustment_amount_cents,
    total_amount_cents,
    service_start,
    service_end,
    metadata
  )
  values (
    v_invoice_id,
    p_organization_id,
    'assistant_credit_pack',
    v_package.display_name,
    1,
    v_package.amount_cents,
    0,
    0,
    0,
    v_package.amount_cents,
    now(),
    now() + pg_catalog.make_interval(days => v_validity_days),
    jsonb_build_object(
      'packageCode', p_package_code,
      'interactions', v_interactions,
      'validityDays', v_validity_days,
      'catalogAmountCents', v_package.amount_cents,
      'catalogSnapshotAt', now()
    )
  )
  returning id into v_item_id;

  insert into public.billing_price_snapshots (
    invoice_id,
    organization_id,
    calculation_version,
    input,
    output
  )
  values (
    v_invoice_id,
    p_organization_id,
    'assistant-credit-pack-v1',
    jsonb_build_object(
      'packageCode', p_package_code,
      'requestedBy', (select auth.uid())
    ),
    jsonb_build_object(
      'itemId', v_item_id,
      'displayName', v_package.display_name,
      'interactions', v_interactions,
      'validityDays', v_validity_days,
      'amountCents', v_package.amount_cents,
      'currency', v_package.currency
    )
  );

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    p_organization_id,
    (select auth.uid()),
    'assistant.credit_invoice_created',
    'billing_invoice',
    v_invoice_id::text,
    jsonb_build_object(
      'invoiceNumber', v_invoice_number,
      'packageCode', p_package_code,
      'interactions', v_interactions,
      'amountCents', v_package.amount_cents
    )
  );

  return jsonb_build_object(
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'status', 'draft',
    'packageCode', p_package_code,
    'interactions', v_interactions,
    'amountCents', v_package.amount_cents,
    'validUntil', now() + pg_catalog.make_interval(days => v_validity_days),
    'reused', false
  );
end;
$$;

revoke all on function public.create_assistant_credit_invoice(uuid, text)
from public, anon, authenticated;
grant execute on function public.create_assistant_credit_invoice(uuid, text)
to authenticated, service_role;
