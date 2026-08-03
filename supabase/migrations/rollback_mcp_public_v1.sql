begin;

-- Desative o Custom Access Token Hook no painel do Supabase antes deste rollback.

-- Remove políticas do papel MCP em tabelas preexistentes.
drop policy if exists organizations_mcp_select_granted on public.organizations;
drop policy if exists organization_members_mcp_select_own on public.organization_members;
drop policy if exists storage_read_org_assets_mcp on storage.objects;

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
    end if;
  end loop;
end
$$;

drop function if exists public.monitoria_mcp_access_token_hook(jsonb);
drop function if exists public.cleanup_mcp_audit_logs(integer);
drop function if exists public.search_monitoria_insights(uuid, timestamptz, timestamptz, uuid, uuid, text[], text[], text[], text, integer, integer);
drop function if exists public.mcp_period_event_summary(uuid, timestamptz, timestamptz, uuid, uuid);
drop function if exists public.mcp_get_capabilities(uuid);

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
  );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, public.organization_role[]) from public, anon, authenticated;

drop function if exists private.mcp_org_granted(uuid);
drop function if exists private.mcp_client_id();

drop table if exists public.operational_insights cascade;
drop table if exists public.monitoria_capability_registry cascade;
drop table if exists public.mcp_tool_audit_logs cascade;
drop table if exists public.mcp_server_config cascade;
drop table if exists public.mcp_oauth_grants cascade;

-- Remove todas as concessões restantes antes de excluir o papel dedicado.
do $$
begin
  if exists (
    select 1 from pg_catalog.pg_roles where rolname = 'monitoria_mcp_readonly'
  ) then
    execute 'drop owned by monitoria_mcp_readonly';
    execute 'revoke monitoria_mcp_readonly from authenticator';
    execute 'drop role monitoria_mcp_readonly';
  end if;
end
$$;

commit;
