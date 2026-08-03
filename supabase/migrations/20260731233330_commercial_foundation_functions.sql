create or replace function private.ensure_monitoria_billing_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.billing_accounts(organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_organizations_ensure_billing_account
  on public.organizations;
create trigger trg_organizations_ensure_billing_account
after insert on public.organizations
for each row execute function private.ensure_monitoria_billing_account();

create or replace function private.monitoria_billing_manager(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce((select auth.role()), '') = 'service_role'
    or private.has_org_role(
      p_organization_id,
      array[
        'owner'::public.organization_role,
        'admin'::public.organization_role
      ]
    );
$$;

revoke all on function private.monitoria_billing_manager(uuid)
  from public, anon;
grant execute on function private.monitoria_billing_manager(uuid)
  to authenticated, service_role;

create or replace function private.next_monitoria_invoice_number()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select
    'MON-' ||
    to_char(current_date, 'YYYY') ||
    '-' ||
    lpad(nextval('public.monitoria_invoice_sequence')::text, 6, '0');
$$;

revoke all on function private.next_monitoria_invoice_number()
  from public, anon, authenticated;
grant execute on function private.next_monitoria_invoice_number()
  to service_role;

create or replace function public.calculate_organization_invoice(
  p_organization_id uuid,
  p_camera_plans jsonb,
  p_service_start timestamptz default now(),
  p_service_end timestamptz default (now() + interval '30 days')
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_requested_count integer;
  v_valid_count integer;
  v_subtotal integer;
  v_discount integer;
  v_total integer;
  v_items jsonb;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  if p_camera_plans is null or jsonb_typeof(p_camera_plans) <> 'array' then
    raise exception 'camera_plans_must_be_array';
  end if;

  if p_service_end <= p_service_start then
    raise exception 'invalid_service_period';
  end if;

  v_requested_count := jsonb_array_length(p_camera_plans);
  if v_requested_count < 1 then
    raise exception 'at_least_one_camera_required';
  end if;

  if (
    select count(*)
    from (
      select item->>'cameraId' as camera_id
      from jsonb_array_elements(p_camera_plans) item
      group by item->>'cameraId'
    ) distinct_cameras
  ) <> v_requested_count then
    raise exception 'duplicate_camera_selection';
  end if;

  with requested as (
    select
      (item->>'cameraId')::uuid as camera_id,
      item->>'planCode' as plan_code
    from jsonb_array_elements(p_camera_plans) item
  ),
  valid as (
    select
      requested.camera_id,
      camera.name as camera_name,
      requested.plan_code,
      plan.display_name as plan_name,
      price.id as price_version_id,
      price.amount_cents
    from requested
    join public.cameras camera
      on camera.id = requested.camera_id
     and camera.organization_id = p_organization_id
    join public.camera_plan_catalog plan
      on plan.code = requested.plan_code
     and plan.is_active
    join lateral (
      select current_price.id, current_price.amount_cents
      from public.camera_plan_price_versions current_price
      where current_price.plan_code = requested.plan_code
        and current_price.valid_from <= p_service_start
        and (
          current_price.valid_to is null
          or current_price.valid_to > p_service_start
        )
      order by current_price.valid_from desc
      limit 1
    ) price on true
  )
  select count(*) into v_valid_count from valid;

  if v_valid_count <> v_requested_count then
    raise exception 'invalid_camera_or_plan_selection';
  end if;

  with requested as (
    select
      (item->>'cameraId')::uuid as camera_id,
      item->>'planCode' as plan_code
    from jsonb_array_elements(p_camera_plans) item
  ),
  valid as (
    select
      requested.camera_id,
      camera.name as camera_name,
      requested.plan_code,
      plan.display_name as plan_name,
      price.id as price_version_id,
      price.amount_cents
    from requested
    join public.cameras camera
      on camera.id = requested.camera_id
     and camera.organization_id = p_organization_id
    join public.camera_plan_catalog plan
      on plan.code = requested.plan_code
     and plan.is_active
    join lateral (
      select current_price.id, current_price.amount_cents
      from public.camera_plan_price_versions current_price
      where current_price.plan_code = requested.plan_code
        and current_price.valid_from <= p_service_start
        and (
          current_price.valid_to is null
          or current_price.valid_to > p_service_start
        )
      order by current_price.valid_from desc
      limit 1
    ) price on true
  ),
  ranked as (
    select
      valid.*,
      row_number() over (
        order by valid.amount_cents desc, valid.camera_id
      )::integer as billing_position
    from valid
  ),
  priced as (
    select
      ranked.*,
      coalesce(tier.discount_basis_points, 0) as discount_basis_points,
      round(
        ranked.amount_cents *
        coalesce(tier.discount_basis_points, 0) / 10000.0
      )::integer as discount_amount_cents
    from ranked
    left join lateral (
      select active_tier.discount_basis_points
      from public.volume_discount_tiers active_tier
      where active_tier.is_active
        and ranked.billing_position >= active_tier.minimum_position
        and (
          active_tier.maximum_position is null
          or ranked.billing_position <= active_tier.maximum_position
        )
      order by active_tier.minimum_position desc
      limit 1
    ) tier on true
  )
  select
    coalesce(sum(amount_cents), 0)::integer,
    coalesce(sum(discount_amount_cents), 0)::integer,
    coalesce(sum(amount_cents - discount_amount_cents), 0)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'cameraId', camera_id,
          'cameraName', camera_name,
          'planCode', plan_code,
          'planName', plan_name,
          'priceVersionId', price_version_id,
          'billingPosition', billing_position,
          'baseAmountCents', amount_cents,
          'discountBasisPoints', discount_basis_points,
          'discountAmountCents', discount_amount_cents,
          'totalAmountCents', amount_cents - discount_amount_cents
        )
        order by billing_position
      ),
      '[]'::jsonb
    )
  into v_subtotal, v_discount, v_total, v_items
  from priced;

  return jsonb_build_object(
    'calculationVersion', 'volume-marginal-v1',
    'organizationId', p_organization_id,
    'currency', 'BRL',
    'serviceStart', p_service_start,
    'serviceEnd', p_service_end,
    'subtotalCents', v_subtotal,
    'discountCents', v_discount,
    'totalCents', v_total,
    'cameraCount', v_requested_count,
    'items', v_items
  );
end;
$$;

revoke all on function public.calculate_organization_invoice(
  uuid, jsonb, timestamptz, timestamptz
) from public, anon;
grant execute on function public.calculate_organization_invoice(
  uuid, jsonb, timestamptz, timestamptz
) to authenticated, service_role;

create or replace function public.create_organization_draft_invoice(
  p_organization_id uuid,
  p_camera_plans jsonb,
  p_service_start timestamptz default now(),
  p_service_end timestamptz default (now() + interval '30 days')
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calculation jsonb;
  v_invoice_id uuid;
  v_invoice_number text;
  v_item jsonb;
  v_item_id uuid;
  v_existing_plan text;
  v_existing_status public.camera_subscription_status;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  v_calculation := public.calculate_organization_invoice(
    p_organization_id,
    p_camera_plans,
    p_service_start,
    p_service_end
  );

  update public.billing_invoices
  set status = 'void',
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'voidReason', 'replaced_by_new_draft'
      )
  where organization_id = p_organization_id
    and status = 'draft';

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
    p_service_start,
    p_service_end,
    (v_calculation->>'subtotalCents')::integer,
    (v_calculation->>'discountCents')::integer,
    0,
    (v_calculation->>'totalCents')::integer,
    (select auth.uid()),
    jsonb_build_object('phase', 'commercial_foundation')
  )
  returning id into v_invoice_id;

  for v_item in
    select value from jsonb_array_elements(v_calculation->'items')
  loop
    insert into public.billing_invoice_items (
      invoice_id,
      organization_id,
      camera_id,
      plan_code,
      price_version_id,
      item_type,
      description,
      quantity,
      billing_position,
      base_amount_cents,
      discount_basis_points,
      discount_amount_cents,
      total_amount_cents,
      service_start,
      service_end,
      metadata
    )
    values (
      v_invoice_id,
      p_organization_id,
      (v_item->>'cameraId')::uuid,
      v_item->>'planCode',
      (v_item->>'priceVersionId')::uuid,
      'camera_subscription',
      (v_item->>'cameraName') || ' — ' || (v_item->>'planName'),
      1,
      (v_item->>'billingPosition')::integer,
      (v_item->>'baseAmountCents')::integer,
      (v_item->>'discountBasisPoints')::integer,
      (v_item->>'discountAmountCents')::integer,
      (v_item->>'totalAmountCents')::integer,
      p_service_start,
      p_service_end,
      jsonb_build_object('calculationVersion', 'volume-marginal-v1')
    )
    returning id into v_item_id;

    select subscription.plan_code, subscription.status
      into v_existing_plan, v_existing_status
    from public.camera_subscriptions subscription
    where subscription.camera_id = (v_item->>'cameraId')::uuid;

    if not found then
      insert into public.camera_subscriptions (
        camera_id,
        organization_id,
        plan_code,
        price_version_id,
        status,
        metadata
      )
      values (
        (v_item->>'cameraId')::uuid,
        p_organization_id,
        v_item->>'planCode',
        (v_item->>'priceVersionId')::uuid,
        'pending_payment',
        jsonb_build_object('draftInvoiceId', v_invoice_id)
      );

      insert into public.camera_subscription_changes (
        organization_id,
        camera_id,
        invoice_item_id,
        change_type,
        from_plan_code,
        to_plan_code,
        status,
        requested_by,
        metadata
      )
      values (
        p_organization_id,
        (v_item->>'cameraId')::uuid,
        v_item_id,
        'activate',
        null,
        v_item->>'planCode',
        'pending_payment',
        (select auth.uid()),
        jsonb_build_object('draftInvoiceId', v_invoice_id)
      );
    elsif v_existing_status = 'pending_payment' then
      update public.camera_subscriptions
      set plan_code = v_item->>'planCode',
          price_version_id = (v_item->>'priceVersionId')::uuid,
          metadata = metadata || jsonb_build_object(
            'draftInvoiceId', v_invoice_id
          ),
          updated_at = now()
      where camera_id = (v_item->>'cameraId')::uuid;

      update public.camera_subscription_changes
      set status = 'cancelled',
          updated_at = now(),
          metadata = metadata || jsonb_build_object(
            'cancelReason', 'replaced_by_new_draft'
          )
      where camera_id = (v_item->>'cameraId')::uuid
        and status = 'pending_payment';

      insert into public.camera_subscription_changes (
        organization_id,
        camera_id,
        invoice_item_id,
        change_type,
        from_plan_code,
        to_plan_code,
        status,
        requested_by,
        metadata
      )
      values (
        p_organization_id,
        (v_item->>'cameraId')::uuid,
        v_item_id,
        'activate',
        null,
        v_item->>'planCode',
        'pending_payment',
        (select auth.uid()),
        jsonb_build_object('draftInvoiceId', v_invoice_id)
      );
    elsif v_existing_plan is distinct from (v_item->>'planCode') then
      update public.camera_subscription_changes
      set status = 'cancelled',
          updated_at = now(),
          metadata = metadata || jsonb_build_object(
            'cancelReason', 'replaced_by_new_draft'
          )
      where camera_id = (v_item->>'cameraId')::uuid
        and status in ('pending_payment', 'scheduled');

      insert into public.camera_subscription_changes (
        organization_id,
        camera_id,
        invoice_item_id,
        change_type,
        from_plan_code,
        to_plan_code,
        status,
        effective_at,
        requested_by,
        metadata
      )
      values (
        p_organization_id,
        (v_item->>'cameraId')::uuid,
        v_item_id,
        case
          when (v_item->>'baseAmountCents')::integer >
               (
                 select amount_cents
                 from public.camera_plan_price_versions
                 where id = (
                   select price_version_id
                   from public.camera_subscriptions
                   where camera_id = (v_item->>'cameraId')::uuid
                 )
               )
          then 'upgrade'
          else 'downgrade'
        end,
        v_existing_plan,
        v_item->>'planCode',
        'pending_payment',
        null,
        (select auth.uid()),
        jsonb_build_object('draftInvoiceId', v_invoice_id)
      );
    end if;
  end loop;

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
    'volume-marginal-v1',
    jsonb_build_object(
      'cameraPlans', p_camera_plans,
      'serviceStart', p_service_start,
      'serviceEnd', p_service_end
    ),
    v_calculation
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
    'billing.draft_invoice_created',
    'billing_invoice',
    v_invoice_id::text,
    jsonb_build_object(
      'invoiceNumber', v_invoice_number,
      'totalCents', v_calculation->>'totalCents',
      'cameraCount', v_calculation->>'cameraCount'
    )
  );

  return v_calculation || jsonb_build_object(
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'status', 'draft'
  );
end;
$$;

revoke all on function public.create_organization_draft_invoice(
  uuid, jsonb, timestamptz, timestamptz
) from public, anon;
grant execute on function public.create_organization_draft_invoice(
  uuid, jsonb, timestamptz, timestamptz
) to authenticated, service_role;

create or replace function public.resolve_camera_entitlement(
  p_camera_id uuid
)
returns table (
  camera_id uuid,
  organization_id uuid,
  access_source text,
  monitoring_allowed boolean,
  plan_code text,
  period_starts_at timestamptz,
  period_ends_at timestamptz,
  grace_ends_at timestamptz,
  metadata_retention_days smallint,
  long_term_keyframes smallint,
  temporary_frame_days smallint,
  clip_enabled boolean,
  clip_duration_seconds smallint,
  clip_retention_days smallint,
  assistant_access_allowed boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_plan public.camera_plan_catalog%rowtype;
  v_source text := 'blocked';
  v_monitoring boolean := false;
  v_plan_code text := null;
  v_starts_at timestamptz := null;
  v_ends_at timestamptz := null;
  v_grace_ends_at timestamptz := null;
  v_assistant_allowed boolean := false;
  v_reason text := 'plan_not_selected';
begin
  select camera.organization_id
    into v_organization_id
  from public.cameras camera
  where camera.id = p_camera_id;

  if not found then
    raise exception 'camera_not_found';
  end if;

  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or private.is_org_member(v_organization_id)
  ) then
    raise exception 'not_authorized';
  end if;

  select subscription.*
    into v_subscription
  from public.camera_subscriptions subscription
  where subscription.camera_id = p_camera_id;

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.organization_id = v_organization_id
    and trial.camera_id = p_camera_id;

  if v_subscription.status = 'active'
     and v_subscription.current_period_end > now() then
    v_source := 'subscription';
    v_monitoring := true;
    v_plan_code := v_subscription.plan_code;
    v_starts_at := v_subscription.current_period_start;
    v_ends_at := v_subscription.current_period_end;
    v_assistant_allowed := true;
    v_reason := 'active_subscription';
  elsif v_subscription.status = 'grace_period'
        and v_subscription.grace_ends_at > now() then
    v_source := 'grace_period';
    v_monitoring := true;
    v_plan_code := v_subscription.plan_code;
    v_starts_at := v_subscription.current_period_start;
    v_ends_at := v_subscription.current_period_end;
    v_grace_ends_at := v_subscription.grace_ends_at;
    v_assistant_allowed := true;
    v_reason := 'payment_grace_period';
  elsif v_trial.status = 'running'
        and v_trial.capture_ends_at > now() then
    v_source := 'trial';
    v_monitoring := true;
    v_plan_code := v_trial.selected_plan_code;
    v_starts_at := v_trial.capture_started_at;
    v_ends_at := v_trial.capture_ends_at;
    v_assistant_allowed :=
      v_trial.exploration_ends_at is not null
      and v_trial.exploration_ends_at > now();
    v_reason := 'active_trial';
  else
    v_plan_code := coalesce(
      v_subscription.plan_code,
      v_trial.selected_plan_code
    );

    v_assistant_allowed :=
      v_trial.exploration_ends_at is not null
      and v_trial.exploration_ends_at > now()
      and v_trial.status in (
        'running'::public.trial_run_status,
        'capture_completed'::public.trial_run_status,
        'exploration'::public.trial_run_status
      );

    if v_assistant_allowed then
      v_reason := 'trial_exploration_only';
    elsif v_plan_code is not null then
      v_reason := 'payment_required';
    end if;
  end if;

  if v_plan_code is not null then
    select plan.*
      into v_plan
    from public.camera_plan_catalog plan
    where plan.code = v_plan_code;
  end if;

  return query
  select
    p_camera_id,
    v_organization_id,
    v_source,
    v_monitoring,
    v_plan_code,
    v_starts_at,
    v_ends_at,
    v_grace_ends_at,
    v_plan.metadata_retention_days,
    v_plan.long_term_keyframes,
    v_plan.temporary_frame_days,
    coalesce(v_plan.clip_enabled, false),
    v_plan.clip_duration_seconds,
    v_plan.clip_retention_days,
    v_assistant_allowed,
    v_reason;
end;
$$;

revoke all on function public.resolve_camera_entitlement(uuid)
  from public, anon;
grant execute on function public.resolve_camera_entitlement(uuid)
  to authenticated, service_role;

create or replace view public.camera_entitlements
with (security_invoker = true)
as
select
  camera.id as camera_id,
  camera.organization_id,
  entitlement.access_source,
  entitlement.monitoring_allowed,
  entitlement.plan_code,
  entitlement.period_starts_at,
  entitlement.period_ends_at,
  entitlement.grace_ends_at,
  entitlement.metadata_retention_days,
  entitlement.long_term_keyframes,
  entitlement.temporary_frame_days,
  entitlement.clip_enabled,
  entitlement.clip_duration_seconds,
  entitlement.clip_retention_days,
  entitlement.assistant_access_allowed,
  entitlement.reason
from public.cameras camera
cross join lateral public.resolve_camera_entitlement(camera.id) entitlement;

create or replace function public.renew_assistant_allowance(
  p_organization_id uuid,
  p_source public.assistant_allowance_source,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_included_interactions integer,
  p_source_reference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowance_id uuid;
begin
  if not private.monitoria_billing_manager(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  if p_period_end <= p_period_start then
    raise exception 'invalid_allowance_period';
  end if;

  if p_included_interactions < 0 then
    raise exception 'invalid_allowance_amount';
  end if;

  insert into public.assistant_allowances (
    organization_id,
    source,
    source_reference_id,
    period_start,
    period_end,
    included_interactions,
    used_interactions,
    expires_at
  )
  values (
    p_organization_id,
    p_source,
    p_source_reference_id,
    p_period_start,
    p_period_end,
    p_included_interactions,
    0,
    p_period_end
  )
  on conflict (organization_id, source, period_start)
  do update set
    source_reference_id = excluded.source_reference_id,
    period_end = excluded.period_end,
    included_interactions = excluded.included_interactions,
    used_interactions = least(
      public.assistant_allowances.used_interactions,
      excluded.included_interactions
    ),
    expires_at = excluded.expires_at,
    updated_at = now()
  returning id into v_allowance_id;

  return v_allowance_id;
end;
$$;

revoke all on function public.renew_assistant_allowance(
  uuid, public.assistant_allowance_source, timestamptz, timestamptz, integer, uuid
) from public, anon;
grant execute on function public.renew_assistant_allowance(
  uuid, public.assistant_allowance_source, timestamptz, timestamptz, integer, uuid
) to authenticated, service_role;

create or replace function public.record_assistant_interaction(
  p_organization_id uuid,
  p_request_key text,
  p_model text default null,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_estimated_cost_usd numeric default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.assistant_usage_events%rowtype;
  v_allowance public.assistant_allowances%rowtype;
  v_usage_id uuid;
begin
  if not (
    coalesce((select auth.role()), '') = 'service_role'
    or private.is_org_member(p_organization_id)
  ) then
    raise exception 'not_authorized';
  end if;

  if p_request_key is null or char_length(btrim(p_request_key)) < 8 then
    raise exception 'invalid_request_key';
  end if;

  select *
    into v_existing
  from public.assistant_usage_events usage_event
  where usage_event.organization_id = p_organization_id
    and usage_event.request_key = p_request_key;

  if found then
    return jsonb_build_object(
      'usageEventId', v_existing.id,
      'duplicate', true,
      'remainingInteractions', (
        select greatest(allowance.included_interactions - allowance.used_interactions, 0)
        from public.assistant_allowances allowance
        where allowance.id = v_existing.allowance_id
      )
    );
  end if;

  select allowance.*
    into v_allowance
  from public.assistant_allowances allowance
  where allowance.organization_id = p_organization_id
    and allowance.period_start <= now()
    and allowance.period_end > now()
    and allowance.expires_at > now()
    and allowance.used_interactions < allowance.included_interactions
  order by
    case allowance.source
      when 'trial' then 1
      when 'subscription' then 2
      else 3
    end,
    allowance.period_end
  for update skip locked
  limit 1;

  if not found then
    raise exception 'assistant_allowance_exhausted';
  end if;

  update public.assistant_allowances
  set used_interactions = used_interactions + 1,
      updated_at = now()
  where id = v_allowance.id;

  insert into public.assistant_usage_events (
    organization_id,
    allowance_id,
    request_key,
    model,
    input_tokens,
    output_tokens,
    estimated_cost_usd,
    status,
    metadata
  )
  values (
    p_organization_id,
    v_allowance.id,
    p_request_key,
    p_model,
    greatest(coalesce(p_input_tokens, 0), 0),
    greatest(coalesce(p_output_tokens, 0), 0),
    p_estimated_cost_usd,
    'completed',
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_usage_id;

  if v_allowance.source = 'trial' then
    update public.trial_runs
    set interactions_used = least(interactions_used + 1, interaction_limit),
        updated_at = now()
    where organization_id = p_organization_id;
  end if;

  return jsonb_build_object(
    'usageEventId', v_usage_id,
    'duplicate', false,
    'remainingInteractions',
      greatest(
        v_allowance.included_interactions -
        v_allowance.used_interactions - 1,
        0
      )
  );
end;
$$;

revoke all on function public.record_assistant_interaction(
  uuid, text, text, integer, integer, numeric, jsonb
) from public, anon;
grant execute on function public.record_assistant_interaction(
  uuid, text, text, integer, integer, numeric, jsonb
) to authenticated, service_role;

create or replace function public.expire_camera_subscriptions()
returns table (
  subscriptions_in_grace bigint,
  subscriptions_suspended bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace bigint := 0;
  v_suspended bigint := 0;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  update public.camera_subscriptions subscription
  set status = 'grace_period',
      grace_ends_at = subscription.current_period_end +
        pg_catalog.make_interval(days => account.grace_period_days),
      updated_at = now()
  from public.billing_accounts account
  where account.organization_id = subscription.organization_id
    and subscription.status = 'active'
    and subscription.current_period_end <= now()
    and account.grace_period_days > 0;

  get diagnostics v_grace = row_count;

  update public.camera_subscriptions
  set status = 'suspended',
      suspended_at = now(),
      updated_at = now()
  where status in ('active', 'grace_period')
    and coalesce(grace_ends_at, current_period_end) <= now();

  get diagnostics v_suspended = row_count;

  return query select v_grace, v_suspended;
end;
$$;

revoke all on function public.expire_camera_subscriptions()
  from public, anon, authenticated;
grant execute on function public.expire_camera_subscriptions()
  to service_role;
