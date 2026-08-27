-- MonitorIA 1.0.3 — precisão de abertura/fechamento
-- NÃO aplicada automaticamente por este pacote.
--
-- Corrige o caso observado em 27/08/2026:
-- uma observação "open" com transitionVisible=true e previousVisibleState=null
-- não pode produzir opening_precision='visible_transition'.
--
-- O trigger roda antes dos guards já existentes. Se a alegação de transição
-- visível não for auditável, ele tenta reconstruir um intervalo entre a
-- última evidência clara do estado anterior e a primeira evidência clara do
-- novo estado. Se não conseguir, rebaixa a precisão em vez de inventar hora.

begin;

create or replace function private.monitoria_operating_precision_guard_v103()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_min_confidence numeric := 0.78;
  v_transition record;
  v_last_closed_at timestamptz;
  v_first_open record;
  v_last_closed_observation record;
  v_first_closed record;
  v_last_open_observation record;
begin
  select coalesce(entity.min_confidence,0.78)
  into v_min_confidence
  from public.camera_visual_entities entity
  where entity.id = new.entity_id;

  -- ------------------------------------------------------------ abertura
  if new.status = 'open'
     and new.opening_precision = 'visible_transition' then

    select
      transition.id,
      transition.from_state,
      transition.to_state,
      transition.transition_visible,
      observation.previous_visible_state,
      observation.observed_state,
      observation.transition_visible as observation_transition_visible
    into v_transition
    from public.visual_state_transitions transition
    join public.visual_state_observations observation
      on observation.id = transition.observation_id
    where transition.id = new.open_transition_id
      and transition.entity_id = new.entity_id;

    if not found
       or v_transition.from_state is null
       or v_transition.from_state = v_transition.to_state
       or v_transition.to_state <> 'open'
       or not coalesce(v_transition.transition_visible,false)
       or v_transition.previous_visible_state is null
       or v_transition.previous_visible_state = v_transition.observed_state
       or not coalesce(v_transition.observation_transition_visible,false) then

      select max(session.closed_at)
      into v_last_closed_at
      from public.site_operating_sessions session
      where session.entity_id = new.entity_id
        and session.closed_at is not null
        and session.closed_at < coalesce(new.first_open_observed_at,now());

      select
        observation.observed_at,
        observation.event_id,
        observation.confidence
      into v_first_open
      from public.visual_state_observations observation
      where observation.entity_id = new.entity_id
        and observation.observed_state in ('partially_open','open')
        and observation.visibility = 'clear'
        and observation.confidence >= v_min_confidence
        and observation.observed_at <= coalesce(new.first_open_observed_at,now())
        and observation.observed_at >= coalesce(
          v_last_closed_at,
          coalesce(new.first_open_observed_at,now()) - interval '12 hours'
        )
      order by observation.observed_at
      limit 1;

      if found then
        select
          observation.observed_at,
          observation.event_id,
          observation.confidence
        into v_last_closed_observation
        from public.visual_state_observations observation
        where observation.entity_id = new.entity_id
          and observation.observed_state = 'closed'
          and observation.visibility = 'clear'
          and observation.confidence >= v_min_confidence
          and observation.observed_at < v_first_open.observed_at
          and observation.observed_at >= coalesce(
            v_last_closed_at,
            v_first_open.observed_at - interval '12 hours'
          )
        order by observation.observed_at desc
        limit 1;
      end if;

      new.open_transition_id := null;

      if v_first_open.observed_at is not null
         and v_last_closed_observation.observed_at is not null then
        new.first_open_observed_at := v_first_open.observed_at;
        new.opening_event_id := v_first_open.event_id;
        new.opening_precision := 'estimated_interval';
        new.opening_window_start_at := v_last_closed_observation.observed_at;
        new.opening_window_end_at := v_first_open.observed_at;
        new.opened_at :=
          v_last_closed_observation.observed_at
          + (
              v_first_open.observed_at
              - v_last_closed_observation.observed_at
            ) / 2;
        new.opening_inference_source := 'visual_observation_interval_v103';
        new.opening_confidence := least(
          coalesce(v_first_open.confidence,0.78),
          coalesce(v_last_closed_observation.confidence,0.78)
        );
      else
        new.opened_at := null;
        new.opening_precision := 'observed_only';
        if v_first_open.observed_at is not null then
          new.first_open_observed_at := v_first_open.observed_at;
          new.opening_event_id := v_first_open.event_id;
        end if;
      end if;
    end if;
  end if;

  -- ----------------------------------------------------------- fechamento
  if new.status = 'closed'
     and new.closing_precision = 'visible_transition' then

    select
      transition.id,
      transition.from_state,
      transition.to_state,
      transition.transition_visible,
      observation.previous_visible_state,
      observation.observed_state,
      observation.transition_visible as observation_transition_visible
    into v_transition
    from public.visual_state_transitions transition
    join public.visual_state_observations observation
      on observation.id = transition.observation_id
    where transition.id = new.close_transition_id
      and transition.entity_id = new.entity_id;

    if not found
       or v_transition.from_state is null
       or v_transition.from_state = v_transition.to_state
       or v_transition.to_state <> 'closed'
       or not coalesce(v_transition.transition_visible,false)
       or v_transition.previous_visible_state is null
       or v_transition.previous_visible_state = v_transition.observed_state
       or not coalesce(v_transition.observation_transition_visible,false) then

      select
        observation.observed_at,
        observation.event_id,
        observation.confidence
      into v_first_closed
      from public.visual_state_observations observation
      where observation.entity_id = new.entity_id
        and observation.observed_state = 'closed'
        and observation.visibility = 'clear'
        and observation.confidence >= v_min_confidence
        and observation.observed_at >= coalesce(
          new.first_open_observed_at,
          coalesce(new.opened_at,now()) - interval '18 hours'
        )
        and observation.observed_at <= coalesce(new.closed_at,now())
      order by observation.observed_at
      limit 1;

      if found then
        select
          observation.observed_at,
          observation.event_id,
          observation.confidence
        into v_last_open_observation
        from public.visual_state_observations observation
        where observation.entity_id = new.entity_id
          and observation.observed_state in ('open','partially_open')
          and observation.visibility = 'clear'
          and observation.confidence >= v_min_confidence
          and observation.observed_at < v_first_closed.observed_at
          and observation.observed_at >= coalesce(
            new.first_open_observed_at,
            v_first_closed.observed_at - interval '18 hours'
          )
        order by observation.observed_at desc
        limit 1;
      end if;

      new.close_transition_id := null;

      if v_first_closed.observed_at is not null
         and v_last_open_observation.observed_at is not null then
        new.closing_event_id := v_first_closed.event_id;
        new.closing_precision := 'estimated_interval';
        new.closing_window_start_at := v_last_open_observation.observed_at;
        new.closing_window_end_at := v_first_closed.observed_at;
        new.closed_at :=
          v_last_open_observation.observed_at
          + (
              v_first_closed.observed_at
              - v_last_open_observation.observed_at
            ) / 2;
        new.closing_inference_source := 'visual_observation_interval_v103';
        new.closing_confidence := least(
          coalesce(v_first_closed.confidence,0.78),
          coalesce(v_last_open_observation.confidence,0.78)
        );
      else
        new.closing_precision := 'strong_snapshot';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function private.monitoria_operating_precision_guard_v103()
  from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_operating_precision_guard_v103()
  to service_role;

drop trigger if exists site_operating_sessions_00_precision_guard_v103
  on public.site_operating_sessions;

create trigger site_operating_sessions_00_precision_guard_v103
before insert or update
on public.site_operating_sessions
for each row
execute function private.monitoria_operating_precision_guard_v103();

commit;
