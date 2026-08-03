-- MonitorIA Fase 6 — catálogo comercial e schema do Assistente

insert into public.addon_catalog (
  code,
  display_name,
  description,
  billing_scope,
  amount_cents,
  currency,
  configuration,
  is_active
)
values
  (
    'assistant_pack_100',
    '100 interações extras',
    'Pacote avulso com 100 interações adicionais para o Assistente MonitorIA.',
    'organization',
    1990,
    'BRL',
    jsonb_build_object(
      'kind', 'assistant_credit_pack',
      'interactions', 100,
      'validityDays', 365,
      'sortOrder', 10
    ),
    true
  ),
  (
    'assistant_pack_500',
    '500 interações extras',
    'Pacote avulso com 500 interações adicionais para o Assistente MonitorIA.',
    'organization',
    5990,
    'BRL',
    jsonb_build_object(
      'kind', 'assistant_credit_pack',
      'interactions', 500,
      'validityDays', 365,
      'sortOrder', 20
    ),
    true
  ),
  (
    'assistant_pack_2000',
    '2.000 interações extras',
    'Pacote avulso com 2.000 interações adicionais para o Assistente MonitorIA.',
    'organization',
    14990,
    'BRL',
    jsonb_build_object(
      'kind', 'assistant_credit_pack',
      'interactions', 2000,
      'validityDays', 365,
      'sortOrder', 30
    ),
    true
  )
on conflict (code) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  billing_scope = excluded.billing_scope,
  amount_cents = excluded.amount_cents,
  currency = excluded.currency,
  configuration = excluded.configuration,
  is_active = excluded.is_active,
  updated_at = now();

alter table public.assistant_credit_purchases
  add column if not exists package_code text,
  add column if not exists invoice_id uuid,
  add column if not exists amount_cents integer,
  add column if not exists status text not null default 'pending_payment',
  add column if not exists expired_at timestamptz,
  add column if not exists consumed_at timestamptz,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_credit_purchases_package_code_fkey'
      and conrelid = 'public.assistant_credit_purchases'::regclass
  ) then
    alter table public.assistant_credit_purchases
      add constraint assistant_credit_purchases_package_code_fkey
      foreign key (package_code)
      references public.addon_catalog(code)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_credit_purchases_invoice_id_fkey'
      and conrelid = 'public.assistant_credit_purchases'::regclass
  ) then
    alter table public.assistant_credit_purchases
      add constraint assistant_credit_purchases_invoice_id_fkey
      foreign key (invoice_id)
      references public.billing_invoices(id)
      on delete set null;
  end if;
end
$$;

alter table public.assistant_credit_purchases
  drop constraint if exists assistant_credit_purchases_status_check;

alter table public.assistant_credit_purchases
  add constraint assistant_credit_purchases_status_check
  check (status in ('pending_payment', 'active', 'consumed', 'expired', 'cancelled'));

alter table public.assistant_credit_purchases
  drop constraint if exists assistant_credit_purchases_amount_cents_check;

alter table public.assistant_credit_purchases
  add constraint assistant_credit_purchases_amount_cents_check
  check (amount_cents is null or amount_cents > 0);

alter table public.assistant_credit_purchases
  drop constraint if exists assistant_credit_purchases_metadata_check;

alter table public.assistant_credit_purchases
  add constraint assistant_credit_purchases_metadata_check
  check (jsonb_typeof(metadata) = 'object');

create unique index if not exists assistant_credit_purchases_invoice_item_unique_idx
  on public.assistant_credit_purchases (invoice_item_id)
  where invoice_item_id is not null;

create index if not exists assistant_credit_purchases_active_org_expiry_idx
  on public.assistant_credit_purchases (organization_id, valid_until, created_at)
  where status = 'active' and remaining_interactions > 0;

create index if not exists assistant_credit_purchases_package_idx
  on public.assistant_credit_purchases (package_code, created_at desc);

alter table public.assistant_usage_events
  add column if not exists purchase_id uuid,
  add column if not exists response_message_id uuid,
  add column if not exists actor_user_id uuid,
  add column if not exists consumption_source text,
  add column if not exists reserved_at timestamptz,
  add column if not exists reservation_expires_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists release_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_usage_events_purchase_id_fkey'
      and conrelid = 'public.assistant_usage_events'::regclass
  ) then
    alter table public.assistant_usage_events
      add constraint assistant_usage_events_purchase_id_fkey
      foreign key (purchase_id)
      references public.assistant_credit_purchases(id)
      on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'assistant_usage_events_response_message_id_fkey'
      and conrelid = 'public.assistant_usage_events'::regclass
  ) then
    alter table public.assistant_usage_events
      add constraint assistant_usage_events_response_message_id_fkey
      foreign key (response_message_id)
      references public.assistant_messages(id)
      on delete set null;
  end if;
end
$$;

alter table public.assistant_usage_events
  drop constraint if exists assistant_usage_events_status_check;

alter table public.assistant_usage_events
  add constraint assistant_usage_events_status_check
  check (status in ('reserved', 'completed', 'released', 'failed'));

alter table public.assistant_usage_events
  drop constraint if exists assistant_usage_events_consumption_source_check;

alter table public.assistant_usage_events
  add constraint assistant_usage_events_consumption_source_check
  check (
    consumption_source is null
    or consumption_source in ('legacy', 'trial', 'subscription', 'purchase', 'manual')
  );

create index if not exists assistant_usage_events_reserved_expiry_idx
  on public.assistant_usage_events (reservation_expires_at)
  where status = 'reserved';

create unique index if not exists assistant_usage_events_reserved_thread_unique_idx
  on public.assistant_usage_events (organization_id, thread_id)
  where status = 'reserved' and thread_id is not null;

create index if not exists assistant_usage_events_allowance_status_idx
  on public.assistant_usage_events (allowance_id, status)
  where allowance_id is not null;

create index if not exists assistant_usage_events_purchase_status_idx
  on public.assistant_usage_events (purchase_id, status)
  where purchase_id is not null;

create index if not exists assistant_usage_events_message_idx
  on public.assistant_usage_events (message_id)
  where message_id is not null;

create index if not exists assistant_usage_events_response_message_idx
  on public.assistant_usage_events (response_message_id)
  where response_message_id is not null;

create index if not exists assistant_credit_ledger_purchase_idx
  on public.assistant_credit_ledger (purchase_id, created_at desc)
  where purchase_id is not null;

create index if not exists assistant_credit_ledger_usage_idx
  on public.assistant_credit_ledger (usage_event_id, created_at desc)
  where usage_event_id is not null;

update public.assistant_credit_purchases
set status = case
      when activated_at is null then 'pending_payment'
      when valid_until is not null and valid_until <= now() then 'expired'
      when remaining_interactions <= 0 then 'consumed'
      else 'active'
    end,
    metadata = coalesce(metadata, '{}'::jsonb)
where true;

update public.assistant_usage_events usage_event
set consumption_source = case
      when allowance.source = 'trial' then 'trial'
      when allowance.source = 'subscription' then 'subscription'
      else 'manual'
    end,
    completed_at = coalesce(usage_event.completed_at, usage_event.created_at)
from public.assistant_allowances allowance
where usage_event.allowance_id = allowance.id
  and usage_event.consumption_source is null;

update public.assistant_usage_events
set consumption_source = coalesce(consumption_source, 'manual'),
    completed_at = coalesce(completed_at, created_at)
where status = 'completed';
