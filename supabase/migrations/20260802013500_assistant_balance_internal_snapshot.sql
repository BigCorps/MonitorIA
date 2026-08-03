-- MonitorIA Fase 6 — separa snapshot interno da autorização pública

create or replace function private.assistant_balance_snapshot(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_legacy boolean;
  v_included_total integer := 0;
  v_included_used integer := 0;
  v_included_reserved integer := 0;
  v_included_remaining integer := 0;
  v_purchased_total integer := 0;
  v_purchased_reserved integer := 0;
  v_purchased_remaining integer := 0;
  v_next_reset timestamptz;
  v_next_purchase_expiry timestamptz;
  v_source text := 'none';
begin
  v_legacy := not private.assistant_commercial_enforcement_enabled(
    p_organization_id
  );

  select
    coalesce(sum(allowance.included_interactions), 0)::integer,
    coalesce(sum(allowance.used_interactions), 0)::integer,
    coalesce(sum(
      (
        select count(*)
        from public.assistant_usage_events usage_event
        where usage_event.allowance_id = allowance.id
          and usage_event.status = 'reserved'
          and usage_event.reservation_expires_at > now()
      )
    ), 0)::integer,
    min(allowance.period_end),
    coalesce(
      (array_agg(allowance.source::text order by
        case allowance.source
          when 'trial' then 1
          when 'subscription' then 2
          else 3
        end,
        allowance.period_end
      ))[1],
      'none'
    )
  into
    v_included_total,
    v_included_used,
    v_included_reserved,
    v_next_reset,
    v_source
  from public.assistant_allowances allowance
  where allowance.organization_id = p_organization_id
    and allowance.period_start <= now()
    and allowance.period_end > now()
    and allowance.expires_at > now();

  v_included_remaining := greatest(
    v_included_total - v_included_used - v_included_reserved,
    0
  );

  select
    coalesce(sum(purchase.remaining_interactions), 0)::integer,
    coalesce(sum(
      (
        select count(*)
        from public.assistant_usage_events usage_event
        where usage_event.purchase_id = purchase.id
          and usage_event.status = 'reserved'
          and usage_event.reservation_expires_at > now()
      )
    ), 0)::integer,
    min(purchase.valid_until)
  into
    v_purchased_total,
    v_purchased_reserved,
    v_next_purchase_expiry
  from public.assistant_credit_purchases purchase
  where purchase.organization_id = p_organization_id
    and purchase.status = 'active'
    and purchase.activated_at is not null
    and purchase.valid_until > now()
    and purchase.remaining_interactions > 0;

  v_purchased_remaining := greatest(
    v_purchased_total - v_purchased_reserved,
    0
  );

  return jsonb_build_object(
    'organizationId', p_organization_id,
    'enforcementEnabled', not v_legacy,
    'accessSource', case when v_legacy then 'legacy' else v_source end,
    'unlimited', v_legacy,
    'accessAllowed', v_legacy or (
      v_included_remaining + v_purchased_remaining > 0
    ),
    'includedTotal', v_included_total,
    'includedUsed', v_included_used,
    'includedReserved', v_included_reserved,
    'includedRemaining', v_included_remaining,
    'purchasedRemaining', v_purchased_remaining,
    'purchasedReserved', v_purchased_reserved,
    'totalRemaining', case
      when v_legacy then null
      else v_included_remaining + v_purchased_remaining
    end,
    'nextResetAt', v_next_reset,
    'nextPurchasedExpiryAt', v_next_purchase_expiry,
    'calculatedAt', now()
  );
end;
$$;

revoke all on function private.assistant_balance_snapshot(uuid)
from public, anon, authenticated;
grant execute on function private.assistant_balance_snapshot(uuid)
to service_role;

create or replace function public.get_assistant_balance(
  p_organization_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and not private.is_org_member(p_organization_id) then
    raise exception 'not_authorized';
  end if;

  return private.assistant_balance_snapshot(p_organization_id);
end;
$$;

revoke all on function public.get_assistant_balance(uuid)
from public, anon, authenticated;
grant execute on function public.get_assistant_balance(uuid)
to authenticated, service_role;

-- A conclusão é interna e não depende de claims HTTP para calcular o saldo.
create or replace function private.complete_assistant_interaction(
  p_usage_event_id uuid,
  p_response_message_id uuid default null,
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
  v_usage public.assistant_usage_events%rowtype;
  v_allowance public.assistant_allowances%rowtype;
  v_purchase public.assistant_credit_purchases%rowtype;
  v_balance integer;
begin
  select usage_event.*
    into v_usage
  from public.assistant_usage_events usage_event
  where usage_event.id = p_usage_event_id
  for update;

  if not found then
    raise exception 'assistant_usage_event_not_found';
  end if;

  if v_usage.status = 'completed' then
    return jsonb_build_object(
      'usageEventId', v_usage.id,
      'duplicate', true,
      'balance', private.assistant_balance_snapshot(
        v_usage.organization_id
      )
    );
  end if;

  if v_usage.status <> 'reserved' then
    raise exception 'assistant_reservation_not_active';
  end if;

  if v_usage.reservation_expires_at <= now() then
    update public.assistant_usage_events
    set status = 'released',
        released_at = now(),
        release_reason = 'reservation_expired',
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
    where id = v_usage.id;

    raise exception 'assistant_reservation_expired';
  end if;

  if v_usage.allowance_id is not null then
    select allowance.*
      into v_allowance
    from public.assistant_allowances allowance
    where allowance.id = v_usage.allowance_id
    for update;

    if not found
       or v_allowance.period_end <= now()
       or v_allowance.expires_at <= now()
       or v_allowance.used_interactions >= v_allowance.included_interactions then
      raise exception 'assistant_allowance_exhausted';
    end if;

    update public.assistant_allowances
    set used_interactions = used_interactions + 1,
        updated_at = now()
    where id = v_allowance.id;

    if v_allowance.source = 'trial' then
      update public.trial_runs
      set interactions_used = least(
            interactions_used + 1,
            interaction_limit
          ),
          updated_at = now()
      where organization_id = v_usage.organization_id
        and status not in ('converted', 'purged');
    end if;
  elsif v_usage.purchase_id is not null then
    select purchase.*
      into v_purchase
    from public.assistant_credit_purchases purchase
    where purchase.id = v_usage.purchase_id
    for update;

    if not found
       or v_purchase.status <> 'active'
       or v_purchase.valid_until <= now()
       or v_purchase.remaining_interactions <= 0 then
      raise exception 'assistant_credit_purchase_exhausted';
    end if;

    v_balance := v_purchase.remaining_interactions - 1;

    update public.assistant_credit_purchases
    set remaining_interactions = v_balance,
        status = case when v_balance = 0 then 'consumed' else status end,
        consumed_at = case when v_balance = 0 then now() else consumed_at end
    where id = v_purchase.id;

    insert into public.assistant_credit_ledger (
      organization_id,
      purchase_id,
      usage_event_id,
      delta_interactions,
      reason,
      balance_after
    )
    values (
      v_usage.organization_id,
      v_purchase.id,
      v_usage.id,
      -1,
      'assistant_interaction_completed',
      v_balance
    );
  end if;

  update public.assistant_usage_events
  set status = 'completed',
      response_message_id = coalesce(
        p_response_message_id,
        response_message_id
      ),
      model = coalesce(p_model, model),
      input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
      estimated_cost_usd = p_estimated_cost_usd,
      completed_at = now(),
      reservation_expires_at = null,
      metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
  where id = v_usage.id;

  return jsonb_build_object(
    'usageEventId', v_usage.id,
    'duplicate', false,
    'balance', private.assistant_balance_snapshot(
      v_usage.organization_id
    )
  );
end;
$$;

revoke all on function private.complete_assistant_interaction(
  uuid, uuid, text, integer, integer, numeric, jsonb
) from public, anon, authenticated;
grant execute on function private.complete_assistant_interaction(
  uuid, uuid, text, integer, integer, numeric, jsonb
) to service_role;
