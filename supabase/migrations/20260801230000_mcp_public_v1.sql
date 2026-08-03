begin;

-- OAuth MCP usa um papel PostgreSQL próprio e estritamente somente leitura.
-- O JWT emitido pelo hook abaixo recebe role=monitoria_mcp_readonly.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'monitoria_mcp_readonly'
  ) then
    create role monitoria_mcp_readonly nologin;
  end if;
end
$$;

grant monitoria_mcp_readonly to authenticator;
grant usage on schema public, storage to monitoria_mcp_readonly;

create table if not exists public.mcp_oauth_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  client_name text null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  approved_scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz null,
  constraint mcp_oauth_grants_client_check check (length(client_id) between 3 and 300),
  constraint mcp_oauth_grants_scopes_check check (cardinality(approved_scopes) <= 20)
);

create unique index if not exists mcp_oauth_grants_identity_uidx
  on public.mcp_oauth_grants(user_id, client_id, organization_id);
create index if not exists mcp_oauth_grants_active_idx
  on public.mcp_oauth_grants(user_id, client_id, organization_id)
  where revoked_at is null;

create table if not exists public.mcp_server_config (
  singleton boolean primary key default true check (singleton),
  resource_uri text not null,
  toolset_version text not null default '1.0.0',
  updated_at timestamptz not null default now(),
  constraint mcp_server_config_resource_check check (
    resource_uri ~ '^https://[^[:space:]]+/mcp$'
  )
);

insert into public.mcp_server_config(singleton, resource_uri, toolset_version)
values (true, 'https://monitoria.cam/mcp', '1.0.0')
on conflict (singleton) do update set
  toolset_version = excluded.toolset_version,
  updated_at = now();

create table if not exists public.mcp_tool_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  organization_id uuid null references public.organizations(id) on delete set null,
  tool_name text not null,
  status text not null,
  duration_ms integer not null default 0,
  result_count integer not null default 0,
  argument_hash text not null,
  error_code text null,
  created_at timestamptz not null default now(),
  constraint mcp_tool_audit_status_check check (status in ('success', 'error')),
  constraint mcp_tool_audit_duration_check check (duration_ms >= 0),
  constraint mcp_tool_audit_count_check check (result_count >= 0),
  constraint mcp_tool_audit_hash_check check (length(argument_hash) = 64)
);

create index if not exists mcp_tool_audit_org_time_idx
  on public.mcp_tool_audit_logs(organization_id, created_at desc);
create index if not exists mcp_tool_audit_user_client_idx
  on public.mcp_tool_audit_logs(user_id, client_id, created_at desc);

create table if not exists public.monitoria_capability_registry (
  module text primary key,
  status text not null,
  introduced_phase text not null,
  description text not null,
  updated_at timestamptz not null default now(),
  constraint monitoria_capability_status_check check (
    status in ('available', 'planned', 'disabled')
  )
);

insert into public.monitoria_capability_registry(
  module,
  status,
  introduced_phase,
  description
)
values
  ('events', 'available', 'base', 'Eventos visuais estruturados'),
  ('visual_states', 'available', '1', 'Estados e transições visuais'),
  ('person_continuity', 'available', '2', 'Memória curta de pessoas prováveis'),
  ('operational_sessions', 'available', '3', 'Sessões e capítulos operacionais'),
  ('vehicle_continuity', 'available', '3.5', 'Memória temporária de veículos prováveis'),
  ('complexity_routing', 'available', '3.5', 'Roteamento visual por complexidade'),
  ('mcp_public_v1', 'available', '3.8', 'Ferramentas MCP públicas e somente leitura'),
  ('routines', 'planned', '4', 'Rotinas e padrões operacionais'),
  ('deviations', 'planned', '4', 'Desvios em relação ao padrão observado'),
  ('processes', 'planned', '5', 'Processos operacionais configurados'),
  ('camera_health', 'planned', '7', 'Saúde, obstrução e drift da câmera'),
  ('alerts', 'planned', '12', 'Alertas operacionais inteligentes')
on conflict (module) do update set
  status = excluded.status,
  introduced_phase = excluded.introduced_phase,
  description = excluded.description,
  updated_at = now();

create table if not exists public.operational_insights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete cascade,
  camera_id uuid null references public.cameras(id) on delete cascade,
  insight_type text not null,
  status text not null default 'active',
  severity text not null default 'info',
  title text not null,
  summary text not null,
  confidence numeric(5,4) not null default 0,
  observed_at timestamptz not null,
  valid_until timestamptz null,
  source_entity_type text null,
  source_entity_id uuid null,
  evidence_event_ids uuid[] not null default '{}',
  phase_source text not null default 'future',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_insights_type_check check (
    insight_type in ('routine', 'deviation', 'process', 'camera_health', 'alert', 'other')
  ),
  constraint operational_insights_status_check check (
    status in ('active', 'resolved', 'expired', 'dismissed', 'informational')
  ),
  constraint operational_insights_severity_check check (
    severity in ('info', 'low', 'medium', 'high', 'critical')
  ),
  constraint operational_insights_confidence_check check (
    confidence between 0 and 1
  ),
  constraint operational_insights_data_check check (
    jsonb_typeof(data) = 'object'
  ),
  constraint operational_insights_time_check check (
    valid_until is null or valid_until >= observed_at
  )
);

create index if not exists operational_insights_org_time_idx
  on public.operational_insights(organization_id, observed_at desc);
create index if not exists operational_insights_camera_time_idx
  on public.operational_insights(camera_id, observed_at desc)
  where camera_id is not null;
create index if not exists operational_insights_type_status_idx
  on public.operational_insights(organization_id, insight_type, status, observed_at desc);
create index if not exists operational_insights_evidence_gin
  on public.operational_insights using gin(evidence_event_ids);

alter table public.mcp_oauth_grants enable row level security;
alter table public.mcp_server_config enable row level security;
alter table public.mcp_tool_audit_logs enable row level security;
alter table public.monitoria_capability_registry enable row level security;
alter table public.operational_insights enable row level security;

drop policy if exists mcp_oauth_grants_select_own on public.mcp_oauth_grants;
create policy mcp_oauth_grants_select_own
on public.mcp_oauth_grants
for select
to authenticated
using (
  user_id = auth.uid()
  and (
    nullif(auth.jwt() ->> 'client_id', '') is null
    or client_id = nullif(auth.jwt() ->> 'client_id', '')
  )
);

drop policy if exists mcp_oauth_grants_insert_own on public.mcp_oauth_grants;
create policy mcp_oauth_grants_insert_own
on public.mcp_oauth_grants
for insert
to authenticated
with check (
  user_id = auth.uid()
  and nullif(auth.jwt() ->> 'client_id', '') is null
  and exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = mcp_oauth_grants.organization_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists mcp_oauth_grants_update_own on public.mcp_oauth_grants;
create policy mcp_oauth_grants_update_own
on public.mcp_oauth_grants
for update
to authenticated
using (
  user_id = auth.uid()
  and nullif(auth.jwt() ->> 'client_id', '') is null
)
with check (
  user_id = auth.uid()
  and nullif(auth.jwt() ->> 'client_id', '') is null
  and exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = mcp_oauth_grants.organization_id
      and membership.user_id = auth.uid()
  )
);

drop policy if exists mcp_oauth_grants_delete_own on public.mcp_oauth_grants;
create policy mcp_oauth_grants_delete_own
on public.mcp_oauth_grants
for delete
to authenticated
using (
  user_id = auth.uid()
  and nullif(auth.jwt() ->> 'client_id', '') is null
);

drop policy if exists mcp_tool_audit_insert_own on public.mcp_tool_audit_logs;
create policy mcp_tool_audit_insert_own
on public.mcp_tool_audit_logs
for insert
to authenticated
with check (
  user_id = auth.uid()
  and nullif(auth.jwt() ->> 'client_id', '') is not null
  and client_id = nullif(auth.jwt() ->> 'client_id', '')
  and (
    organization_id is null
    or exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = mcp_tool_audit_logs.organization_id
        and membership.user_id = auth.uid()
    )
  )
);

drop policy if exists mcp_tool_audit_select_own on public.mcp_tool_audit_logs;
create policy mcp_tool_audit_select_own
on public.mcp_tool_audit_logs
for select
to authenticated
using (
  user_id = auth.uid()
  and nullif(auth.jwt() ->> 'client_id', '') is null
);

drop policy if exists monitoria_capability_registry_select on public.monitoria_capability_registry;
create policy monitoria_capability_registry_select
on public.monitoria_capability_registry
for select
to authenticated
using (true);

drop policy if exists operational_insights_select on public.operational_insights;
create policy operational_insights_select
on public.operational_insights
for select
to authenticated
using (private.is_org_member(organization_id));

grant select, insert, update, delete on public.mcp_oauth_grants to authenticated;
revoke all on public.mcp_server_config from public, anon, authenticated;
grant select, insert on public.mcp_tool_audit_logs to authenticated;
grant select on public.monitoria_capability_registry to authenticated;
grant select on public.operational_insights to authenticated;

create or replace function private.mcp_client_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'client_id', '');
$$;

create or replace function private.mcp_org_granted(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.mcp_client_id() is null then true
    else exists (
      select 1
      from public.mcp_oauth_grants grant_row
      where grant_row.user_id = auth.uid()
        and grant_row.client_id = private.mcp_client_id()
        and grant_row.organization_id = target_organization_id
        and grant_row.revoked_at is null
    )
  end;
$$;

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = target_organization_id
        and membership.user_id = auth.uid()
    )
    and private.mcp_org_granted(target_organization_id);
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = target_organization_id
        and membership.user_id = auth.uid()
        and membership.role = any(allowed_roles)
    )
    and private.mcp_client_id() is null;
$$;

-- O papel MCP recebe políticas SELECT explícitas e nenhuma permissão de escrita.
-- As ferramentas públicas consultam somente as tabelas abaixo e RPCs aprovadas.
drop policy if exists organizations_mcp_select_granted on public.organizations;
create policy organizations_mcp_select_granted
on public.organizations
for select
to monitoria_mcp_readonly
using (private.mcp_org_granted(id));

drop policy if exists organization_members_mcp_select_own on public.organization_members;
create policy organization_members_mcp_select_own
on public.organization_members
for select
to monitoria_mcp_readonly
using (
  user_id = auth.uid()
  and private.mcp_org_granted(organization_id)
);

drop policy if exists mcp_oauth_grants_select_token_client on public.mcp_oauth_grants;
create policy mcp_oauth_grants_select_token_client
on public.mcp_oauth_grants
for select
to monitoria_mcp_readonly
using (
  user_id = auth.uid()
  and client_id = private.mcp_client_id()
  and revoked_at is null
);

drop policy if exists mcp_tool_audit_insert_token_client on public.mcp_tool_audit_logs;
create policy mcp_tool_audit_insert_token_client
on public.mcp_tool_audit_logs
for insert
to monitoria_mcp_readonly
with check (
  user_id = auth.uid()
  and client_id = private.mcp_client_id()
  and (
    organization_id is null
    or private.mcp_org_granted(organization_id)
  )
);

drop policy if exists monitoria_capability_registry_mcp_select on public.monitoria_capability_registry;
create policy monitoria_capability_registry_mcp_select
on public.monitoria_capability_registry
for select
to monitoria_mcp_readonly
using (true);

drop policy if exists operational_insights_mcp_select on public.operational_insights;
create policy operational_insights_mcp_select
on public.operational_insights
for select
to monitoria_mcp_readonly
using (private.mcp_org_granted(organization_id));

do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'sites',
    'cameras',
    'events',
    'event_people',
    'event_vehicles',
    'event_reviews',
    'storage_assets',
    'operational_sessions',
    'operational_session_events',
    'operational_session_participants',
    'operational_session_outcomes'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      policy_name := table_name || '_mcp_select_granted';
      execute format('drop policy if exists %I on public.%I', policy_name, table_name);
      execute format(
        'create policy %I on public.%I for select to monitoria_mcp_readonly using (private.mcp_org_granted(organization_id))',
        policy_name,
        table_name
      );
      execute format('grant select on public.%I to monitoria_mcp_readonly', table_name);
    end if;
  end loop;
end
$$;

grant select on public.organizations, public.organization_members, public.mcp_oauth_grants,
  public.monitoria_capability_registry, public.operational_insights
  to monitoria_mcp_readonly;
grant insert on public.mcp_tool_audit_logs to monitoria_mcp_readonly;

drop policy if exists storage_read_org_assets_mcp on storage.objects;
create policy storage_read_org_assets_mcp
on storage.objects
for select
to monitoria_mcp_readonly
using (
  bucket_id = any(array['analysis-frames'::text, 'event-keyframes'::text, 'preserved-clips'::text])
  and case
    when coalesce((storage.foldername(name))[1], '') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then private.mcp_org_granted(((storage.foldername(name))[1])::uuid)
    else false
  end
);

grant select on storage.objects to monitoria_mcp_readonly;

revoke all on function private.mcp_client_id() from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function private.mcp_org_granted(uuid) from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function private.is_org_member(uuid) from public, anon, authenticated, monitoria_mcp_readonly;
revoke all on function private.has_org_role(uuid, public.organization_role[]) from public, anon, authenticated, monitoria_mcp_readonly;

create or replace function public.monitoria_mcp_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  token_user_id uuid;
  token_client_id text;
  resource_uri text;
begin
  claims := coalesce(event -> 'claims', '{}'::jsonb);
  token_user_id := coalesce(
    nullif(event ->> 'user_id', '')::uuid,
    nullif(claims ->> 'sub', '')::uuid
  );
  token_client_id := nullif(claims ->> 'client_id', '');

  if token_user_id is null or token_client_id is null then
    return event;
  end if;

  if not exists (
    select 1
    from public.mcp_oauth_grants grant_row
    where grant_row.user_id = token_user_id
      and grant_row.client_id = token_client_id
      and grant_row.revoked_at is null
  ) then
    return event;
  end if;

  select config.resource_uri
  into resource_uri
  from public.mcp_server_config config
  where config.singleton = true;

  if resource_uri is null then
    raise exception 'mcp_resource_uri_not_configured';
  end if;

  claims := pg_catalog.jsonb_set(
    claims,
    '{aud}',
    pg_catalog.to_jsonb(resource_uri),
    true
  );
  claims := pg_catalog.jsonb_set(
    claims,
    '{monitoria_mcp}',
    'true'::jsonb,
    true
  );
  claims := pg_catalog.jsonb_set(
    claims,
    '{role}',
    '"monitoria_mcp_readonly"'::jsonb,
    true
  );

  return pg_catalog.jsonb_set(event, '{claims}', claims, true);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.monitoria_mcp_access_token_hook(jsonb)
  to supabase_auth_admin;
revoke execute on function public.monitoria_mcp_access_token_hook(jsonb)
  from public, anon, authenticated;

create or replace function public.mcp_get_capabilities(
  p_organization_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_org_member(p_organization_id)
      then pg_catalog.jsonb_build_object('error', 'not_authorized')
    else pg_catalog.jsonb_build_object(
      'modules', coalesce(
        (
          select pg_catalog.jsonb_object_agg(
            registry.module,
            pg_catalog.jsonb_build_object(
              'status', registry.status,
              'introduced_phase', registry.introduced_phase,
              'description', registry.description
            )
            order by registry.module
          )
          from public.monitoria_capability_registry registry
        ),
        '{}'::jsonb
      ),
      'mcp_mode', 'read_only',
      'toolset_version', '1.0.0',
      'future_data_contract', 'operational_insights_v1'
    )
  end;
$$;

create or replace function public.mcp_period_event_summary(
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
set search_path = ''
as $$
  with selected as (
    select event.*
    from public.events event
    where event.organization_id = p_organization_id
      and event.deleted_at is null
      and event.started_at >= p_from
      and event.started_at < p_to
      and (p_camera_id is null or event.camera_id = p_camera_id)
      and (p_site_id is null or event.site_id = p_site_id)
      and private.is_org_member(p_organization_id)
  ), by_type as (
    select
      coalesce(corrected_event_type, primary_event_type) as event_type,
      count(*)::integer as count
    from selected
    group by coalesce(corrected_event_type, primary_event_type)
  )
  select pg_catalog.jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'totalEvents', (select count(*) from selected),
    'eventsWithPeople', (select count(*) from selected where probable_people_count > 0),
    'eventsWithVehicles', (
      select count(distinct selected.id)
      from selected
      join public.event_vehicles vehicle on vehicle.event_id = selected.id
    ),
    'requiresReview', (select count(*) from selected where requires_review),
    'averageConfidence', coalesce((select avg(confidence) from selected), 0),
    'probablePeople', coalesce((select sum(probable_people_count) from selected), 0),
    'probableCustomers', coalesce((select sum(probable_customer_count) from selected), 0),
    'probableStaff', coalesce((select sum(probable_staff_count) from selected), 0),
    'byType', coalesce(
      (select pg_catalog.jsonb_object_agg(event_type, count) from by_type),
      '{}'::jsonb
    )
  );
$$;

create or replace function public.search_monitoria_insights(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_camera_id uuid default null,
  p_site_id uuid default null,
  p_insight_types text[] default null,
  p_severity text[] default null,
  p_status text[] default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(
  id uuid,
  observed_at timestamptz,
  valid_until timestamptz,
  site_id uuid,
  camera_id uuid,
  insight_type text,
  status text,
  severity text,
  title text,
  summary text,
  confidence numeric,
  evidence_event_ids uuid[],
  phase_source text,
  data jsonb,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select insight.*
    from public.operational_insights insight
    where insight.organization_id = p_organization_id
      and private.is_org_member(p_organization_id)
      and (p_from is null or insight.observed_at >= p_from)
      and (p_to is null or insight.observed_at < p_to)
      and (p_camera_id is null or insight.camera_id = p_camera_id)
      and (p_site_id is null or insight.site_id = p_site_id)
      and (p_insight_types is null or insight.insight_type = any(p_insight_types))
      and (p_severity is null or insight.severity = any(p_severity))
      and (p_status is null or insight.status = any(p_status))
      and (
        p_query is null
        or insight.title ilike '%' || p_query || '%'
        or insight.summary ilike '%' || p_query || '%'
      )
  )
  select
    filtered.id,
    filtered.observed_at,
    filtered.valid_until,
    filtered.site_id,
    filtered.camera_id,
    filtered.insight_type,
    filtered.status,
    filtered.severity,
    filtered.title,
    filtered.summary,
    filtered.confidence,
    filtered.evidence_event_ids,
    filtered.phase_source,
    filtered.data,
    count(*) over() as total_count
  from filtered
  order by
    case filtered.severity
      when 'critical' then 5
      when 'high' then 4
      when 'medium' then 3
      when 'low' then 2
      else 1
    end desc,
    filtered.observed_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.cleanup_mcp_audit_logs(
  p_days integer default 90
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service_role_required';
  end if;

  delete from public.mcp_tool_audit_logs
  where created_at < now() - make_interval(days => greatest(7, least(p_days, 365)));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

grant execute on function public.mcp_get_capabilities(uuid)
  to authenticated, monitoria_mcp_readonly;
grant execute on function public.mcp_period_event_summary(uuid, timestamptz, timestamptz, uuid, uuid)
  to authenticated, monitoria_mcp_readonly;
grant execute on function public.search_monitoria_insights(uuid, timestamptz, timestamptz, uuid, uuid, text[], text[], text[], text, integer, integer)
  to authenticated, monitoria_mcp_readonly;

-- Lista fechada de RPCs preexistentes que o toolset público v1 pode executar.
grant execute on function public.search_monitoria_events(
  uuid, text, timestamptz, timestamptz, uuid, uuid, text, numeric, text, boolean, boolean, integer, integer
) to monitoria_mcp_readonly;
grant execute on function public.compare_monitoria_periods(
  uuid, timestamptz, timestamptz, timestamptz, timestamptz, uuid, uuid
) to monitoria_mcp_readonly;
grant execute on function public.search_operational_sessions(
  uuid, timestamptz, timestamptz, uuid, uuid, text, text, integer, integer
) to monitoria_mcp_readonly;
grant execute on function public.assistant_operational_sessions_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to monitoria_mcp_readonly;
grant execute on function public.assistant_visual_state_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to monitoria_mcp_readonly;
grant execute on function public.assistant_operating_hours_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to monitoria_mcp_readonly;
grant execute on function public.assistant_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to monitoria_mcp_readonly;
grant execute on function public.assistant_vehicle_continuity_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to monitoria_mcp_readonly;

revoke all on function public.cleanup_mcp_audit_logs(integer)
  from public, anon, authenticated, monitoria_mcp_readonly;

commit;
