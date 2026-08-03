create or replace function public.expire_monitoria_pix_payments()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired_ids uuid[];
  v_expired_count integer := 0;
begin
  perform private.require_monitoria_service_role();

  with expired as (
    update public.billing_pix_payments
    set status = 'expired',
        error_code = 'pix_expired',
        error_message = 'A cobrança Pix expirou antes da confirmação.',
        updated_at = now()
    where status = 'pending'
      and expires_at is not null
      and expires_at <= now()
    returning id, invoice_id
  )
  select array_agg(id), count(*)::integer
    into v_expired_ids, v_expired_count
  from expired;

  if coalesce(v_expired_count, 0) > 0 then
    update public.billing_invoices invoice
    set status = 'open',
        due_at = null,
        expires_at = null,
        updated_at = now()
    where invoice.id in (
      select payment.invoice_id
      from public.billing_pix_payments payment
      where payment.id = any(v_expired_ids)
    )
      and invoice.status = 'pending_payment';
  end if;

  return jsonb_build_object(
    'expiredPayments', coalesce(v_expired_count, 0)
  );
end;
$$;

revoke all on function public.expire_monitoria_pix_payments()
  from public, anon, authenticated;
grant execute on function public.expire_monitoria_pix_payments()
  to service_role;

create or replace function public.create_monitoria_renewal_invoices(
  p_days_before integer default 7
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.billing_accounts%rowtype;
  v_camera_plans jsonb;
  v_invoice jsonb;
  v_created integer := 0;
  v_errors integer := 0;
begin
  perform private.require_monitoria_service_role();

  p_days_before := greatest(1, least(coalesce(p_days_before, 7), 30));

  for v_account in
    select account.*
    from public.billing_accounts account
    where account.status = 'active'
      and account.current_period_end is not null
      and account.current_period_end <=
        now() + pg_catalog.make_interval(days => p_days_before)
      and exists (
        select 1
        from public.camera_subscriptions subscription
        where subscription.organization_id = account.organization_id
          and subscription.status in ('active', 'grace_period')
          and not subscription.cancel_at_period_end
      )
      and not exists (
        select 1
        from public.billing_invoices invoice
        where invoice.organization_id = account.organization_id
          and invoice.status in ('draft', 'open', 'pending_payment')
          and invoice.service_period_start >=
            account.current_period_end - interval '1 minute'
      )
    order by account.current_period_end
  loop
    begin
      select jsonb_agg(
        jsonb_build_object(
          'cameraId', subscription.camera_id,
          'planCode', subscription.plan_code
        )
        order by subscription.camera_id
      )
      into v_camera_plans
      from public.camera_subscriptions subscription
      where subscription.organization_id = v_account.organization_id
        and subscription.status in ('active', 'grace_period')
        and not subscription.cancel_at_period_end;

      if v_camera_plans is null or jsonb_array_length(v_camera_plans) = 0 then
        continue;
      end if;

      v_invoice := public.create_organization_draft_invoice(
        v_account.organization_id,
        v_camera_plans,
        v_account.current_period_end,
        v_account.current_period_end + interval '30 days'
      );

      update public.billing_invoices
      set status = 'open',
          due_at = v_account.current_period_end,
          updated_at = now(),
          metadata = metadata || jsonb_build_object(
            'renewal', true,
            'createdAutomatically', true
          )
      where id = (v_invoice->>'invoiceId')::uuid;

      update public.billing_accounts
      set next_invoice_at = v_account.current_period_end,
          updated_at = now()
      where organization_id = v_account.organization_id;

      v_created := v_created + 1;
    exception when others then
      v_errors := v_errors + 1;
    end;
  end loop;

  return jsonb_build_object(
    'createdInvoices', v_created,
    'errors', v_errors
  );
end;
$$;

revoke all on function public.create_monitoria_renewal_invoices(integer)
  from public, anon, authenticated;
grant execute on function public.create_monitoria_renewal_invoices(integer)
  to service_role;

create or replace function public.process_monitoria_billing_deadlines()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pix jsonb;
  v_subscriptions record;
  v_renewals jsonb;
begin
  perform private.require_monitoria_service_role();

  v_pix := public.expire_monitoria_pix_payments();

  select *
    into v_subscriptions
  from public.expire_camera_subscriptions();

  v_renewals := public.create_monitoria_renewal_invoices(7);

  return jsonb_build_object(
    'pix', v_pix,
    'subscriptionsInGrace',
      coalesce(v_subscriptions.subscriptions_in_grace, 0),
    'subscriptionsSuspended',
      coalesce(v_subscriptions.subscriptions_suspended, 0),
    'renewals', v_renewals,
    'processedAt', now()
  );
end;
$$;

revoke all on function public.process_monitoria_billing_deadlines()
  from public, anon, authenticated;
grant execute on function public.process_monitoria_billing_deadlines()
  to service_role;

comment on function public.apply_confirmed_monitoria_pix_payment(
  uuid, text, integer, text, jsonb, timestamptz
) is
  'Confirma o Pix de forma idempotente e ativa câmeras, ciclo e franquia do Assistente em uma única transação.';

comment on function public.create_monitoria_renewal_invoices(integer) is
  'Cria faturas mensais de renovação sete dias antes do vencimento.';
