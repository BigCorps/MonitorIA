-- Revisões editáveis e removíveis, mantendo o estado resumido do evento
-- sincronizado com a revisão mais recente que permanecer no histórico.

alter table public.event_reviews
  add column if not exists updated_at timestamptz;

update public.event_reviews
set updated_at = created_at
where updated_at is null;

alter table public.event_reviews
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function private.sync_monitoria_event_review_snapshot(
  p_event_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_review record;
begin
  select review.verdict,
         review.corrected_event_type,
         review.notes,
         review.created_by,
         review.updated_at
    into v_review
  from public.event_reviews review
  where review.event_id = p_event_id
  order by review.created_at desc, review.id desc
  limit 1;

  if found then
    update public.events event
    set human_verdict = v_review.verdict,
        corrected_event_type = case
          when v_review.verdict = 'incorrect'
            then v_review.corrected_event_type
          else null
        end,
        review_notes = coalesce(v_review.notes, ''),
        human_reviewed_at = v_review.updated_at,
        human_reviewed_by = v_review.created_by,
        review_status = case
          when v_review.verdict = 'irrelevant'
            then 'rejected'::public.review_status
          else 'confirmed'::public.review_status
        end,
        updated_at = now()
    where event.id = p_event_id;
  else
    update public.events event
    set human_verdict = null,
        corrected_event_type = null,
        review_notes = '',
        human_reviewed_at = null,
        human_reviewed_by = null,
        review_status = case
          when event.requires_review
            then 'pending'::public.review_status
          else 'not_required'::public.review_status
        end,
        updated_at = now()
    where event.id = p_event_id;
  end if;
end;
$function$;

revoke all on function private.sync_monitoria_event_review_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.update_monitoria_event_review(
  p_review_id uuid,
  p_verdict text,
  p_corrected_event_type text default null,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_review record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  if p_verdict not in ('useful', 'irrelevant', 'incorrect') then
    raise exception 'invalid_verdict';
  end if;

  if p_verdict = 'incorrect'
     and nullif(pg_catalog.btrim(coalesce(p_corrected_event_type, '')), '') is null then
    raise exception 'corrected_event_type_required';
  end if;

  select review.id,
         review.organization_id,
         review.event_id,
         review.verdict
    into v_review
  from public.event_reviews review
  join public.events event
    on event.id = review.event_id
   and event.organization_id = review.organization_id
  where review.id = p_review_id
    and event.deleted_at is null
  for update;

  if not found then
    raise exception 'review_not_found';
  end if;

  if not private.is_org_member(v_review.organization_id) then
    raise exception 'not_authorized';
  end if;

  update public.event_reviews review
  set verdict = p_verdict,
      corrected_event_type = case
        when p_verdict = 'incorrect'
          then pg_catalog.left(
            pg_catalog.btrim(p_corrected_event_type),
            120
          )
        else null
      end,
      notes = pg_catalog.left(coalesce(p_notes, ''), 2000),
      updated_at = now()
  where review.id = p_review_id;

  perform private.sync_monitoria_event_review_snapshot(v_review.event_id);

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_review.organization_id,
    v_user_id,
    'event.review_updated',
    'event_review',
    p_review_id,
    pg_catalog.jsonb_build_object(
      'event_id', v_review.event_id,
      'previous_verdict', v_review.verdict,
      'verdict', p_verdict
    )
  );

  return v_review.event_id;
end;
$function$;

revoke all on function public.update_monitoria_event_review(uuid, text, text, text)
  from public, anon;
grant execute on function public.update_monitoria_event_review(uuid, text, text, text)
  to authenticated, service_role;

create or replace function public.delete_monitoria_event_review(
  p_review_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_review record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication_required';
  end if;

  select review.id,
         review.organization_id,
         review.event_id,
         review.verdict
    into v_review
  from public.event_reviews review
  join public.events event
    on event.id = review.event_id
   and event.organization_id = review.organization_id
  where review.id = p_review_id
    and event.deleted_at is null
  for update;

  if not found then
    raise exception 'review_not_found';
  end if;

  if not private.is_org_member(v_review.organization_id) then
    raise exception 'not_authorized';
  end if;

  delete from public.event_reviews review
  where review.id = p_review_id;

  perform private.sync_monitoria_event_review_snapshot(v_review.event_id);

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    v_review.organization_id,
    v_user_id,
    'event.review_deleted',
    'event_review',
    p_review_id,
    pg_catalog.jsonb_build_object(
      'event_id', v_review.event_id,
      'verdict', v_review.verdict
    )
  );

  return v_review.event_id;
end;
$function$;

revoke all on function public.delete_monitoria_event_review(uuid)
  from public, anon;
grant execute on function public.delete_monitoria_event_review(uuid)
  to authenticated, service_role;

comment on function public.update_monitoria_event_review(uuid, text, text, text) is
  'Edita uma revisão existente e recalcula o estado humano atual do evento.';
comment on function public.delete_monitoria_event_review(uuid) is
  'Remove uma revisão e restaura a anterior como estado atual, quando existir.';
