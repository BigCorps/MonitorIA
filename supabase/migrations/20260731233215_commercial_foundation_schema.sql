-- MonitorIA v1.0 — Fase 1: fundação comercial de produção.
-- Catálogo, preços, descontos, assinaturas, faturas, trial,
-- franquia do Assistente, uso agregado e direitos por câmera.

create extension if not exists pgcrypto;

do $$
begin
  create type public.camera_subscription_status as enum (
    'pending_payment',
    'active',
    'change_scheduled',
    'grace_period',
    'suspended',
    'cancel_at_period_end',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.subscription_change_status as enum (
    'pending_payment',
    'scheduled',
    'applied',
    'cancelled',
    'expired'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_invoice_status as enum (
    'draft',
    'open',
    'pending_payment',
    'paid',
    'expired',
    'cancelled',
    'void'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.billing_pix_status as enum (
    'pending',
    'confirmed',
    'expired',
    'cancelled',
    'failed',
    'manual_review'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.trial_run_status as enum (
    'draft',
    'ready',
    'running',
    'capture_completed',
    'exploration',
    'converted',
    'expired',
    'purged'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.assistant_allowance_source as enum (
    'trial',
    'subscription',
    'manual'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.camera_plan_catalog (
  code text primary key
    check (code = any (array['basic'::text, 'standard'::text, 'intensive'::text])),
  display_name text not null check (char_length(display_name) between 2 and 80),
  short_description text not null default '',
  metadata_retention_days smallint not null default 365
    check (metadata_retention_days between 1 and 3650),
  long_term_keyframes smallint not null
    check (long_term_keyframes between 1 and 10),
  temporary_frame_days smallint not null
    check (temporary_frame_days between 1 and 30),
  clip_enabled boolean not null default false,
  clip_duration_seconds smallint
    check (clip_duration_seconds is null or clip_duration_seconds between 5 and 120),
  clip_retention_days smallint
    check (clip_retention_days is null or clip_retention_days between 1 and 3650),
  maximum_analysis_frames smallint not null
    check (maximum_analysis_frames between 1 and 10),
  maximum_escalation_percent smallint not null default 0
    check (maximum_escalation_percent between 0 and 100),
  features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object'),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camera_plan_price_versions (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null references public.camera_plan_catalog(code) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_period_days smallint not null default 30
    check (billing_period_days between 1 and 366),
  valid_from timestamptz not null default now(),
  valid_to timestamptz,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to > valid_from)
);

create unique index if not exists camera_plan_price_one_current_idx
  on public.camera_plan_price_versions(plan_code)
  where valid_to is null;

create index if not exists camera_plan_price_history_idx
  on public.camera_plan_price_versions(plan_code, valid_from desc);

create table if not exists public.volume_discount_tiers (
  id smallint generated always as identity primary key,
  minimum_position integer not null check (minimum_position >= 1),
  maximum_position integer check (
    maximum_position is null or maximum_position >= minimum_position
  ),
  discount_basis_points integer not null default 0
    check (discount_basis_points between 0 and 10000),
  label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (minimum_position)
);

create table if not exists public.addon_catalog (
  code text primary key check (code ~ '^[a-z0-9_]+$'),
  display_name text not null,
  description text not null default '',
  billing_scope text not null
    check (billing_scope = any (array['organization'::text, 'camera'::text, 'usage'::text])),
  amount_cents integer check (amount_cents is null or amount_cents >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  configuration jsonb not null default '{}'::jsonb
    check (jsonb_typeof(configuration) = 'object'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_accounts (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  status text not null default 'active'
    check (status = any (array['active'::text, 'suspended'::text, 'closed'::text])),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_email text,
  grace_period_days smallint not null default 3
    check (grace_period_days between 0 and 30),
  monthly_assistant_allowance integer not null default 90
    check (monthly_assistant_allowance between 0 and 1000000),
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_invoice_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create table if not exists public.camera_subscriptions (
  camera_id uuid primary key references public.cameras(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plan_code text not null references public.camera_plan_catalog(code) on delete restrict,
  price_version_id uuid not null
    references public.camera_plan_price_versions(id) on delete restrict,
  status public.camera_subscription_status not null default 'pending_payment',
  current_period_start timestamptz,
  current_period_end timestamptz,
  grace_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  activated_at timestamptz,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, camera_id),
  check (
    current_period_end is null
    or current_period_start is null
    or current_period_end > current_period_start
  )
);

create index if not exists camera_subscriptions_org_status_idx
  on public.camera_subscriptions(organization_id, status, current_period_end);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_number text not null unique,
  status public.billing_invoice_status not null default 'draft',
  currency text not null default 'BRL' check (currency = 'BRL'),
  service_period_start timestamptz not null,
  service_period_end timestamptz not null,
  due_at timestamptz,
  expires_at timestamptz,
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  adjustment_cents integer not null default 0,
  total_cents integer not null default 0 check (total_cents >= 0),
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_period_end > service_period_start),
  check (discount_cents <= subtotal_cents + greatest(adjustment_cents, 0))
);

create index if not exists billing_invoices_org_time_idx
  on public.billing_invoices(organization_id, created_at desc);

create index if not exists billing_invoices_open_idx
  on public.billing_invoices(status, due_at)
  where status in ('open', 'pending_payment');

create table if not exists public.billing_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid references public.cameras(id) on delete set null,
  plan_code text references public.camera_plan_catalog(code) on delete restrict,
  price_version_id uuid references public.camera_plan_price_versions(id) on delete restrict,
  item_type text not null default 'camera_subscription'
    check (item_type = any (
      array[
        'camera_subscription'::text,
        'camera_upgrade'::text,
        'assistant_package'::text,
        'addon'::text,
        'adjustment'::text
      ]
    )),
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  billing_position integer check (billing_position is null or billing_position >= 1),
  base_amount_cents integer not null default 0 check (base_amount_cents >= 0),
  discount_basis_points integer not null default 0
    check (discount_basis_points between 0 and 10000),
  discount_amount_cents integer not null default 0 check (discount_amount_cents >= 0),
  adjustment_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0 check (total_amount_cents >= 0),
  service_start timestamptz,
  service_end timestamptz,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists billing_invoice_items_invoice_idx
  on public.billing_invoice_items(invoice_id, billing_position);

create index if not exists billing_invoice_items_camera_idx
  on public.billing_invoice_items(camera_id, created_at desc);

create table if not exists public.billing_price_snapshots (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null unique references public.billing_invoices(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  calculation_version text not null default 'volume-marginal-v1',
  input jsonb not null check (jsonb_typeof(input) = 'object'),
  output jsonb not null check (jsonb_typeof(output) = 'object'),
  created_at timestamptz not null default now()
);

create table if not exists public.camera_subscription_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  invoice_item_id uuid references public.billing_invoice_items(id) on delete set null,
  change_type text not null
    check (change_type = any (
      array['activate'::text, 'upgrade'::text, 'downgrade'::text, 'cancel'::text, 'reactivate'::text]
    )),
  from_plan_code text references public.camera_plan_catalog(code) on delete restrict,
  to_plan_code text references public.camera_plan_catalog(code) on delete restrict,
  status public.subscription_change_status not null default 'pending_payment',
  effective_at timestamptz,
  requested_by uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists camera_subscription_changes_pending_idx
  on public.camera_subscription_changes(organization_id, status, effective_at);

create table if not exists public.billing_pix_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.billing_invoices(id) on delete cascade,
  status public.billing_pix_status not null default 'pending',
  txid text unique,
  amount_cents integer not null check (amount_cents > 0),
  pix_copy_paste text,
  qr_code_payload text,
  bank_status text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  last_checked_at timestamptz,
  check_attempts integer not null default 0 check (check_attempts >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_pix_pending_idx
  on public.billing_pix_payments(status, expires_at)
  where status = 'pending';

create table if not exists public.billing_payment_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid references public.billing_invoices(id) on delete set null,
  pix_payment_id uuid references public.billing_pix_payments(id) on delete set null,
  event_type text not null,
  provider_status text,
  amount_cents integer,
  idempotency_key text,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  unique (idempotency_key)
);

create index if not exists billing_payment_events_invoice_idx
  on public.billing_payment_events(invoice_id, created_at desc);

create table if not exists public.trial_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  camera_id uuid references public.cameras(id) on delete set null,
  selected_plan_code text references public.camera_plan_catalog(code) on delete restrict,
  status public.trial_run_status not null default 'draft',
  started_by uuid references auth.users(id) on delete set null,
  ready_at timestamptz,
  capture_started_at timestamptz,
  capture_ends_at timestamptz,
  exploration_ends_at timestamptz,
  purge_after timestamptz,
  converted_at timestamptz,
  purged_at timestamptz,
  interaction_limit integer not null default 21 check (interaction_limit between 0 and 100000),
  interactions_used integer not null default 0 check (
    interactions_used >= 0 and interactions_used <= interaction_limit
  ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    capture_ends_at is null
    or capture_started_at is null
    or capture_ends_at > capture_started_at
  )
);

create index if not exists trial_runs_status_idx
  on public.trial_runs(status, capture_ends_at, exploration_ends_at);

create table if not exists public.trial_device_fingerprints (
  id uuid primary key default gen_random_uuid(),
  trial_run_id uuid not null references public.trial_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fingerprint_hash text not null unique check (char_length(fingerprint_hash) between 32 and 256),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
);

create table if not exists public.assistant_allowances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source public.assistant_allowance_source not null,
  source_reference_id uuid,
  period_start timestamptz not null,
  period_end timestamptz not null,
  included_interactions integer not null check (included_interactions >= 0),
  used_interactions integer not null default 0 check (used_interactions >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start),
  check (expires_at >= period_end),
  check (used_interactions <= included_interactions),
  unique (organization_id, source, period_start)
);

create index if not exists assistant_allowances_active_idx
  on public.assistant_allowances(organization_id, period_end)
  where used_interactions < included_interactions;

create table if not exists public.assistant_usage_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  allowance_id uuid references public.assistant_allowances(id) on delete set null,
  request_key text not null,
  thread_id uuid,
  message_id uuid,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  estimated_cost_usd numeric(14,8),
  status text not null default 'completed'
    check (status = any (array['completed'::text, 'released'::text, 'failed'::text])),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, request_key)
);

create index if not exists assistant_usage_events_org_time_idx
  on public.assistant_usage_events(organization_id, created_at desc);

create table if not exists public.assistant_credit_purchases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_item_id uuid references public.billing_invoice_items(id) on delete set null,
  purchased_interactions integer not null check (purchased_interactions > 0),
  remaining_interactions integer not null check (remaining_interactions >= 0),
  valid_until timestamptz,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  check (remaining_interactions <= purchased_interactions)
);

create table if not exists public.assistant_credit_ledger (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  purchase_id uuid references public.assistant_credit_purchases(id) on delete set null,
  usage_event_id uuid references public.assistant_usage_events(id) on delete set null,
  delta_interactions integer not null check (delta_interactions <> 0),
  reason text not null,
  balance_after integer,
  created_at timestamptz not null default now()
);

create index if not exists assistant_credit_ledger_org_time_idx
  on public.assistant_credit_ledger(organization_id, created_at desc);

create table if not exists public.camera_usage_daily (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  usage_date date not null,
  events_count integer not null default 0 check (events_count >= 0),
  nano_calls integer not null default 0 check (nano_calls >= 0),
  mini_calls integer not null default 0 check (mini_calls >= 0),
  escalation_calls integer not null default 0 check (escalation_calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  estimated_ai_cost_usd numeric(16,8) not null default 0,
  storage_bytes_added bigint not null default 0,
  keyframes_added integer not null default 0 check (keyframes_added >= 0),
  clips_added integer not null default 0 check (clips_added >= 0),
  updated_at timestamptz not null default now(),
  primary key (camera_id, usage_date)
);

create index if not exists camera_usage_daily_org_date_idx
  on public.camera_usage_daily(organization_id, usage_date desc);

create table if not exists public.camera_usage_monthly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  camera_id uuid not null references public.cameras(id) on delete cascade,
  usage_month date not null check (date_trunc('month', usage_month)::date = usage_month),
  events_count bigint not null default 0 check (events_count >= 0),
  nano_calls bigint not null default 0 check (nano_calls >= 0),
  mini_calls bigint not null default 0 check (mini_calls >= 0),
  escalation_calls bigint not null default 0 check (escalation_calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  estimated_ai_cost_usd numeric(16,8) not null default 0,
  storage_bytes_added bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (camera_id, usage_month)
);

create index if not exists camera_usage_monthly_org_date_idx
  on public.camera_usage_monthly(organization_id, usage_month desc);

create table if not exists public.organization_usage_monthly (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  usage_month date not null check (date_trunc('month', usage_month)::date = usage_month),
  active_cameras integer not null default 0 check (active_cameras >= 0),
  events_count bigint not null default 0 check (events_count >= 0),
  assistant_interactions integer not null default 0 check (assistant_interactions >= 0),
  estimated_ai_cost_usd numeric(16,8) not null default 0,
  storage_bytes bigint not null default 0,
  estimated_egress_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, usage_month)
);

create sequence if not exists public.monitoria_invoice_sequence;

insert into public.camera_plan_catalog (
  code, display_name, short_description, metadata_retention_days,
  long_term_keyframes, temporary_frame_days, clip_enabled,
  clip_duration_seconds, clip_retention_days, maximum_analysis_frames,
  maximum_escalation_percent, features, sort_order, is_active
)
values
  (
    'basic', 'Essencial',
    'Acontecimentos principais com o menor custo por câmera.',
    365, 1, 1, false, null, null, 1, 0,
    '{"assistant_access":true,"search":true,"exports":true}'::jsonb,
    10, true
  ),
  (
    'standard', 'Atenta',
    'Mais contexto e escalonamento inteligente para áreas importantes.',
    365, 2, 3, false, null, null, 3, 15,
    '{"assistant_access":true,"search":true,"exports":true,"smart_escalation":true}'::jsonb,
    20, true
  ),
  (
    'intensive', 'Detalhada',
    'Sequência completa, mais detalhes e clipes inteligentes.',
    365, 3, 7, true, 15, 30, 4, 30,
    '{"assistant_access":true,"search":true,"exports":true,"smart_escalation":true,"preserved_clips":true}'::jsonb,
    30, true
  )
on conflict (code) do update set
  display_name = excluded.display_name,
  short_description = excluded.short_description,
  metadata_retention_days = excluded.metadata_retention_days,
  long_term_keyframes = excluded.long_term_keyframes,
  temporary_frame_days = excluded.temporary_frame_days,
  clip_enabled = excluded.clip_enabled,
  clip_duration_seconds = excluded.clip_duration_seconds,
  clip_retention_days = excluded.clip_retention_days,
  maximum_analysis_frames = excluded.maximum_analysis_frames,
  maximum_escalation_percent = excluded.maximum_escalation_percent,
  features = excluded.features,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.camera_plan_price_versions (
  plan_code, amount_cents, currency, billing_period_days, valid_from
)
select seed.plan_code, seed.amount_cents, 'BRL', 30, now()
from (
  values
    ('basic'::text, 3990),
    ('standard'::text, 7990),
    ('intensive'::text, 14990)
) as seed(plan_code, amount_cents)
where not exists (
  select 1
  from public.camera_plan_price_versions current_price
  where current_price.plan_code = seed.plan_code
    and current_price.valid_to is null
);

insert into public.volume_discount_tiers (
  minimum_position, maximum_position, discount_basis_points, label, is_active
)
values
  (1, 2, 0, '1ª e 2ª câmera', true),
  (3, 4, 500, '3ª e 4ª câmera', true),
  (5, 8, 1000, '5ª à 8ª câmera', true),
  (9, 16, 1500, '9ª à 16ª câmera', true),
  (17, null, 2000, '17ª câmera em diante', true)
on conflict (minimum_position) do update set
  maximum_position = excluded.maximum_position,
  discount_basis_points = excluded.discount_basis_points,
  label = excluded.label,
  is_active = excluded.is_active;

insert into public.billing_accounts (organization_id)
select organization.id
from public.organizations organization
on conflict (organization_id) do nothing;

alter table public.retention_policies
  alter column keyframe_days set default 365,
  alter column metadata_days set default 365;

update public.retention_policies
set keyframe_days = 365,
    metadata_days = 365,
    updated_at = now()
where keyframe_days <> 365
   or metadata_days <> 365;
