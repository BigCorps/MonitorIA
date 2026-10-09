-- MonitorIA — Pesquisa IA: filtro estruturado por faixa etária visual ampla
--
-- Aditivo e retrocompatível:
-- - preserva assistant_structured_event_search_v2;
-- - cria v3 com filtro opcional child/adult sobre o Structured Output;
-- - não classifica idade legal, adolescente ou identidade;
-- - usa somente dados já produzidos pelo pipeline visual.

begin;

create or replace function public.assistant_structured_event_search_v3(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null,
  p_zone_id uuid default null,
  p_event_types text[] default null,
  p_after_confirmed_closing boolean default null,
  p_requires_review boolean default null,
  p_apparent_age_group text default null,
  p_limit integer default 12
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with rows as (
    select e.id, e.started_at, e.ended_at, e.primary_event_type, e.headline, e.summary,
           e.confidence, e.requires_review, e.after_confirmed_closing,
           e.zone_ids, e.tags, e.camera_id, c.name as camera_name,
           e.site_id, s.name as site_name
    from public.events e
    join public.cameras c on c.id=e.camera_id and c.organization_id=p_organization_id
    join public.sites s on s.id=e.site_id and s.organization_id=p_organization_id
    where e.organization_id=p_organization_id
      and e.started_at>=p_from and e.started_at<p_to
      and e.deleted_at is null
      and (p_camera_id is null or e.camera_id=p_camera_id)
      and (p_site_id is null or e.site_id=p_site_id)
      and (p_zone_id is null or p_zone_id = any(coalesce(e.zone_ids, array[]::uuid[])))
      and (p_event_types is null or e.primary_event_type = any(p_event_types))
      and (p_after_confirmed_closing is null or e.after_confirmed_closing=p_after_confirmed_closing)
      and (p_requires_review is null or e.requires_review=p_requires_review)
      and (
        p_apparent_age_group is null
        or (
          p_apparent_age_group in ('child','adult')
          and exists (
            select 1
            from jsonb_array_elements(coalesce(e.analyzed_payload->'people','[]'::jsonb)) person
            where person->>'apparentAgeGroup'=p_apparent_age_group
              and case
                when coalesce(person->>'apparentAgeGroupConfidence','') ~ '^[0-9]+([.][0-9]+)?$'
                  then (person->>'apparentAgeGroupConfidence')::numeric
                else 0
              end >= 0.60
          )
        )
      )
    order by e.started_at desc
  )
  select case
    when not private.is_org_member(p_organization_id) then jsonb_build_object('error','not_authorized')
    else jsonb_build_object(
      'total', (select count(*) from rows),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', id,
          'startedAt', started_at,
          'endedAt', ended_at,
          'eventType', primary_event_type,
          'headline', headline,
          'summary', summary,
          'confidence', confidence,
          'requiresReview', requires_review,
          'afterConfirmedClosing', after_confirmed_closing,
          'zoneIds', coalesce(to_jsonb(zone_ids), '[]'::jsonb),
          'tags', coalesce(to_jsonb(tags), '[]'::jsonb),
          'cameraId', camera_id,
          'cameraName', camera_name,
          'siteId', site_id,
          'siteName', site_name
        ) order by started_at desc)
        from (select * from rows limit greatest(1,least(coalesce(p_limit,12),50))) limited
      ), '[]'::jsonb)
    )
  end;
$function$;

revoke all on function public.assistant_structured_event_search_v3(
  uuid,timestamptz,timestamptz,uuid,uuid,uuid,text[],boolean,boolean,text,integer
) from public, anon;
grant execute on function public.assistant_structured_event_search_v3(
  uuid,timestamptz,timestamptz,uuid,uuid,uuid,text[],boolean,boolean,text,integer
) to authenticated, service_role;

commit;
