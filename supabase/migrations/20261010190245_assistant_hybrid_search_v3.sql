-- Gates 2/3: additive and OFF by default. Pending approval; never apply remotely automatically.
begin;

-- Free text never leaves the database. This deliberately lossy, versioned projection
-- retains only known scene concepts; it is NOT a new visual classification.
create function public.assistant_embedding_projection_v1(p_text text, p_type text default '')
returns text language sql immutable parallel safe set search_path = '' as $$
  select 'acontecimento ' || coalesce(string_agg(concept, ' ' order by concept), 'atividade')
  from (values
    ('entrega', '(entreg|delivery|encomenda|remessa|recebimento)'),
    ('pacote', '(pacot|encomenda|caixa|volume)'),
    ('pessoa', '(pessoa|person|cliente|visitante|funcion|entregador|crianc|criança|adult)'),
    ('crianca', '(crianc|criança|infantil|bebe|bebê)'),
    ('adulto', '(adult)'),
    ('veiculo', '(veicul|veícul|carro|moto|vehicle)'),
    ('objeto', '(objet|object)'),
    ('retirada', '(retir|remov|removed)'),
    ('entrada', '(entrad|entrou|entry)'),
    ('saida', '(saída|saida|saiu|exit)'),
    ('atendimento', '(atend|service)'),
    ('fila', '(fila|queue|espera)'),
    ('porta', '(porta|door)'),
    ('balcao', '(balcão|balcao|counter)'),
    ('movimento', '(moviment|motion|activity)'),
    ('intrusao', '(intrus|intrusion)'),
    ('mudanca', '(mudan|change)'),
    ('capacete', '(capacete|helmet)'),
    ('mochila', '(mochila|backpack)'),
    ('bicicleta', '(biciclet|bicycle)'),
    ('animal', '(animal|cachorro|gato)'),
    ('caminhao', '(caminhão|caminhao|truck)')
  ) concepts(concept, pattern)
  where lower(coalesce(p_text,'') || ' ' || coalesce(p_type,'')) ~ pattern;
$$;
revoke all on function public.assistant_embedding_projection_v1(text,text) from public, anon;
grant execute on function public.assistant_embedding_projection_v1(text,text) to authenticated, service_role;

alter table public.events add column assistant_embedding_text text generated always as
  (public.assistant_embedding_projection_v1(headline || ' ' || summary, coalesce(corrected_event_type,primary_event_type))) stored;
alter table public.events add column assistant_embedding_hash text generated always as
  (md5('v1:' || public.assistant_embedding_projection_v1(headline || ' ' || summary, coalesce(corrected_event_type,primary_event_type)))) stored;

alter table public.event_embeddings
  add column source_hash text,
  add column text_version integer,
  add column source_updated_at timestamptz,
  add column expires_at timestamptz;
-- Existing/legacy rows remain stored but ineligible for client reads until rebuilt.
alter table public.event_embeddings add constraint event_embeddings_v3_shape check
  (text_version is null or (text_version = 1 and model = 'text-embedding-3-small'
   and dimensions = 768 and embedding is not null and extensions.vector_dims(embedding) = 768
   and source_hash is not null and expires_at is not null));
create index event_embeddings_v3_scope_idx on public.event_embeddings(organization_id,expires_at)
  where text_version = 1;

-- Restrictive direct-read policy also excludes stale/expired/deleted vectors.
create policy assistant_embeddings_current_v3 on public.event_embeddings as restrictive for select to authenticated
  using (text_version=1 and exists(select 1 from public.events e where e.id=event_id
    and e.organization_id=event_embeddings.organization_id and e.deleted_at is null and e.expires_at>now()
    and e.assistant_embedding_hash=source_hash));

-- One DB-wide durable token ceiling; reservations are never refunded after uncertain
-- provider failures, so concurrent workers/retries cannot bypass the daily budget.
grant usage on schema private to service_role;
create table private.assistant_embedding_control_v3 (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  backfill_enabled boolean not null default false,
  daily_token_limit integer not null default 100000 check(daily_token_limit between 1 and 1000000),
  budget_day date not null default current_date,
  reserved_tokens integer not null default 0 check(reserved_tokens >= 0)
);
insert into private.assistant_embedding_control_v3(singleton) values(true);
create table private.assistant_embedding_jobs_v3 (
  event_id uuid primary key references public.events(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_hash text not null,
  status text not null default 'queued' check(status in ('queued','processing','retry','failed','done')),
  attempts integer not null default 0,
  next_retry_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index assistant_embedding_jobs_v3_ready_idx on private.assistant_embedding_jobs_v3(next_retry_at)
  where status in ('queued','retry','processing');
revoke all on private.assistant_embedding_control_v3, private.assistant_embedding_jobs_v3 from public,anon,authenticated;
grant select,insert,update,delete on private.assistant_embedding_control_v3, private.assistant_embedding_jobs_v3 to service_role;
alter table private.assistant_embedding_control_v3 enable row level security;
alter table private.assistant_embedding_jobs_v3 enable row level security;

-- Triggers need owner privileges to invalidate derived data on authenticated review
-- edits. They are private, cannot be invoked through Data API, and derive tenant IDs.
create function private.assistant_embedding_event_changed_v3()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deleted_at is not null or new.expires_at <= now() then
    delete from public.event_embeddings where event_id=new.id;
    delete from private.assistant_embedding_jobs_v3 where event_id=new.id;
    return new;
  end if;
  if tg_op='UPDATE' and old.assistant_embedding_hash=new.assistant_embedding_hash
    and old.organization_id=new.organization_id and old.expires_at=new.expires_at then return new; end if;
  delete from public.event_embeddings where event_id=new.id;
  if (select enabled from private.assistant_embedding_control_v3 where singleton) then
    insert into private.assistant_embedding_jobs_v3(event_id,organization_id,source_hash)
      values(new.id,new.organization_id,new.assistant_embedding_hash)
    on conflict(event_id) do update set organization_id=excluded.organization_id,
      source_hash=excluded.source_hash,status='queued',attempts=0,next_retry_at=now(),lease_token=null,lease_expires_at=null;
  else
    delete from private.assistant_embedding_jobs_v3 where event_id=new.id;
  end if;
  return new;
end; $$;
revoke all on function private.assistant_embedding_event_changed_v3() from public,anon,authenticated,service_role;
create trigger assistant_embedding_event_changed_v3 after insert or update of
  headline,summary,primary_event_type,corrected_event_type,deleted_at,expires_at,organization_id
  on public.events for each row execute function private.assistant_embedding_event_changed_v3();

create function private.assistant_embedding_validate_v3()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not exists(select 1 from public.events e where e.id=new.event_id and e.organization_id=new.organization_id
    and e.deleted_at is null and e.expires_at>now() and e.assistant_embedding_hash=new.source_hash) then
    raise exception 'embedding_source_invalid';
  end if;
  return new;
end; $$;
revoke all on function private.assistant_embedding_validate_v3() from public,anon,authenticated;
grant execute on function private.assistant_embedding_validate_v3() to service_role;
create trigger assistant_embedding_validate_v3 before insert or update on public.event_embeddings
  for each row execute function private.assistant_embedding_validate_v3();

create function public.assistant_claim_embedding_jobs_v3(p_limit integer default 16)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_control private.assistant_embedding_control_v3%rowtype; v_job record; v_rows jsonb='[]'; v_reserve integer;
begin
  select * into v_control from private.assistant_embedding_control_v3 where singleton for update;
  if not v_control.enabled then return v_rows; end if;
  if v_control.budget_day <> current_date then
    update private.assistant_embedding_control_v3 set budget_day=current_date,reserved_tokens=0 where singleton;
    v_control.reserved_tokens=0;
  end if;
  -- Invalid/expired sources are never submitted, even before retention cron runs.
  delete from public.event_embeddings b where not exists(select 1 from public.events e
    where e.id=b.event_id and e.deleted_at is null and e.expires_at>now());
  delete from private.assistant_embedding_jobs_v3 q where not exists(select 1 from public.events e
    where e.id=q.event_id and e.deleted_at is null and e.expires_at>now());
  update private.assistant_embedding_jobs_v3 set status='failed',lease_token=null,lease_expires_at=null
    where status='processing' and lease_expires_at<=now() and attempts>=3;
  for v_job in
    select q.event_id,e.organization_id,e.assistant_embedding_hash,e.assistant_embedding_text
    from private.assistant_embedding_jobs_v3 q join public.events e on e.id=q.event_id
    where e.deleted_at is null and e.expires_at>now() and q.source_hash=e.assistant_embedding_hash
      and q.attempts<3 and ((q.status in ('queued','retry') and q.next_retry_at<=now())
      or (q.status='processing' and q.lease_expires_at<=now()))
    order by q.next_retry_at,q.event_id limit greatest(1,least(coalesce(p_limit,16),16))
    for update of q skip locked
  loop
    v_reserve=octet_length(v_job.assistant_embedding_text); -- conservative token upper bound
    exit when v_control.reserved_tokens+v_reserve>v_control.daily_token_limit;
    v_control.reserved_tokens=v_control.reserved_tokens+v_reserve;
    update private.assistant_embedding_jobs_v3 set status='processing',attempts=attempts+1,
      lease_token=gen_random_uuid(),lease_expires_at=now()+interval '90 seconds'
      where event_id=v_job.event_id;
    v_rows=v_rows || jsonb_build_array(jsonb_build_object('eventId',v_job.event_id,
      'organizationId',v_job.organization_id,'sourceHash',v_job.assistant_embedding_hash,
      'text',v_job.assistant_embedding_text,'leaseToken',(select lease_token from private.assistant_embedding_jobs_v3 where event_id=v_job.event_id)));
  end loop;
  update private.assistant_embedding_control_v3 set reserved_tokens=v_control.reserved_tokens where singleton;
  return v_rows;
end; $$;
revoke all on function public.assistant_claim_embedding_jobs_v3(integer) from public,anon,authenticated;
grant execute on function public.assistant_claim_embedding_jobs_v3(integer) to service_role;

create function public.assistant_finish_embedding_job_v3(p_event_id uuid,p_lease_token uuid,p_source_hash text,p_embedding extensions.vector default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_event public.events%rowtype; v_job private.assistant_embedding_jobs_v3%rowtype;
begin
  -- Lock ordering agrees with event update triggers; no stale overwrite after edits.
  select * into v_event from public.events where id=p_event_id for update;
  if not found then return false; end if;
  select * into v_job from private.assistant_embedding_jobs_v3 where event_id=p_event_id for update;
  if not found or v_job.status<>'processing' or v_job.lease_token is distinct from p_lease_token
    or v_job.lease_expires_at<=now() or v_job.source_hash<>p_source_hash
    or v_event.assistant_embedding_hash<>p_source_hash or v_event.deleted_at is not null
    or v_event.expires_at<=now() then return false; end if;
  if p_embedding is null then
    update private.assistant_embedding_jobs_v3 set status=case when attempts>=3 then 'failed' else 'retry' end,
      next_retry_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_token=null,lease_expires_at=null
      where event_id=p_event_id;
    return false;
  end if;
  if extensions.vector_dims(p_embedding)<>768 then raise exception 'embedding_dimensions_invalid'; end if;
  insert into public.event_embeddings(event_id,organization_id,model,dimensions,embedding,source_hash,text_version,source_updated_at,expires_at)
    values(p_event_id,v_event.organization_id,'text-embedding-3-small',768,p_embedding,p_source_hash,1,v_event.updated_at,v_event.expires_at)
  on conflict(event_id) do update set organization_id=excluded.organization_id,model=excluded.model,dimensions=excluded.dimensions,
    embedding=excluded.embedding,source_hash=excluded.source_hash,text_version=excluded.text_version,
    source_updated_at=excluded.source_updated_at,expires_at=excluded.expires_at,created_at=now();
  update private.assistant_embedding_jobs_v3 set status='done',lease_token=null,lease_expires_at=null where event_id=p_event_id;
  return true;
end; $$;
revoke all on function public.assistant_finish_embedding_job_v3(uuid,uuid,text,extensions.vector) from public,anon,authenticated;
grant execute on function public.assistant_finish_embedding_job_v3(uuid,uuid,text,extensions.vector) to service_role;

-- Explicit, bounded backfill. No implicit insertion of existing rows in migration.
create function public.assistant_enqueue_embedding_backfill_v3(p_organization_id uuid,p_from timestamptz,p_to timestamptz,p_limit integer default 100)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if not exists(select 1 from private.assistant_embedding_control_v3 where singleton and enabled and backfill_enabled) then
    raise exception 'embedding_backfill_disabled'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'invalid_period'; end if;
  insert into private.assistant_embedding_jobs_v3(event_id,organization_id,source_hash)
    select e.id,e.organization_id,e.assistant_embedding_hash from public.events e
    where e.organization_id=p_organization_id and e.started_at>=p_from and e.started_at<p_to
      and e.deleted_at is null and e.expires_at>now()
      and not exists(select 1 from private.assistant_embedding_jobs_v3 q where q.event_id=e.id)
      and not exists(select 1 from public.event_embeddings b where b.event_id=e.id and b.source_hash=e.assistant_embedding_hash and b.text_version=1)
    order by e.started_at,e.id limit greatest(1,least(coalesce(p_limit,100),100)) on conflict do nothing;
  get diagnostics v_count=row_count; return v_count;
end; $$;
revoke all on function public.assistant_enqueue_embedding_backfill_v3(uuid,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.assistant_enqueue_embedding_backfill_v3(uuid,timestamptz,timestamptz,integer) to service_role;

-- RRF over exact filtered vectors. No ANN/HNSW until measured at real tenant scale.
-- User JWT only: SECURITY INVOKER preserves existing RLS (including restrictive MFA).
create function public.assistant_hybrid_event_search_v3(
  p_organization_id uuid,p_from timestamptz,p_to timestamptz,p_query text default null,
  p_embedding extensions.vector default null,p_camera_id uuid default null,p_site_id uuid default null,
  p_zone_id uuid default null,p_event_types text[] default null,p_apparent_age_group text default null,
  p_after_confirmed_closing boolean default null,p_requires_review boolean default null,
  p_review_filter text default 'all',p_has_people boolean default null,p_has_vehicles boolean default null,
  p_min_confidence numeric default null,p_limit integer default 12)
returns jsonb language plpgsql stable security invoker set search_path = '' set statement_timeout = '1500ms' as $$
declare v_query text; v_important boolean; v_range text; v_start time; v_end time; v_result jsonb;
begin
  if (select auth.uid()) is null or not private.is_org_member(p_organization_id)
    or not public.current_session_meets_mfa_policy() then raise exception 'not_authorized' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_to<=p_from then raise exception 'invalid_period'; end if;
  if p_review_filter is null or p_review_filter not in ('all','pending','required','reviewed','useful','irrelevant','incorrect') then raise exception 'invalid_review_filter'; end if;
  if length(coalesce(p_query,''))>2048 then raise exception 'query_too_long'; end if;
  if p_apparent_age_group is not null and p_apparent_age_group not in ('child','adult') then raise exception 'invalid_age_group'; end if;
  if p_embedding is not null and (extensions.vector_dims(p_embedding)<>768 or extensions.vector_norm(p_embedding)=0) then raise exception 'embedding_dimensions_invalid'; end if;
  v_important=position('@important' in lower(coalesce(p_query,'')))>0;
  v_range=substring(coalesce(p_query,'') from '@time=([0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2})');
  if v_range is not null then v_start=split_part(v_range,'-',1)::time; v_end=split_part(v_range,'-',2)::time; end if;
  v_query=btrim(regexp_replace(regexp_replace(coalesce(p_query,''),'@time=[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}',' ','g'),'@important',' ','gi'));
  with scoped as materialized (
    select e.*,c.name as camera_name,s.name as site_name
    from public.events e join public.cameras c on c.id=e.camera_id and c.organization_id=p_organization_id
      join public.sites s on s.id=e.site_id and s.organization_id=p_organization_id
    where e.organization_id=p_organization_id and e.deleted_at is null and e.expires_at>now()
      and e.started_at>=p_from and e.started_at<p_to
      and (p_camera_id is null or e.camera_id=p_camera_id) and (p_site_id is null or e.site_id=p_site_id)
      and (p_zone_id is null or p_zone_id=any(e.zone_ids))
      and (p_event_types is null or coalesce(e.corrected_event_type,e.primary_event_type)=any(p_event_types))
      and (p_after_confirmed_closing is null or e.after_confirmed_closing=p_after_confirmed_closing)
      and (p_requires_review is null or e.requires_review=p_requires_review)
      and (p_min_confidence is null or e.confidence>=p_min_confidence)
      and (e.human_verdict is distinct from 'irrelevant' or p_review_filter in ('irrelevant','reviewed'))
      and (p_review_filter='all' or (p_review_filter='pending' and e.review_status='pending')
        or (p_review_filter='required' and e.requires_review) or (p_review_filter='reviewed' and e.human_reviewed_at is not null) or e.human_verdict=p_review_filter)
      and (p_has_people is null or p_has_people=exists(select 1 from public.event_people person where person.event_id=e.id and person.organization_id=p_organization_id))
      and (p_has_vehicles is null or p_has_vehicles=exists(select 1 from public.event_vehicles vehicle where vehicle.event_id=e.id and vehicle.organization_id=p_organization_id))
      and (v_start is null or case when v_start<v_end then
        (e.started_at at time zone s.timezone)::time>=v_start and (e.started_at at time zone s.timezone)::time<v_end
        else (e.started_at at time zone s.timezone)::time>=v_start or (e.started_at at time zone s.timezone)::time<v_end end)
      and (not v_important or e.requires_review or coalesce(e.corrected_event_type,e.primary_event_type) in ('zone_intrusion','unusual_activity','object_removed','scene_change')
        or exists(select 1 from public.intelligent_alerts a where a.organization_id=p_organization_id and a.status in ('open','acknowledged') and e.id=any(a.evidence_event_ids))
        or exists(select 1 from public.operational_deviations d where d.organization_id=p_organization_id and d.status='active' and e.id=any(d.evidence_event_ids)))
      and (p_apparent_age_group is null or exists(select 1
        from jsonb_array_elements(case when jsonb_typeof(e.analyzed_payload->'people')='array' then e.analyzed_payload->'people' else '[]'::jsonb end) person
        where person->>'apparentAgeGroup'=p_apparent_age_group and case when person->>'apparentAgeGroupConfidence' ~ '^[0-9]+([.][0-9]+)?$'
          then (person->>'apparentAgeGroupConfidence')::numeric else 0 end>=0.60))
  ), lexical as (
    select id,row_number() over(order by ts_rank_cd(search_document,websearch_to_tsquery('portuguese'::regconfig,v_query)) desc,started_at desc,id) as rank
    from scoped where v_query='' or search_document @@ websearch_to_tsquery('portuguese'::regconfig,v_query)
      or headline ilike '%'||v_query||'%' or summary ilike '%'||v_query||'%'
    order by rank limit 100
  ), vectors as materialized (
    select e.id,b.embedding operator(extensions.<=>) p_embedding as distance
    from scoped e join public.event_embeddings b on b.event_id=e.id and b.organization_id=p_organization_id
    where b.model='text-embedding-3-small' and b.dimensions=768 and b.text_version=1
      and b.source_hash=e.assistant_embedding_hash and b.expires_at>now() and extensions.vector_dims(b.embedding)=768
  ), semantic as (
    select id,row_number() over(order by distance,id) as rank from vectors
    where distance<=0.35 order by distance,id limit 100
  ), fused as (
    select coalesce(l.id,s.id) as id,coalesce(1.0/(60+l.rank),0)+coalesce(1.0/(60+s.rank),0) as score,
      l.id is not null as lexical_match,s.id is not null as semantic_match
    from lexical l full join semantic s on l.id=s.id
  ), deduplicated as (
    select e.*,f.score,f.lexical_match,f.semantic_match,
      row_number() over(partition by coalesce(e.operational_session_id,e.interaction_group_id,e.id) order by f.score desc,e.started_at desc,e.id) as sequence_rank
    from fused f join scoped e on e.id=f.id
  ), selected as (
    select * from deduplicated where sequence_rank=1 order by score desc,started_at desc,id
    limit greatest(1,least(coalesce(p_limit,12),50))
  )
  select jsonb_build_object('total',null,'totalIsExact',false,'returnedCount',(select count(*) from selected),
    'embeddingCoverage',(select count(*) from vectors),'retrievalMode',case when p_embedding is null then 'lexical' else 'hybrid' end,
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',id,'startedAt',started_at,'endedAt',ended_at,
      'headline',headline,'summary',summary,'eventType',coalesce(corrected_event_type,primary_event_type),
      'confidence',confidence,'requiresReview',requires_review,'cameraId',camera_id,'cameraName',camera_name,
      'siteId',site_id,'siteName',site_name,'matchType',case when lexical_match and semantic_match then 'hybrid' when semantic_match then 'semantic' else 'lexical' end)
      order by score desc,started_at desc,id) from selected),'[]'::jsonb)) into v_result;
  return v_result;
end; $$;
revoke all on function public.assistant_hybrid_event_search_v3(uuid,timestamptz,timestamptz,text,extensions.vector,uuid,uuid,uuid,text[],text,boolean,boolean,text,boolean,boolean,numeric,integer) from public,anon,service_role;
grant execute on function public.assistant_hybrid_event_search_v3(uuid,timestamptz,timestamptz,text,extensions.vector,uuid,uuid,uuid,text[],text,boolean,boolean,text,boolean,boolean,numeric,integer) to authenticated;
commit;
