create or replace function private.disable_agent_without_enabled_cameras()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if old.enabled and not new.enabled then
    if not exists (
      select 1
      from public.agent_cameras ac
      where ac.agent_id = new.agent_id
        and ac.enabled
    ) then
      update public.agents
         set status = 'disabled',
             updated_at = now()
       where id = new.agent_id
         and status <> 'disabled';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.disable_agent_without_enabled_cameras() from public;

drop trigger if exists trg_disable_agent_without_enabled_cameras
on public.agent_cameras;

create trigger trg_disable_agent_without_enabled_cameras
after update of enabled on public.agent_cameras
for each row
when (old.enabled is distinct from new.enabled)
execute function private.disable_agent_without_enabled_cameras();
