-- MonitorIA — corrige enforcement de analysis_jobs para trial multicâmera.
-- Aplicado em produção via MCP em 2026-08-21.
--
-- Mantém assinatura/grace period; aceita trial_run_cameras para sales_assisted;
-- preserva fallback trial_runs.camera_id para self_service e legado; e permite
-- que eventos capturados dentro da janela sejam enviados depois durante a
-- exploração, sem perder backlog local.

create or replace function private.enforce_monitoria_analysis_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_enforcement boolean := true;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_plan_code text;
begin
  if new.source_agent_id is null and new.agent_event_id is null then
    return new;
  end if;

  select coalesce(account.entitlement_enforcement_enabled, true)
    into v_enforcement
  from public.billing_accounts account
  where account.organization_id = new.organization_id;

  if not coalesce(v_enforcement, true) then
    return new;
  end if;

  select subscription.*
    into v_subscription
  from public.camera_subscriptions subscription
  where subscription.camera_id = new.camera_id;

  if v_subscription.status = 'active'
     and v_subscription.current_period_end > now() then
    v_plan_code := v_subscription.plan_code;
  elsif v_subscription.status = 'grace_period'
        and v_subscription.grace_ends_at > now() then
    v_plan_code := v_subscription.plan_code;
  else
    select trial.*
      into v_trial
    from public.trial_run_cameras participant
    join public.trial_runs trial
      on trial.id = participant.trial_run_id
    where participant.camera_id = new.camera_id
      and participant.organization_id = new.organization_id
      and participant.status <> 'removed'
      and trial.organization_id = new.organization_id
      and trial.capture_started_at is not null
      and trial.capture_ends_at is not null
      and new.started_at >= trial.capture_started_at
      and new.started_at <= trial.capture_ends_at
      and trial.status in ('running', 'capture_completed', 'exploration')
    order by trial.created_at desc
    limit 1;

    if found then
      select coalesce(participant.selected_plan_code, v_trial.selected_plan_code)
        into v_plan_code
      from public.trial_run_cameras participant
      where participant.trial_run_id = v_trial.id
        and participant.camera_id = new.camera_id
        and participant.organization_id = new.organization_id
        and participant.status <> 'removed'
      limit 1;

      new.trial_run_id := v_trial.id;
    else
      select trial.*
        into v_trial
      from public.trial_runs trial
      where trial.organization_id = new.organization_id
        and trial.camera_id = new.camera_id
        and trial.capture_started_at is not null
        and trial.capture_ends_at is not null
        and new.started_at >= trial.capture_started_at
        and new.started_at <= trial.capture_ends_at
        and trial.status in ('running', 'capture_completed', 'exploration')
      order by trial.created_at desc
      limit 1;

      if found then
        v_plan_code := v_trial.selected_plan_code;
        new.trial_run_id := v_trial.id;
      end if;
    end if;
  end if;

  if v_plan_code is null then
    raise exception 'camera_monitoring_not_allowed';
  end if;

  new.analysis_plan_code := v_plan_code;
  return new;
end;
$function$;

revoke all on function private.enforce_monitoria_analysis_entitlement()
  from public, anon, authenticated;
