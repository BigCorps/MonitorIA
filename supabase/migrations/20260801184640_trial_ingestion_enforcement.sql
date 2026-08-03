-- Proteção da ingestão: somente jobs provenientes do Agent são submetidos ao
-- entitlement comercial. Jobs internos sem source_agent_id/agent_event_id
-- continuam disponíveis para manutenção e ferramentas administrativas.
create or replace function private.enforce_monitoria_analysis_entitlement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    from public.trial_runs trial
    where trial.organization_id = new.organization_id
      and trial.camera_id = new.camera_id
      and trial.capture_started_at is not null
      and trial.capture_ends_at is not null
      and new.started_at >= trial.capture_started_at
      and new.started_at <= trial.capture_ends_at
      and trial.status in ('running', 'capture_completed', 'exploration');

    if found then
      v_plan_code := v_trial.selected_plan_code;
      new.trial_run_id := v_trial.id;
    end if;
  end if;

  if v_plan_code is null then
    raise exception 'camera_monitoring_not_allowed';
  end if;

  new.analysis_plan_code := v_plan_code;
  return new;
end;
$$;

revoke all on function private.enforce_monitoria_analysis_entitlement()
  from public, anon, authenticated;
grant execute on function private.enforce_monitoria_analysis_entitlement()
  to service_role;

drop trigger if exists trg_analysis_jobs_enforce_entitlement
  on public.analysis_jobs;
create trigger trg_analysis_jobs_enforce_entitlement
before insert on public.analysis_jobs
for each row execute function private.enforce_monitoria_analysis_entitlement();

create or replace function private.propagate_monitoria_trial_run_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'events' then
    if new.trial_run_id is null and new.analysis_job_id is not null then
      select job.trial_run_id
        into new.trial_run_id
      from public.analysis_jobs job
      where job.id = new.analysis_job_id;
    end if;
  elsif tg_table_name = 'storage_assets' then
    if new.trial_run_id is null and new.analysis_job_id is not null then
      select job.trial_run_id
        into new.trial_run_id
      from public.analysis_jobs job
      where job.id = new.analysis_job_id;
    end if;

    if new.trial_run_id is null and new.event_id is not null then
      select event.trial_run_id
        into new.trial_run_id
      from public.events event
      where event.id = new.event_id;
    end if;

    if new.trial_run_id is not null then
      select least(
        coalesce(new.expires_at, trial.purge_after),
        trial.purge_after
      )
        into new.expires_at
      from public.trial_runs trial
      where trial.id = new.trial_run_id
        and trial.purge_after is not null;
    end if;
  elsif tg_table_name = 'usage_events' then
    if new.trial_run_id is null and new.analysis_job_id is not null then
      select job.trial_run_id
        into new.trial_run_id
      from public.analysis_jobs job
      where job.id = new.analysis_job_id;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.propagate_monitoria_trial_run_id()
  from public, anon, authenticated;
grant execute on function private.propagate_monitoria_trial_run_id()
  to service_role;

drop trigger if exists trg_events_trial_run_id on public.events;
create trigger trg_events_trial_run_id
before insert on public.events
for each row execute function private.propagate_monitoria_trial_run_id();

drop trigger if exists trg_storage_assets_trial_run_id on public.storage_assets;
create trigger trg_storage_assets_trial_run_id
before insert on public.storage_assets
for each row execute function private.propagate_monitoria_trial_run_id();

drop trigger if exists trg_usage_events_trial_run_id on public.usage_events;
create trigger trg_usage_events_trial_run_id
before insert on public.usage_events
for each row execute function private.propagate_monitoria_trial_run_id();
