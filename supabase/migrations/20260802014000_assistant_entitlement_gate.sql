create or replace function private.assistant_service_access_allowed(
  p_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not private.assistant_commercial_enforcement_enabled(p_organization_id)
    or exists (
      select 1
      from public.trial_runs trial
      where trial.organization_id = p_organization_id
        and trial.status in ('running','capture_completed','exploration')
        and trial.exploration_ends_at > now()
    )
    or exists (
      select 1
      from public.camera_subscriptions subscription
      where subscription.organization_id = p_organization_id
        and (
          (
            subscription.status in (
              'active','change_scheduled','cancel_at_period_end'
            )
            and subscription.current_period_end > now()
          )
          or (
            subscription.status = 'grace_period'
            and subscription.grace_ends_at > now()
          )
        )
    )
    or exists (
      select 1
      from public.assistant_allowances allowance
      where allowance.organization_id = p_organization_id
        and allowance.source = 'manual'
        and allowance.period_start <= now()
        and allowance.period_end > now()
        and allowance.expires_at > now()
    );
$$;

revoke all on function private.assistant_service_access_allowed(uuid)
from public, anon, authenticated;
grant execute on function private.assistant_service_access_allowed(uuid)
to service_role;

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
  v_service_access boolean;
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
  v_service_access := private.assistant_service_access_allowed(
    p_organization_id
  );

  select
    coalesce(sum(allowance.included_interactions), 0)::integer,
    coalesce(sum(allowance.used_interactions), 0)::integer,
    coalesce(sum((
      select count(*)
      from public.assistant_usage_events usage_event
      where usage_event.allowance_id = allowance.id
        and usage_event.status = 'reserved'
        and usage_event.reservation_expires_at > now()
    )), 0)::integer,
    min(allowance.period_end),
    coalesce((
      array_agg(
        allowance.source::text
        order by
          case allowance.source
            when 'trial' then 1
            when 'subscription' then 2
            else 3
          end,
          allowance.period_end
      )
    )[1], 'none')
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
    coalesce(sum((
      select count(*)
      from public.assistant_usage_events usage_event
      where usage_event.purchase_id = purchase.id
        and usage_event.status = 'reserved'
        and usage_event.reservation_expires_at > now()
    )), 0)::integer,
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
    'serviceAccessAllowed', v_service_access,
    'blockReason', case
      when v_legacy then null
      when not v_service_access then 'subscription_or_trial_required'
      when v_included_remaining + v_purchased_remaining <= 0
        then 'assistant_allowance_exhausted'
      else null
    end,
    'accessSource', case
      when v_legacy then 'legacy'
      else v_source
    end,
    'unlimited', v_legacy,
    'accessAllowed',
      v_service_access
      and (
        v_legacy
        or v_included_remaining + v_purchased_remaining > 0
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

create or replace function private.reserve_assistant_interaction(
  p_organization_id uuid,
  p_request_key text,
  p_thread_id uuid default null,
  p_message_id uuid default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.assistant_usage_events%rowtype;
  v_allowance public.assistant_allowances%rowtype;
  v_purchase public.assistant_credit_purchases%rowtype;
  v_reserved integer;
  v_usage_id uuid;
  v_enforcement boolean;
begin
  if p_request_key is null or char_length(btrim(p_request_key)) < 8 then
    raise exception 'invalid_request_key';
  end if;

  select usage_event.*
    into v_existing
  from public.assistant_usage_events usage_event
  where usage_event.organization_id = p_organization_id
    and usage_event.request_key = p_request_key;

  if found then
    return v_existing.id;
  end if;

  v_enforcement := private.assistant_commercial_enforcement_enabled(
    p_organization_id
  );

  if not v_enforcement then
    insert into public.assistant_usage_events (
      organization_id, request_key, thread_id, message_id,
      actor_user_id, status, consumption_source, reserved_at,
      reservation_expires_at, metadata
    ) values (
      p_organization_id, p_request_key, p_thread_id, p_message_id,
      p_actor_user_id, 'reserved', 'legacy', now(),
      now() + interval '10 minutes', coalesce(p_metadata, '{}'::jsonb)
    ) returning id into v_usage_id;
    return v_usage_id;
  end if;

  if not private.assistant_service_access_allowed(p_organization_id) then
    raise exception 'assistant_access_not_entitled';
  end if;

  for v_allowance in
    select allowance.*
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
      allowance.period_end,
      allowance.created_at
    for update
  loop
    select count(*)::integer
      into v_reserved
    from public.assistant_usage_events usage_event
    where usage_event.allowance_id = v_allowance.id
      and usage_event.status = 'reserved'
      and usage_event.reservation_expires_at > now();

    if v_allowance.included_interactions
       - v_allowance.used_interactions
       - v_reserved > 0 then
      insert into public.assistant_usage_events (
        organization_id, allowance_id, request_key, thread_id,
        message_id, actor_user_id, status, consumption_source,
        reserved_at, reservation_expires_at, metadata
      ) values (
        p_organization_id, v_allowance.id, p_request_key, p_thread_id,
        p_message_id, p_actor_user_id, 'reserved',
        case
          when v_allowance.source = 'trial' then 'trial'
          when v_allowance.source = 'subscription' then 'subscription'
          else 'manual'
        end,
        now(), now() + interval '10 minutes',
        coalesce(p_metadata, '{}'::jsonb)
      ) returning id into v_usage_id;
      return v_usage_id;
    end if;
  end loop;

  for v_purchase in
    select purchase.*
    from public.assistant_credit_purchases purchase
    where purchase.organization_id = p_organization_id
      and purchase.status = 'active'
      and purchase.activated_at is not null
      and purchase.valid_until > now()
      and purchase.remaining_interactions > 0
    order by purchase.valid_until, purchase.created_at, purchase.id
    for update
  loop
    select count(*)::integer
      into v_reserved
    from public.assistant_usage_events usage_event
    where usage_event.purchase_id = v_purchase.id
      and usage_event.status = 'reserved'
      and usage_event.reservation_expires_at > now();

    if v_purchase.remaining_interactions - v_reserved > 0 then
      insert into public.assistant_usage_events (
        organization_id, purchase_id, request_key, thread_id,
        message_id, actor_user_id, status, consumption_source,
        reserved_at, reservation_expires_at, metadata
      ) values (
        p_organization_id, v_purchase.id, p_request_key, p_thread_id,
        p_message_id, p_actor_user_id, 'reserved', 'purchase',
        now(), now() + interval '10 minutes',
        coalesce(p_metadata, '{}'::jsonb)
      ) returning id into v_usage_id;
      return v_usage_id;
    end if;
  end loop;

  raise exception 'assistant_allowance_exhausted';
end;
$$;

revoke all on function private.reserve_assistant_interaction(
  uuid, text, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
grant execute on function private.reserve_assistant_interaction(
  uuid, text, uuid, uuid, uuid, jsonb
) to service_role;
