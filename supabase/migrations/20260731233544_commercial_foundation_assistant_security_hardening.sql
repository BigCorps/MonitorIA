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
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service_role_required';
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
) from public, anon, authenticated;
grant execute on function public.renew_assistant_allowance(
  uuid, public.assistant_allowance_source, timestamptz, timestamptz, integer, uuid
) to service_role;

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
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service_role_required';
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
) from public, anon, authenticated;
grant execute on function public.record_assistant_interaction(
  uuid, text, text, integer, integer, numeric, jsonb
) to service_role;
