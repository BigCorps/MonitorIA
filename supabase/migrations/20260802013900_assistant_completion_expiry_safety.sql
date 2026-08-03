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
  v_release_reason text;
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
      'success', true,
      'usageEventId', v_usage.id,
      'duplicate', true,
      'balance', private.assistant_balance_snapshot(v_usage.organization_id)
    );
  end if;

  if v_usage.status <> 'reserved' then
    return jsonb_build_object(
      'success', false,
      'usageEventId', v_usage.id,
      'status', v_usage.status,
      'reason', 'assistant_reservation_not_active',
      'balance', private.assistant_balance_snapshot(v_usage.organization_id)
    );
  end if;

  if v_usage.reservation_expires_at <= now() then
    v_release_reason := 'reservation_expired';
  elsif v_usage.allowance_id is not null then
    select allowance.*
      into v_allowance
    from public.assistant_allowances allowance
    where allowance.id = v_usage.allowance_id
    for update;

    if not found
       or v_allowance.period_end <= now()
       or v_allowance.expires_at <= now()
       or v_allowance.used_interactions >= v_allowance.included_interactions then
      v_release_reason := 'allowance_unavailable_at_completion';
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
      v_release_reason := 'purchase_unavailable_at_completion';
    end if;
  end if;

  if v_release_reason is not null then
    update public.assistant_usage_events
    set status = 'released',
        response_message_id = coalesce(
          p_response_message_id,
          response_message_id
        ),
        model = coalesce(p_model, model),
        input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
        output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
        estimated_cost_usd = p_estimated_cost_usd,
        released_at = now(),
        release_reason = v_release_reason,
        reservation_expires_at = null,
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb)
    where id = v_usage.id;

    return jsonb_build_object(
      'success', false,
      'usageEventId', v_usage.id,
      'status', 'released',
      'reason', v_release_reason,
      'balance', private.assistant_balance_snapshot(v_usage.organization_id)
    );
  end if;

  if v_usage.allowance_id is not null then
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
    v_balance := v_purchase.remaining_interactions - 1;

    update public.assistant_credit_purchases
    set remaining_interactions = v_balance,
        status = case
          when v_balance = 0 then 'consumed'
          else status
        end,
        consumed_at = case
          when v_balance = 0 then now()
          else consumed_at
        end
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
    'success', true,
    'usageEventId', v_usage.id,
    'duplicate', false,
    'balance', private.assistant_balance_snapshot(v_usage.organization_id)
  );
end;
$$;

revoke all on function private.complete_assistant_interaction(
  uuid, uuid, text, integer, integer, numeric, jsonb
) from public, anon, authenticated;
grant execute on function private.complete_assistant_interaction(
  uuid, uuid, text, integer, integer, numeric, jsonb
) to service_role;
