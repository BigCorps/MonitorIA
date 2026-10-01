-- MonitorIA VIP — Gate 3: sincronização autoritativa do trial com o Projeto VIP.
-- O relógio continua sendo trial_runs.capture_ends_at; não existe timer paralelo.

create or replace function private.sync_vip_project_from_trial_state_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
  v_status text := new.status::text;
begin
  if new.vip_project_id is null then
    return new;
  end if;

  select project.*
    into v_project
  from public.vip_projects project
  where project.id = new.vip_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if v_project.organization_id is null
     or v_project.organization_id is distinct from new.organization_id then
    raise exception 'vip_trial_organization_mismatch';
  end if;

  if v_status = 'running'
     and old.status::text is distinct from 'running' then
    if v_project.status = 'ready_for_trial' then
      perform public.transition_vip_project(
        v_project.id,
        'trial_running',
        new.started_by,
        null,
        jsonb_build_object(
          'source', 'trial_run_status_trigger',
          'trialRunId', new.id,
          'captureStartedAt', new.capture_started_at,
          'captureEndsAt', new.capture_ends_at
        )
      );
    elsif v_project.status <> 'trial_running' then
      raise exception 'vip_trial_start_project_state_invalid';
    end if;
  end if;

  if v_status = any(array[
       'capture_completed'::text,
       'exploration'::text,
       'expired'::text,
       'purged'::text,
       'converted'::text
     ])
     and old.status::text is distinct from v_status then
    if v_project.status = 'trial_running' then
      perform public.transition_vip_project(
        v_project.id,
        'trial_completed',
        new.started_by,
        null,
        jsonb_build_object(
          'source', 'trial_run_status_trigger',
          'trialRunId', new.id,
          'trialStatus', v_status,
          'captureCompletedAt', coalesce(new.capture_completed_at, new.capture_ends_at, now())
        )
      );
    elsif v_project.status not in (
      'trial_completed',
      'proposal',
      'payment_pending',
      'active',
      'cancelled'
    ) then
      raise exception 'vip_trial_completion_project_state_invalid';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_vip_project_from_trial_state_v1()
  from public, anon, authenticated;

drop trigger if exists trial_runs_sync_vip_project_state_v1
  on public.trial_runs;

create trigger trial_runs_sync_vip_project_state_v1
after update of status, capture_started_at, capture_ends_at, capture_completed_at
on public.trial_runs
for each row
when (new.vip_project_id is not null)
execute function private.sync_vip_project_from_trial_state_v1();
