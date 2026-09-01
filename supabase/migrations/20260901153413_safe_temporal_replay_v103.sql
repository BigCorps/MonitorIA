begin;

-- MonitorIA 1.0.3 — replay temporal seguro.
-- Eventos antigos recuperados fora de ordem devem continuar entrando no histórico,
-- mas não podem regredir o estado visual atual nem fechar uma sessão operacional
-- que só começou depois do próprio evento.

create or replace function private.monitoria_guard_current_state_replay_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min_confidence numeric := 0.78;
  v_latest_eligible_at timestamptz;
begin
  if new.last_observed_at is null then
    return new;
  end if;

  -- Nunca permita regressão contra o timestamp já materializado.
  if old.last_observed_at is not null
     and new.last_observed_at < old.last_observed_at then
    return old;
  end if;

  select coalesce(entity.min_confidence, 0.78)
  into v_min_confidence
  from public.camera_visual_entities entity
  where entity.id = new.entity_id;

  -- Um replay histórico pode encontrar visual_entity_current_states desatualizado
  -- enquanto observações mais novas já existem. Nessas condições, a observação
  -- antiga é preservada no histórico, mas não redefine o estado "atual".
  select max(observation.observed_at)
  into v_latest_eligible_at
  from public.visual_state_observations observation
  where observation.entity_id = new.entity_id
    and observation.id is distinct from new.source_observation_id
    and observation.visibility = 'clear'
    and observation.observed_state <> 'unknown'
    and observation.confidence >= v_min_confidence;

  if v_latest_eligible_at is not null
     and new.last_observed_at < v_latest_eligible_at then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists visual_entity_current_states_00_chronology_guard_v103
  on public.visual_entity_current_states;
create trigger visual_entity_current_states_00_chronology_guard_v103
before update
on public.visual_entity_current_states
for each row
execute function private.monitoria_guard_current_state_replay_v1();

create or replace function private.monitoria_guard_operating_session_temporal_replay_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Se um evento histórico for recuperado depois que uma sessão mais nova já
  -- abriu, ele não pode fechar essa sessão com um timestamp anterior à abertura.
  -- Retornar OLD preserva a sessão atual e deixa o evento histórico concluir.
  if old.status = 'open'
     and new.status = 'closed'
     and new.closed_at is not null
     and new.closed_at < old.first_open_observed_at then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists site_operating_sessions_00_temporal_replay_guard_v103
  on public.site_operating_sessions;
create trigger site_operating_sessions_00_temporal_replay_guard_v103
before update of status, closed_at
on public.site_operating_sessions
for each row
execute function private.monitoria_guard_operating_session_temporal_replay_v1();

commit;
