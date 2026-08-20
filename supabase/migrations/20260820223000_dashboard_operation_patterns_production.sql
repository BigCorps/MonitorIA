-- MonitorIA — Dashboard de Produção — Etapa 6 — Padrões da operação
-- Base: main f473f0491d27877e01a1e840c9e38b47dad267d2
--
-- Objetivos:
-- 1. Revisões humanas passam a influenciar análises futuras de modo conservador.
-- 2. "Não é relevante" deixa de alimentar o aprendizado de perfis operacionais.
-- 3. A Pesquisa IA/MCP recebem um resumo sem scores e termos internos.
-- 4. Nenhuma mudança aprendida é aplicada automaticamente a um padrão aprovado.

begin;

do $dependencies$
begin
  if to_regclass('public.camera_staff_profiles') is null
     or to_regclass('public.staff_profile_candidates') is null
     or to_regclass('public.staff_profile_observations') is null
     or to_regclass('public.staff_profile_match_decisions') is null
     or to_regclass('public.staff_profile_update_proposals') is null
     or to_regclass('public.staff_profile_learning_queue') is null then
    raise exception 'monitoria_staff_profile_tables_required';
  end if;

  if to_regprocedure('public.review_staff_profile_candidate_v1(uuid,uuid,text,text,text,numeric,text)') is null
     or to_regprocedure('public.review_staff_profile_match_v1(uuid,uuid,text,uuid,text)') is null
     or to_regprocedure('private.monitoria_appearance_similarity(jsonb,jsonb)') is null
     or to_regprocedure('private.staff_uuid_array_overlap_score_v1(uuid[],uuid[])') is null
     or to_regprocedure('private.monitoria_event_visible_after_review(uuid,uuid)') is null then
    raise exception 'monitoria_staff_profile_functions_required';
  end if;
end;
$dependencies$;

-- ---------------------------------------------------------------------------
-- A. Uma rejeição humana vira uma referência contextual temporária.
-- ---------------------------------------------------------------------------

create or replace function private.monitoria_staff_mark_negative_candidate_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_local_minute integer;
  v_weekday smallint;
begin
  if new.status = 'rejected'
     and old.status is distinct from 'rejected' then
    select observation.local_minute, observation.weekday
    into v_local_minute, v_weekday
    from public.staff_profile_observations observation
    where observation.candidate_id = new.id
    order by observation.observed_at desc
    limit 1;

    new.expires_at := greatest(
      new.expires_at,
      now() + interval '45 days'
    );

    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'negativeLearning', true,
        'humanReviewed', true,
        'negativeLearningExpiresAt', new.expires_at,
        'negativeLocalMinute', v_local_minute,
        'negativeWeekday', v_weekday
      );
  end if;

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_mark_negative_candidate
  on public.staff_profile_candidates;

create trigger monitoria_staff_mark_negative_candidate
before update of status
on public.staff_profile_candidates
for each row
execute function private.monitoria_staff_mark_negative_candidate_v1();

revoke all on function private.monitoria_staff_mark_negative_candidate_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_mark_negative_candidate_v1()
to service_role;

-- "Não é equipe" pode nascer de uma correspondência com padrão aprovado e,
-- por isso, nem sempre existe candidato rejeitado para ser reutilizado depois.
create or replace function private.monitoria_staff_capture_not_staff_review_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_observation public.staff_profile_observations%rowtype;
  v_exists boolean := false;
begin
  if new.review_status <> 'not_staff'
     or old.review_status is not distinct from 'not_staff' then
    return new;
  end if;

  select observation.*
  into v_observation
  from public.staff_profile_observations observation
  where observation.event_person_id = new.event_person_id
  order by observation.observed_at desc
  limit 1;

  if not found
     or coalesce(v_observation.appearance, '{}'::jsonb) = '{}'::jsonb then
    return new;
  end if;

  select exists (
    select 1
    from public.staff_profile_candidates candidate
    where candidate.organization_id = new.organization_id
      and candidate.status = 'rejected'
      and candidate.metadata->>'sourceDecisionId' = new.id::text
  )
  into v_exists;

  if v_exists then
    return new;
  end if;

  insert into public.staff_profile_candidates (
    organization_id,
    site_id,
    camera_id,
    status,
    suggested_label,
    canonical_appearance,
    zone_ids,
    action_codes,
    session_types,
    weekdays,
    shift_windows,
    observation_count,
    distinct_days_count,
    confidence,
    first_seen_at,
    last_seen_at,
    expires_at,
    evidence_event_ids,
    reviewed_by,
    reviewed_at,
    review_notes,
    metadata
  ) values (
    v_observation.organization_id,
    v_observation.site_id,
    v_observation.camera_id,
    'rejected',
    'Referência revisada — não é equipe',
    coalesce(v_observation.appearance, '{}'::jsonb),
    coalesce(v_observation.zone_ids, '{}'),
    coalesce(v_observation.action_codes, '{}'),
    coalesce(v_observation.session_types, '{}'),
    array[v_observation.weekday]::smallint[],
    jsonb_build_array(
      jsonb_build_object(
        'weekday', v_observation.weekday,
        'startMinute', greatest(0, v_observation.local_minute - 90),
        'medianMinute', v_observation.local_minute,
        'endMinute', least(1439, v_observation.local_minute + 90),
        'observations', 1
      )
    ),
    1,
    1,
    greatest(
      0,
      least(
        1,
        greatest(
          coalesce(v_observation.appearance_confidence, 0),
          coalesce(v_observation.source_confidence, 0),
          coalesce(v_observation.match_score, 0)
        )
      )
    ),
    v_observation.observed_at,
    v_observation.observed_at,
    greatest(v_observation.observed_at, now()) + interval '45 days',
    array[v_observation.event_id]::uuid[],
    new.reviewed_by,
    coalesce(new.reviewed_at, now()),
    coalesce(new.review_notes, ''),
    jsonb_build_object(
      'negativeLearning', true,
      'humanReviewed', true,
      'source', 'not_staff_review',
      'sourceDecisionId', new.id,
      'negativeLocalMinute', v_observation.local_minute,
      'negativeWeekday', v_observation.weekday,
      'negativeLearningExpiresAt',
        greatest(v_observation.observed_at, now()) + interval '45 days'
    )
  );

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_capture_not_staff_review
  on public.staff_profile_match_decisions;

create trigger monitoria_staff_capture_not_staff_review
after update of review_status
on public.staff_profile_match_decisions
for each row
execute function private.monitoria_staff_capture_not_staff_review_v1();

revoke all on function private.monitoria_staff_capture_not_staff_review_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_capture_not_staff_review_v1()
to service_role;

-- ---------------------------------------------------------------------------
-- B. Novos candidatos muito parecidos com uma correção humana são suprimidos.
--    A regra é deliberadamente conservadora:
--    - mesma câmera
--    - aparência ampla >= 93%
--    - área compatível >= 50%
--    - mesmo dia recorrente
--    - até 2 horas do contexto revisado, quando há horário conhecido
-- ---------------------------------------------------------------------------

create or replace function private.monitoria_staff_apply_negative_context_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_local_minute integer := 0;
  v_negative_id uuid;
begin
  if new.status <> 'learning'
     or coalesce(new.metadata->>'negativeLearning', 'false') = 'true' then
    return new;
  end if;

  select
    extract(hour from (new.first_seen_at at time zone coalesce(site.timezone, 'UTC')))::integer * 60
      + extract(minute from (new.first_seen_at at time zone coalesce(site.timezone, 'UTC')))::integer
  into v_local_minute
  from public.sites site
  where site.id = new.site_id;

  select negative.id
  into v_negative_id
  from public.staff_profile_candidates negative
  where negative.organization_id = new.organization_id
    and negative.camera_id = new.camera_id
    and negative.status = 'rejected'
    and coalesce(negative.metadata->>'negativeLearning', 'false') = 'true'
    and negative.expires_at > now()
    and private.monitoria_appearance_similarity(
      new.canonical_appearance,
      negative.canonical_appearance
    ) >= 0.93
    and private.staff_uuid_array_overlap_score_v1(
      new.zone_ids,
      negative.zone_ids
    ) >= 0.50
    and (
      cardinality(negative.weekdays) = 0
      or cardinality(new.weekdays) = 0
      or new.weekdays && negative.weekdays
    )
    and (
      negative.metadata->>'negativeLocalMinute' is null
      or least(
        abs(
          v_local_minute
          - (negative.metadata->>'negativeLocalMinute')::integer
        ),
        1440 - abs(
          v_local_minute
          - (negative.metadata->>'negativeLocalMinute')::integer
        )
      ) <= 120
    )
  order by private.monitoria_appearance_similarity(
    new.canonical_appearance,
    negative.canonical_appearance
  ) desc
  limit 1;

  if v_negative_id is not null then
    new.status := 'rejected';
    new.expires_at := greatest(
      new.expires_at,
      now() + interval '30 days'
    );
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'autoSuppressedByNegativeReview', true,
        'negativeSourceCandidateId', v_negative_id,
        'suppressedAt', now()
      );
  end if;

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_apply_negative_context
  on public.staff_profile_candidates;

create trigger monitoria_staff_apply_negative_context
before insert
on public.staff_profile_candidates
for each row
execute function private.monitoria_staff_apply_negative_context_v1();

revoke all on function private.monitoria_staff_apply_negative_context_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_apply_negative_context_v1()
to service_role;

-- A decisão persistida deixa de ser "novo candidato" quando o candidato foi
-- suprimido pela referência humana.
create or replace function private.monitoria_staff_negative_decision_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.candidate_id is not null
     and exists (
       select 1
       from public.staff_profile_candidates candidate
       where candidate.id = new.candidate_id
         and candidate.status = 'rejected'
         and coalesce(
           candidate.metadata->>'autoSuppressedByNegativeReview',
           'false'
         ) = 'true'
     ) then
    new.staff_profile_id := null;
    new.decision := 'not_staff';
    new.review_status := 'not_required';
    new.reasons := coalesce(new.reasons, '{}'::jsonb)
      || jsonb_build_object(
        'negativeHumanReview', true,
        'items',
        coalesce(new.reasons->'items', '[]'::jsonb)
          || jsonb_build_array(
            'Uma correção humana muito parecida foi usada como referência contextual.'
          )
      );
  end if;

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_negative_decision_guard
  on public.staff_profile_match_decisions;

create trigger monitoria_staff_negative_decision_guard
before insert or update of candidate_id
on public.staff_profile_match_decisions
for each row
execute function private.monitoria_staff_negative_decision_guard_v1();

revoke all on function private.monitoria_staff_negative_decision_guard_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_negative_decision_guard_v1()
to service_role;

create or replace function private.monitoria_staff_negative_observation_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.candidate_id is not null
     and exists (
       select 1
       from public.staff_profile_candidates candidate
       where candidate.id = new.candidate_id
         and candidate.status = 'rejected'
         and coalesce(
           candidate.metadata->>'autoSuppressedByNegativeReview',
           'false'
         ) = 'true'
     ) then
    new.staff_profile_id := null;
    new.candidate_id := null;
    new.decision_status := 'ignored';
    new.evidence := coalesce(new.evidence, '{}'::jsonb)
      || jsonb_build_object(
        'ignoredByHumanFeedback', true
      );
  end if;

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_negative_observation_guard
  on public.staff_profile_observations;

create trigger monitoria_staff_negative_observation_guard
before insert or update of candidate_id
on public.staff_profile_observations
for each row
execute function private.monitoria_staff_negative_observation_guard_v1();

revoke all on function private.monitoria_staff_negative_observation_guard_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_negative_observation_guard_v1()
to service_role;

-- ---------------------------------------------------------------------------
-- C. "Não é relevante" não entra (ou deixa de entrar) no aprendizado.
-- ---------------------------------------------------------------------------

create or replace function private.monitoria_staff_learning_queue_review_guard_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status in ('queued', 'failed')
     and not private.monitoria_event_visible_after_review(
       new.event_id,
       new.organization_id
     ) then
    new.status := 'ignored';
    new.processed_at := coalesce(new.processed_at, now());
    new.last_error := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_learning_queue_review_guard
  on public.staff_profile_learning_queue;

create trigger monitoria_staff_learning_queue_review_guard
before insert or update of status, event_id
on public.staff_profile_learning_queue
for each row
execute function private.monitoria_staff_learning_queue_review_guard_v1();

revoke all on function private.monitoria_staff_learning_queue_review_guard_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_learning_queue_review_guard_v1()
to service_role;

create or replace function private.monitoria_staff_sync_event_review_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_profile_ids uuid[] := '{}';
  v_candidate_ids uuid[] := '{}';
begin
  if new.human_verdict is not distinct from old.human_verdict then
    return new;
  end if;

  if new.human_verdict = 'irrelevant' then
    select
      coalesce(
        array_agg(distinct observation.staff_profile_id)
          filter (where observation.staff_profile_id is not null),
        '{}'::uuid[]
      ),
      coalesce(
        array_agg(distinct observation.candidate_id)
          filter (where observation.candidate_id is not null),
        '{}'::uuid[]
      )
    into v_profile_ids, v_candidate_ids
    from public.staff_profile_observations observation
    where observation.event_id = new.id;

    update public.staff_profile_learning_queue
    set status = 'ignored',
        processed_at = coalesce(processed_at, now()),
        last_error = null,
        updated_at = now()
    where event_id = new.id;

    update public.staff_profile_update_proposals
    set status = 'expired',
        updated_at = now()
    where status = 'pending'
      and new.id = any(evidence_event_ids);

    update public.staff_profile_candidates
    set expires_at = least(expires_at, now()),
        metadata = coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object(
            'disabledByIrrelevantEvent', new.id,
            'disabledAt', now()
          ),
        updated_at = now()
    where status = 'rejected'
      and coalesce(metadata->>'negativeLearning', 'false') = 'true'
      and new.id = any(evidence_event_ids);

    update public.staff_profile_match_decisions
    set decision = 'unknown',
        review_status = case
          when review_status = 'pending' then 'rejected'
          else review_status
        end,
        review_notes = case
          when review_status = 'pending'
            then 'Acontecimento marcado como não relevante.'
          else review_notes
        end,
        updated_at = now()
    where event_id = new.id;

    update public.staff_profile_observations
    set staff_profile_id = null,
        candidate_id = null,
        decision_status = 'ignored',
        evidence = coalesce(evidence, '{}'::jsonb)
          || jsonb_build_object(
            'ignoredByEventReview', true,
            'eventVerdict', 'irrelevant'
          )
    where event_id = new.id;

    if cardinality(v_profile_ids) > 0 then
      update public.camera_staff_profiles profile
      set observation_count = (
            select count(*)::integer
            from public.staff_profile_observations observation
            where observation.staff_profile_id = profile.id
              and observation.decision_status = 'profile_match'
          ),
          distinct_days_count = (
            select count(distinct observation.local_date)::integer
            from public.staff_profile_observations observation
            where observation.staff_profile_id = profile.id
              and observation.decision_status = 'profile_match'
          ),
          profile_confidence = coalesce((
            select greatest(
              0,
              least(1, avg(observation.match_score))
            )
            from public.staff_profile_observations observation
            where observation.staff_profile_id = profile.id
              and observation.decision_status = 'profile_match'
          ), 0),
          last_observed_at = (
            select max(observation.observed_at)
            from public.staff_profile_observations observation
            where observation.staff_profile_id = profile.id
              and observation.decision_status = 'profile_match'
          ),
          updated_at = now()
      where profile.id = any(v_profile_ids);
    end if;

    if cardinality(v_candidate_ids) > 0 then
      update public.staff_profile_candidates candidate
      set observation_count = (
            select count(*)::integer
            from public.staff_profile_observations observation
            where observation.candidate_id = candidate.id
              and observation.decision_status in (
                'candidate_match',
                'candidate_created'
              )
          ),
          distinct_days_count = (
            select count(distinct observation.local_date)::integer
            from public.staff_profile_observations observation
            where observation.candidate_id = candidate.id
              and observation.decision_status in (
                'candidate_match',
                'candidate_created'
              )
          ),
          status = case
            when candidate.status = 'pending_review'
              and (
                (
                  select count(*)::integer
                  from public.staff_profile_observations observation
                  where observation.candidate_id = candidate.id
                    and observation.decision_status in (
                      'candidate_match',
                      'candidate_created'
                    )
                ) < camera.staff_profile_candidate_min_observations
                or
                (
                  select count(distinct observation.local_date)::integer
                  from public.staff_profile_observations observation
                  where observation.candidate_id = candidate.id
                    and observation.decision_status in (
                      'candidate_match',
                      'candidate_created'
                    )
                ) < camera.staff_profile_candidate_min_days
              )
              then 'learning'
            else candidate.status
          end,
          updated_at = now()
      from public.cameras camera
      where candidate.id = any(v_candidate_ids)
        and camera.id = candidate.camera_id;
    end if;

    return new;
  end if;

  if old.human_verdict = 'irrelevant'
     and new.human_verdict is distinct from 'irrelevant' then
    insert into public.staff_profile_learning_queue (
      organization_id,
      camera_id,
      event_id,
      event_person_id,
      status,
      available_at,
      last_error,
      updated_at
    )
    select
      new.organization_id,
      new.camera_id,
      new.id,
      person.id,
      'queued',
      now(),
      null,
      now()
    from public.event_people person
    where person.event_id = new.id
    on conflict (event_person_id) do update set
      status = case
        when public.staff_profile_learning_queue.status = 'processing'
          then 'processing'
        else 'queued'
      end,
      available_at = now(),
      last_error = null,
      updated_at = now();
  end if;

  return new;
end;
$function$;

drop trigger if exists monitoria_staff_sync_event_review
  on public.events;

create trigger monitoria_staff_sync_event_review
after update of human_verdict
on public.events
for each row
execute function private.monitoria_staff_sync_event_review_v1();

revoke all on function private.monitoria_staff_sync_event_review_v1()
from public, anon, authenticated, monitoria_mcp_readonly;
grant execute on function private.monitoria_staff_sync_event_review_v1()
to service_role;

-- ---------------------------------------------------------------------------
-- D. Resumo para Pesquisa IA e MCP em linguagem de produto.
--    Scores, versões, thresholds e descritores internos ficam fora do payload.
-- ---------------------------------------------------------------------------

create or replace function public.assistant_staff_operational_profile_summary_v1(
  p_organization_id uuid,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with selected_profiles as (
    select
      profile.id,
      profile.camera_id,
      camera.site_id,
      camera.name as camera_name,
      profile.label,
      profile.description,
      profile.profile_status,
      profile.update_mode,
      profile.habitual_zone_ids,
      profile.habitual_action_codes,
      profile.habitual_weekdays,
      profile.shift_windows,
      profile.last_observed_at
    from public.camera_staff_profiles profile
    join public.cameras camera
      on camera.id = profile.camera_id
    where profile.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and (p_camera_id is null or profile.camera_id = p_camera_id)
      and (p_site_id is null or camera.site_id = p_site_id)
  ),
  pattern_rows as (
    select jsonb_build_object(
      'id', profile.id,
      'cameraId', profile.camera_id,
      'cameraName', profile.camera_name,
      'name', profile.label,
      'description', profile.description,
      'state', case profile.profile_status
        when 'active' then 'Ativo'
        when 'paused' then 'Pausado'
        else 'Encerrado'
      end,
      'learningMode', case profile.update_mode
        when 'reviewed_learning'
          then 'Aprende novas recorrências e pede aprovação antes de mudar.'
        else 'Só muda quando o administrador editar.'
      end,
      'usualAreas', coalesce((
        select jsonb_agg(zone.name order by zone.name)
        from public.camera_zones zone
        where zone.id = any(profile.habitual_zone_ids)
      ), '[]'::jsonb),
      'usualActivities', coalesce((
        select jsonb_agg(label order by label)
        from (
          select distinct case action_code
            when 'arrival' then 'chegada'
            when 'waiting' then 'espera'
            when 'service_started' then 'início de atendimento'
            when 'service_continued' then 'continuação do atendimento'
            when 'terminal_activity' then 'uso de terminal'
            when 'object_handoff' then 'transferência de objeto'
            when 'departure' then 'saída'
            when 'opening_step' then 'abertura'
            when 'closing_step' then 'fechamento'
            when 'equipment_activity' then 'operação de equipamento'
            when 'restricted_access' then 'acesso restrito'
            when 'state_change' then 'mudança de estado'
            when 'presence' then 'presença'
            else replace(action_code, '_', ' ')
          end as label
          from unnest(profile.habitual_action_codes) action_code
        ) activity_labels
      ), '[]'::jsonb),
      'usualDays', coalesce((
        select jsonb_agg(day_label order by day_number)
        from (
          select distinct
            weekday as day_number,
            case weekday
              when 0 then 'domingo'
              when 1 then 'segunda-feira'
              when 2 then 'terça-feira'
              when 3 then 'quarta-feira'
              when 4 then 'quinta-feira'
              when 5 then 'sexta-feira'
              when 6 then 'sábado'
            end as day_label
          from unnest(profile.habitual_weekdays) weekday
        ) weekday_labels
      ), '[]'::jsonb),
      'usualSchedule', coalesce((
        select jsonb_agg(
          format(
            '%s · %s:%s–%s:%s',
            case schedule.weekday
              when 0 then 'domingo'
              when 1 then 'segunda-feira'
              when 2 then 'terça-feira'
              when 3 then 'quarta-feira'
              when 4 then 'quinta-feira'
              when 5 then 'sexta-feira'
              when 6 then 'sábado'
              else 'dia'
            end,
            lpad((schedule.start_minute / 60)::text, 2, '0'),
            lpad((schedule.start_minute % 60)::text, 2, '0'),
            lpad((schedule.end_minute / 60)::text, 2, '0'),
            lpad((schedule.end_minute % 60)::text, 2, '0')
          )
          order by schedule.weekday, schedule.start_minute
        )
        from (
          select
            coalesce(
              nullif(window->>'weekday', '')::integer,
              0
            ) as weekday,
            greatest(
              0,
              least(
                1439,
                coalesce(
                  nullif(window->>'startMinute', '')::integer,
                  nullif(window->>'start_minute', '')::integer,
                  0
                )
              )
            ) as start_minute,
            greatest(
              0,
              least(
                1439,
                coalesce(
                  nullif(window->>'endMinute', '')::integer,
                  nullif(window->>'end_minute', '')::integer,
                  0
                )
              )
            ) as end_minute
          from jsonb_array_elements(profile.shift_windows) window
        ) schedule
      ), '[]'::jsonb),
      'lastObservedAt', profile.last_observed_at,
      'hasSuggestedUpdate', exists (
        select 1
        from public.staff_profile_update_proposals proposal
        where proposal.staff_profile_id = profile.id
          and proposal.status = 'pending'
      )
    ) as data
    from selected_profiles profile
  )
  select jsonb_build_object(
    'patterns',
      coalesce((select jsonb_agg(data) from pattern_rows), '[]'::jsonb),
    'review', jsonb_build_object(
      'newPatternsToReview', (
        select count(*)
        from public.staff_profile_candidates candidate
        join public.cameras camera
          on camera.id = candidate.camera_id
        where candidate.organization_id = p_organization_id
          and candidate.status = 'pending_review'
          and (p_camera_id is null or candidate.camera_id = p_camera_id)
          and (p_site_id is null or camera.site_id = p_site_id)
      ),
      'situationsToConfirm', (
        select count(*)
        from public.staff_profile_match_decisions decision
        join public.cameras camera
          on camera.id = decision.camera_id
        where decision.organization_id = p_organization_id
          and decision.review_status = 'pending'
          and (p_camera_id is null or decision.camera_id = p_camera_id)
          and (p_site_id is null or camera.site_id = p_site_id)
      ),
      'suggestedUpdates', (
        select count(*)
        from public.staff_profile_update_proposals proposal
        join public.cameras camera
          on camera.id = proposal.camera_id
        where proposal.organization_id = p_organization_id
          and proposal.status = 'pending'
          and (p_camera_id is null or proposal.camera_id = p_camera_id)
          and (p_site_id is null or camera.site_id = p_site_id)
      )
    ),
    'learningBehavior',
      'Confirmações e correções humanas ajudam as próximas análises. Mudanças em padrões aprovados continuam dependendo de aprovação do administrador.',
    'privacy',
      'Os padrões usam recorrências de horário, área, atividade e características visuais amplas. Não há reconhecimento facial nem identificação civil.'
  );
$function$;

revoke all on function public.assistant_staff_operational_profile_summary_v1(
  uuid, uuid, uuid
) from public, anon;
grant execute on function public.assistant_staff_operational_profile_summary_v1(
  uuid, uuid, uuid
) to authenticated, monitoria_mcp_readonly, service_role;

comment on function public.assistant_staff_operational_profile_summary_v1(
  uuid, uuid, uuid
) is
  'Resumo amigável dos padrões operacionais para Pesquisa IA e MCP. Omite scores, thresholds, versões e descritores internos.';

commit;
