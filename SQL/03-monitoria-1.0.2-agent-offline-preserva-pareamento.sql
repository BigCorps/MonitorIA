-- MonitorIA 1.0.2
-- Corrige a semântica de agents.status quando a última câmera é desabilitada.
--
-- "disabled" fica reservado para revogação/aposentadoria explícita do Agent.
-- Quando não existem câmeras habilitadas, o Agent passa apenas a "offline".
-- Assim o token continua autenticável e uma reinstalação/reativação de trial
-- não exige novo pareamento nem cria Agent duplicado.

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
         set status = 'offline',
             updated_at = now()
       where id = new.agent_id
         and status <> 'disabled';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.disable_agent_without_enabled_cameras()
  from public;

comment on function private.disable_agent_without_enabled_cameras()
is 'Mantém disabled reservado para revogação explícita; sem câmeras habilitadas o Agent fica offline e conserva autenticação.';
