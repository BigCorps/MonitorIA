-- MonitorIA — Fase 10
-- Segurança/LGPD e memória operacional do Assistente.

begin;

-- Solicitações de titulares. O texto livre fica separado do audit log para
-- impedir que detalhes pessoais sejam replicados em registros operacionais.
create table if not exists public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  request_type text not null check (request_type in (
    'confirmation', 'access', 'correction', 'information', 'restriction',
    'deletion', 'portability', 'opposition', 'review'
  )),
  scope text not null default 'account' check (scope in ('account', 'monitoring', 'all')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'received' check (status in (
    'received', 'identity_check', 'in_progress', 'completed', 'rejected', 'cancelled'
  )),
  response_due_at timestamptz not null default (now() + interval '15 days'),
  completed_at timestamptz,
  resolution_notes text not null default '' check (char_length(resolution_notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (completed_at is not null) or status <> 'completed')
);

create index if not exists privacy_requests_requester_created_idx
  on public.privacy_requests(requester_user_id, created_at desc);
create index if not exists privacy_requests_org_status_due_idx
  on public.privacy_requests(organization_id, status, response_due_at);

drop trigger if exists privacy_requests_set_updated_at on public.privacy_requests;
create trigger privacy_requests_set_updated_at
before update on public.privacy_requests
for each row execute function public.set_updated_at();

alter table public.privacy_requests enable row level security;

drop policy if exists privacy_requests_select_requester on public.privacy_requests;
create policy privacy_requests_select_requester
  on public.privacy_requests for select to authenticated
  using (requester_user_id = (select auth.uid()));

drop policy if exists privacy_requests_select_admin on public.privacy_requests;
create policy privacy_requests_select_admin
  on public.privacy_requests for select to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );

drop policy if exists privacy_requests_insert_requester on public.privacy_requests;
create policy privacy_requests_insert_requester
  on public.privacy_requests for insert to authenticated
  with check (
    requester_user_id = (select auth.uid())
    and private.is_org_member(organization_id)
    and status = 'received'
    and completed_at is null
    and resolution_notes = ''
  );

revoke all on table public.privacy_requests from public, anon, authenticated;
grant select, insert on table public.privacy_requests to authenticated;
grant all on table public.privacy_requests to service_role;

comment on table public.privacy_requests is
  'Canal autenticado para exercício de direitos de privacidade. Detalhes não são copiados para audit_logs.';

create or replace function private.audit_privacy_request_created()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, metadata
  ) values (
    new.organization_id,
    new.requester_user_id,
    'privacy_request.created',
    'privacy_request',
    new.id::text,
    jsonb_build_object('request_type', new.request_type, 'scope', new.scope)
  );
  return new;
end;
$$;

revoke all on function private.audit_privacy_request_created() from public, anon, authenticated;
drop trigger if exists privacy_request_audit_created on public.privacy_requests;
create trigger privacy_request_audit_created
after insert on public.privacy_requests
for each row execute function private.audit_privacy_request_created();

-- Rate limit compartilhado entre instâncias serverless. A chave do sujeito é
-- calculada no backend e a tabela não é exposta pela Data API.
create table if not exists private.api_rate_limit_buckets (
  scope text not null,
  subject text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (scope, subject, window_started_at)
);

create index if not exists api_rate_limit_buckets_expires_idx
  on private.api_rate_limit_buckets(expires_at);
revoke all on table private.api_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_api_rate_limit_v1(
  p_scope text,
  p_subject text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
  v_reset timestamptz;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_scope !~ '^[a-z0-9:_-]{2,80}$'
     or char_length(p_subject) not between 8 and 160
     or p_limit not between 1 and 10000
     or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid rate limit parameters' using errcode = '22023';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );
  v_reset := v_window + make_interval(secs => p_window_seconds);

  insert into private.api_rate_limit_buckets (
    scope, subject, window_started_at, request_count, expires_at
  ) values (p_scope, p_subject, v_window, 1, v_reset + interval '1 minute')
  on conflict (scope, subject, window_started_at)
  do update set request_count = private.api_rate_limit_buckets.request_count + 1
  returning request_count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'remaining', greatest(0, p_limit - v_count),
    'resetAt', v_reset,
    'retryAfterSeconds', greatest(1, ceil(extract(epoch from (v_reset - v_now)))::integer)
  );
end;
$$;

revoke all on function public.consume_api_rate_limit_v1(text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit_v1(text,text,integer,integer)
  to service_role;

create or replace function public.cleanup_api_rate_limits_v1()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_deleted integer;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  delete from private.api_rate_limit_buckets where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_api_rate_limits_v1() from public, anon, authenticated;
grant execute on function public.cleanup_api_rate_limits_v1() to service_role;

-- Métrica específica de fila. O banco calcula contagens e durações; a IA
-- apenas explica o JSON e deixa a incerteza explícita.
create or replace function public.assistant_queue_analysis_v1(
  p_organization_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_camera_id uuid default null,
  p_site_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, private, pg_temp
as $$
  with permitted as (
    select private.is_org_member(p_organization_id) as allowed
  ), queue_events as (
    select
      e.id,
      e.started_at,
      e.ended_at,
      greatest(coalesce(e.probable_customer_count, 0), coalesce(e.probable_people_count, 0)) as probable_people,
      extract(epoch from (coalesce(e.ended_at, e.started_at) - e.started_at))::numeric as duration_seconds
    from public.events e, permitted p
    where p.allowed
      and e.organization_id = p_organization_id
      and e.deleted_at is null
      and e.started_at >= p_from and e.started_at < p_to
      and (p_camera_id is null or e.camera_id = p_camera_id)
      and (p_site_id is null or e.site_id = p_site_id)
      and (
        e.tags && array['queue','queue_short','customer_queue','fila','espera']::text[]
        or e.primary_event_type in ('queue','customer_queue')
      )
  ), hourly as (
    select extract(hour from started_at)::integer as hour, count(*)::integer as total
    from queue_events group by 1 order by 1
  )
  select jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'queueEventCount', count(q.id),
    'averageObservedDurationSeconds', round(avg(q.duration_seconds), 1),
    'maximumProbablePeople', coalesce(max(q.probable_people), 0),
    'eventsByHour', coalesce((select jsonb_agg(jsonb_build_object('hour', h.hour, 'total', h.total)) from hourly h), '[]'::jsonb),
    'evidenceEventIds', coalesce((
      select jsonb_agg(x.id order by x.started_at desc)
      from (select id, started_at from queue_events order by started_at desc limit 12) x
    ), '[]'::jsonb),
    'limitations', jsonb_build_array(
      'A métrica depende de sinais explícitos de fila nos eventos.',
      'Duração observada não equivale necessariamente ao tempo individual de espera.'
    )
  )
  from queue_events q;
$$;

revoke all on function public.assistant_queue_analysis_v1(uuid,timestamptz,timestamptz,uuid,uuid)
  from public, anon;
grant execute on function public.assistant_queue_analysis_v1(uuid,timestamptz,timestamptz,uuid,uuid)
  to authenticated, service_role;

-- A leitura de placa permanece desativada por decisão de produto. O contrato
-- já força null; este trigger impede persistência acidental em profundidade.
create or replace function private.block_plate_suggestions_v1()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  raise exception 'advanced plate reading is disabled in this product version'
    using errcode = '42501';
end;
$$;

revoke all on function private.block_plate_suggestions_v1() from public, anon, authenticated;
drop trigger if exists block_plate_suggestions_v1 on public.event_plate_suggestions;
create trigger block_plate_suggestions_v1
before insert or update on public.event_plate_suggestions
for each row execute function private.block_plate_suggestions_v1();

revoke all on table public.event_plate_suggestions from anon, authenticated;
comment on table public.event_plate_suggestions is
  'Reservada para add-on futuro. Escrita e leitura de placa estão bloqueadas na versão atual.';

commit;
