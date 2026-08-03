-- updated_at triggers
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'camera_plan_catalog',
    'addon_catalog',
    'billing_accounts',
    'camera_subscriptions',
    'billing_invoices',
    'camera_subscription_changes',
    'billing_pix_payments',
    'trial_runs',
    'assistant_allowances'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      'trg_' || v_table || '_updated_at',
      v_table
    );
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      'trg_' || v_table || '_updated_at',
      v_table
    );
  end loop;
end $$;

-- RLS
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'camera_plan_catalog',
    'camera_plan_price_versions',
    'volume_discount_tiers',
    'addon_catalog',
    'billing_accounts',
    'camera_subscriptions',
    'camera_subscription_changes',
    'billing_invoices',
    'billing_invoice_items',
    'billing_price_snapshots',
    'billing_pix_payments',
    'billing_payment_events',
    'trial_runs',
    'trial_device_fingerprints',
    'assistant_allowances',
    'assistant_usage_events',
    'assistant_credit_purchases',
    'assistant_credit_ledger',
    'camera_usage_daily',
    'camera_usage_monthly',
    'organization_usage_monthly'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
  end loop;
end $$;

-- Catálogo público, somente leitura.
drop policy if exists camera_plan_catalog_read on public.camera_plan_catalog;
create policy camera_plan_catalog_read
on public.camera_plan_catalog
for select
to anon, authenticated
using (is_active);

drop policy if exists camera_plan_prices_read on public.camera_plan_price_versions;
create policy camera_plan_prices_read
on public.camera_plan_price_versions
for select
to anon, authenticated
using (
  valid_from <= now()
  and (valid_to is null or valid_to > now())
);

drop policy if exists volume_discount_tiers_read on public.volume_discount_tiers;
create policy volume_discount_tiers_read
on public.volume_discount_tiers
for select
to anon, authenticated
using (is_active);

drop policy if exists addon_catalog_read on public.addon_catalog;
create policy addon_catalog_read
on public.addon_catalog
for select
to authenticated
using (is_active);

-- Dados administrativos da organização.
drop policy if exists billing_accounts_select_admin on public.billing_accounts;
create policy billing_accounts_select_admin
on public.billing_accounts
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists camera_subscriptions_select_member on public.camera_subscriptions;
create policy camera_subscriptions_select_member
on public.camera_subscriptions
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists camera_subscription_changes_select_admin
  on public.camera_subscription_changes;
create policy camera_subscription_changes_select_admin
on public.camera_subscription_changes
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists billing_invoices_select_admin on public.billing_invoices;
create policy billing_invoices_select_admin
on public.billing_invoices
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists billing_invoice_items_select_admin
  on public.billing_invoice_items;
create policy billing_invoice_items_select_admin
on public.billing_invoice_items
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists billing_price_snapshots_select_admin
  on public.billing_price_snapshots;
create policy billing_price_snapshots_select_admin
on public.billing_price_snapshots
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists billing_pix_payments_select_admin
  on public.billing_pix_payments;
create policy billing_pix_payments_select_admin
on public.billing_pix_payments
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists billing_payment_events_select_admin
  on public.billing_payment_events;
create policy billing_payment_events_select_admin
on public.billing_payment_events
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists trial_runs_select_member on public.trial_runs;
create policy trial_runs_select_member
on public.trial_runs
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists trial_device_fingerprints_select_admin
  on public.trial_device_fingerprints;
create policy trial_device_fingerprints_select_admin
on public.trial_device_fingerprints
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists assistant_allowances_select_member
  on public.assistant_allowances;
create policy assistant_allowances_select_member
on public.assistant_allowances
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists assistant_usage_events_select_member
  on public.assistant_usage_events;
create policy assistant_usage_events_select_member
on public.assistant_usage_events
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists assistant_credit_purchases_select_admin
  on public.assistant_credit_purchases;
create policy assistant_credit_purchases_select_admin
on public.assistant_credit_purchases
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists assistant_credit_ledger_select_admin
  on public.assistant_credit_ledger;
create policy assistant_credit_ledger_select_admin
on public.assistant_credit_ledger
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  )
);

drop policy if exists camera_usage_daily_select_member
  on public.camera_usage_daily;
create policy camera_usage_daily_select_member
on public.camera_usage_daily
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists camera_usage_monthly_select_member
  on public.camera_usage_monthly;
create policy camera_usage_monthly_select_member
on public.camera_usage_monthly
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists organization_usage_monthly_select_member
  on public.organization_usage_monthly;
create policy organization_usage_monthly_select_member
on public.organization_usage_monthly
for select
to authenticated
using (private.is_org_member(organization_id));

-- Privilégios: nenhuma escrita financeira direta pelo navegador.
revoke all on public.camera_plan_catalog from public, anon, authenticated;
revoke all on public.camera_plan_price_versions from public, anon, authenticated;
revoke all on public.volume_discount_tiers from public, anon, authenticated;
revoke all on public.addon_catalog from public, anon, authenticated;

grant select on public.camera_plan_catalog to anon, authenticated;
grant select on public.camera_plan_price_versions to anon, authenticated;
grant select on public.volume_discount_tiers to anon, authenticated;
grant select on public.addon_catalog to authenticated;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'billing_accounts',
    'camera_subscriptions',
    'camera_subscription_changes',
    'billing_invoices',
    'billing_invoice_items',
    'billing_price_snapshots',
    'billing_pix_payments',
    'billing_payment_events',
    'trial_runs',
    'trial_device_fingerprints',
    'assistant_allowances',
    'assistant_usage_events',
    'assistant_credit_purchases',
    'assistant_credit_ledger',
    'camera_usage_daily',
    'camera_usage_monthly',
    'organization_usage_monthly'
  ]
  loop
    execute format(
      'revoke all on public.%I from public, anon, authenticated',
      v_table
    );
    execute format(
      'grant select on public.%I to authenticated',
      v_table
    );
    execute format(
      'grant all on public.%I to service_role',
      v_table
    );
  end loop;
end $$;

grant all on public.camera_plan_catalog to service_role;
grant all on public.camera_plan_price_versions to service_role;
grant all on public.volume_discount_tiers to service_role;
grant all on public.addon_catalog to service_role;
grant usage, select on sequence public.monitoria_invoice_sequence to service_role;
grant select on public.camera_entitlements to authenticated, service_role;

comment on table public.camera_plan_catalog is
  'Catálogo comercial dos planos por câmera do MonitorIA.';
comment on table public.camera_subscriptions is
  'Estado comercial individual de cada câmera.';
comment on table public.billing_invoices is
  'Fatura única da organização, composta por itens de câmeras e adicionais.';
comment on table public.trial_runs is
  'Único teste gratuito da organização: 24 horas de captura e 7 dias de exploração.';
comment on table public.assistant_allowances is
  'Franquias de interações do Assistente IA por período.';
comment on function public.calculate_organization_invoice(
  uuid, jsonb, timestamptz, timestamptz
) is
  'Calcula preços e descontos no servidor. O frontend nunca define o valor final.';
comment on function public.resolve_camera_entitlement(uuid) is
  'Fonte central para saber se uma câmera pode monitorar e quais recursos possui.';
