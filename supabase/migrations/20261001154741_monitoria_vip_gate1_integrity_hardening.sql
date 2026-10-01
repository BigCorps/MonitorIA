-- MonitorIA VIP — Gate 1: integridade da máquina de estados no próprio banco.

alter table public.vip_project_status_events
  add constraint vip_project_status_events_from_status_check
  check (
    from_status is null
    or from_status = any (array[
      'lead'::text,
      'invited'::text,
      'project_setup'::text,
      'installing'::text,
      'calibrating'::text,
      'ready_for_trial'::text,
      'trial_running'::text,
      'trial_completed'::text,
      'proposal'::text,
      'payment_pending'::text,
      'active'::text,
      'cancelled'::text
    ])
  );

alter table public.vip_project_status_events
  add constraint vip_project_status_events_to_status_check
  check (
    to_status = any (array[
      'lead'::text,
      'invited'::text,
      'project_setup'::text,
      'installing'::text,
      'calibrating'::text,
      'ready_for_trial'::text,
      'trial_running'::text,
      'trial_completed'::text,
      'proposal'::text,
      'payment_pending'::text,
      'active'::text,
      'cancelled'::text
    ])
  );

create or replace function private.guard_vip_project_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and not private.vip_project_transition_allowed(old.status, new.status) then
    raise exception 'vip_project_transition_not_allowed';
  end if;

  return new;
end;
$$;

revoke all on function private.guard_vip_project_status_transition()
  from public, anon, authenticated;

create trigger vip_projects_status_transition_guard
before update of status
on public.vip_projects
for each row
execute function private.guard_vip_project_status_transition();
