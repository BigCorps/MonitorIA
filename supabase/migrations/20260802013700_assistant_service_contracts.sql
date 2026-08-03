-- MonitorIA Fase 6 — contratos de backend para dashboard, MCP e canais futuros

create or replace function public.reserve_assistant_interaction(
  p_organization_id uuid,
  p_request_key text,
  p_thread_id uuid default null,
  p_message_id uuid default null,
  p_actor_user_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usage_id uuid;
begin
  perform private.require_monitoria_service_role();

  v_usage_id := private.reserve_assistant_interaction(
    p_organization_id,
    p_request_key,
    p_thread_id,
    p_message_id,
    p_actor_user_id,
    p_metadata
  );

  return jsonb_build_object(
    'usageEventId', v_usage_id,
    'balance', private.assistant_balance_snapshot(p_organization_id)
  );
end;
$$;

create or replace function public.complete_assistant_interaction(
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
begin
  perform private.require_monitoria_service_role();

  return private.complete_assistant_interaction(
    p_usage_event_id,
    p_response_message_id,
    p_model,
    p_input_tokens,
    p_output_tokens,
    p_estimated_cost_usd,
    p_metadata
  );
end;
$$;

create or replace function public.release_assistant_interaction(
  p_usage_event_id uuid,
  p_reason text default 'request_failed',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_released boolean;
begin
  perform private.require_monitoria_service_role();

  select usage_event.organization_id
    into v_organization_id
  from public.assistant_usage_events usage_event
  where usage_event.id = p_usage_event_id;

  if v_organization_id is null then
    raise exception 'assistant_usage_event_not_found';
  end if;

  v_released := private.release_assistant_interaction(
    p_usage_event_id,
    p_reason,
    p_metadata
  );

  return jsonb_build_object(
    'usageEventId', p_usage_event_id,
    'released', v_released,
    'balance', private.assistant_balance_snapshot(v_organization_id)
  );
end;
$$;

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
  v_usage_id uuid;
  v_existing public.assistant_usage_events%rowtype;
begin
  perform private.require_monitoria_service_role();

  select usage_event.*
    into v_existing
  from public.assistant_usage_events usage_event
  where usage_event.organization_id = p_organization_id
    and usage_event.request_key = p_request_key;

  if found and v_existing.status = 'completed' then
    return jsonb_build_object(
      'usageEventId', v_existing.id,
      'duplicate', true,
      'balance', private.assistant_balance_snapshot(p_organization_id)
    );
  end if;

  if found and v_existing.status = 'reserved' then
    v_usage_id := v_existing.id;
  elsif found then
    raise exception 'assistant_request_key_not_reusable';
  else
    v_usage_id := private.reserve_assistant_interaction(
      p_organization_id,
      p_request_key,
      null,
      null,
      null,
      coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
        'recordOrigin', 'record_assistant_interaction'
      )
    );
  end if;

  return private.complete_assistant_interaction(
    v_usage_id,
    null,
    p_model,
    p_input_tokens,
    p_output_tokens,
    p_estimated_cost_usd,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.process_assistant_commercial_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reservations jsonb;
  v_purchases jsonb;
begin
  perform private.require_monitoria_service_role();

  v_reservations := public.expire_assistant_reservations();
  v_purchases := public.process_assistant_credit_expirations();

  return jsonb_build_object(
    'success', true,
    'reservations', v_reservations,
    'credits', v_purchases,
    'processedAt', now()
  );
end;
$$;

revoke all on function public.reserve_assistant_interaction(
  uuid, text, uuid, uuid, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.complete_assistant_interaction(
  uuid, uuid, text, integer, integer, numeric, jsonb
) from public, anon, authenticated;
revoke all on function public.release_assistant_interaction(
  uuid, text, jsonb
) from public, anon, authenticated;
revoke all on function public.record_assistant_interaction(
  uuid, text, text, integer, integer, numeric, jsonb
) from public, anon, authenticated;
revoke all on function public.process_assistant_commercial_state()
from public, anon, authenticated;

grant execute on function public.reserve_assistant_interaction(
  uuid, text, uuid, uuid, uuid, jsonb
) to service_role;
grant execute on function public.complete_assistant_interaction(
  uuid, uuid, text, integer, integer, numeric, jsonb
) to service_role;
grant execute on function public.release_assistant_interaction(
  uuid, text, jsonb
) to service_role;
grant execute on function public.record_assistant_interaction(
  uuid, text, text, integer, integer, numeric, jsonb
) to service_role;
grant execute on function public.process_assistant_commercial_state()
to service_role;
