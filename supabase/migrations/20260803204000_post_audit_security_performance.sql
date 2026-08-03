-- MonitorIA — correções pós-auditoria das fases 1–7.
-- Segurança MCP, otimização de RLS e índices de FKs da inteligência.

begin;

-- RPCs do MCP nunca precisam ser executáveis pelo papel anônimo.
revoke all on function public.mcp_get_capabilities(uuid)
  from public, anon;
grant execute on function public.mcp_get_capabilities(uuid)
  to authenticated, service_role;

revoke all on function public.mcp_period_event_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) from public, anon;
grant execute on function public.mcp_period_event_summary(
  uuid, timestamptz, timestamptz, uuid, uuid
) to authenticated, service_role;

revoke all on function public.search_monitoria_insights(
  uuid, timestamptz, timestamptz, uuid, uuid,
  text[], text[], text[], text, integer, integer
) from public, anon;
grant execute on function public.search_monitoria_insights(
  uuid, timestamptz, timestamptz, uuid, uuid,
  text[], text[], text[], text, integer, integer
) to authenticated, service_role;

-- Evita reavaliar auth.uid()/auth.jwt() para cada linha nas policies MCP.
drop policy if exists mcp_oauth_grants_delete_own
  on public.mcp_oauth_grants;
create policy mcp_oauth_grants_delete_own
  on public.mcp_oauth_grants
  for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    and nullif(((select auth.jwt()) ->> 'client_id'), '') is null
  );

drop policy if exists mcp_oauth_grants_insert_own
  on public.mcp_oauth_grants;
create policy mcp_oauth_grants_insert_own
  on public.mcp_oauth_grants
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and nullif(((select auth.jwt()) ->> 'client_id'), '') is null
    and exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = mcp_oauth_grants.organization_id
        and membership.user_id = (select auth.uid())
    )
  );

drop policy if exists mcp_oauth_grants_select_own
  on public.mcp_oauth_grants;
create policy mcp_oauth_grants_select_own
  on public.mcp_oauth_grants
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and (
      nullif(((select auth.jwt()) ->> 'client_id'), '') is null
      or client_id = nullif(((select auth.jwt()) ->> 'client_id'), '')
    )
  );

drop policy if exists mcp_oauth_grants_update_own
  on public.mcp_oauth_grants;
create policy mcp_oauth_grants_update_own
  on public.mcp_oauth_grants
  for update
  to authenticated
  using (
    user_id = (select auth.uid())
    and nullif(((select auth.jwt()) ->> 'client_id'), '') is null
  )
  with check (
    user_id = (select auth.uid())
    and nullif(((select auth.jwt()) ->> 'client_id'), '') is null
    and exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = mcp_oauth_grants.organization_id
        and membership.user_id = (select auth.uid())
    )
  );

drop policy if exists mcp_oauth_grants_select_token_client
  on public.mcp_oauth_grants;
create policy mcp_oauth_grants_select_token_client
  on public.mcp_oauth_grants
  for select
  to monitoria_mcp_readonly
  using (
    user_id = (select auth.uid())
    and client_id = (select private.mcp_client_id())
    and revoked_at is null
  );

drop policy if exists mcp_tool_audit_insert_own
  on public.mcp_tool_audit_logs;
create policy mcp_tool_audit_insert_own
  on public.mcp_tool_audit_logs
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and nullif(((select auth.jwt()) ->> 'client_id'), '') is not null
    and client_id = nullif(((select auth.jwt()) ->> 'client_id'), '')
    and (
      organization_id is null
      or exists (
        select 1
        from public.organization_members membership
        where membership.organization_id = mcp_tool_audit_logs.organization_id
          and membership.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists mcp_tool_audit_select_own
  on public.mcp_tool_audit_logs;
create policy mcp_tool_audit_select_own
  on public.mcp_tool_audit_logs
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    and nullif(((select auth.jwt()) ->> 'client_id'), '') is null
  );

drop policy if exists mcp_tool_audit_insert_token_client
  on public.mcp_tool_audit_logs;
create policy mcp_tool_audit_insert_token_client
  on public.mcp_tool_audit_logs
  for insert
  to monitoria_mcp_readonly
  with check (
    user_id = (select auth.uid())
    and client_id = (select private.mcp_client_id())
    and (
      organization_id is null
      or private.mcp_org_granted(organization_id)
    )
  );

drop policy if exists organization_members_mcp_select_own
  on public.organization_members;
create policy organization_members_mcp_select_own
  on public.organization_members
  for select
  to monitoria_mcp_readonly
  using (
    user_id = (select auth.uid())
    and private.mcp_org_granted(organization_id)
  );

-- Policies ALL também participavam de SELECT e duplicavam as policies de leitura.
-- Elas são separadas em INSERT/UPDATE/DELETE sem alterar as permissões.
drop policy if exists camera_staff_profiles_manage
  on public.camera_staff_profiles;
create policy camera_staff_profiles_insert_admin
  on public.camera_staff_profiles
  for insert to authenticated
  with check (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );
create policy camera_staff_profiles_update_admin
  on public.camera_staff_profiles
  for update to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  )
  with check (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );
create policy camera_staff_profiles_delete_admin
  on public.camera_staff_profiles
  for delete to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );

drop policy if exists camera_visual_entities_manage
  on public.camera_visual_entities;
create policy camera_visual_entities_insert_admin
  on public.camera_visual_entities
  for insert to authenticated
  with check (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );
create policy camera_visual_entities_update_admin
  on public.camera_visual_entities
  for update to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  )
  with check (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );
create policy camera_visual_entities_delete_admin
  on public.camera_visual_entities
  for delete to authenticated
  using (
    private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
  );

drop policy if exists operational_process_steps_write_admin
  on public.operational_process_steps;
create policy operational_process_steps_insert_admin
  on public.operational_process_steps
  for insert to authenticated
  with check (
    organization_id is not null
    and private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
    and exists (
      select 1
      from public.operational_process_definitions definition
      where definition.id = operational_process_steps.process_definition_id
        and definition.organization_id = operational_process_steps.organization_id
        and definition.organization_id is not null
    )
  );
create policy operational_process_steps_update_admin
  on public.operational_process_steps
  for update to authenticated
  using (
    organization_id is not null
    and private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
    and exists (
      select 1
      from public.operational_process_definitions definition
      where definition.id = operational_process_steps.process_definition_id
        and definition.organization_id = operational_process_steps.organization_id
        and definition.organization_id is not null
    )
  )
  with check (
    organization_id is not null
    and private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
    and exists (
      select 1
      from public.operational_process_definitions definition
      where definition.id = operational_process_steps.process_definition_id
        and definition.organization_id = operational_process_steps.organization_id
        and definition.organization_id is not null
    )
  );
create policy operational_process_steps_delete_admin
  on public.operational_process_steps
  for delete to authenticated
  using (
    organization_id is not null
    and private.has_org_role(
      organization_id,
      array['owner'::public.organization_role, 'admin'::public.organization_role]
    )
    and exists (
      select 1
      from public.operational_process_definitions definition
      where definition.id = operational_process_steps.process_definition_id
        and definition.organization_id = operational_process_steps.organization_id
        and definition.organization_id is not null
    )
  );

-- Cria apenas índices de FK ainda não cobertos por um índice não parcial.
-- O escopo é limitado às tabelas da inteligência e aos vínculos diretamente usados.
do $$
declare
  v_row record;
  v_index_name text;
begin
  for v_row in
    select
      table_namespace.nspname as schema_name,
      table_class.oid as table_oid,
      table_class.relname as table_name,
      constraint_def.conname as constraint_name,
      constraint_def.conkey as constraint_columns,
      string_agg(
        format('%I', column_def.attname),
        ', ' order by key_column.ordinality
      ) as column_sql
    from pg_constraint constraint_def
    join pg_class table_class
      on table_class.oid = constraint_def.conrelid
    join pg_namespace table_namespace
      on table_namespace.oid = table_class.relnamespace
    join unnest(constraint_def.conkey) with ordinality
      as key_column(attnum, ordinality)
      on true
    join pg_attribute column_def
      on column_def.attrelid = table_class.oid
     and column_def.attnum = key_column.attnum
    where constraint_def.contype = 'f'
      and table_namespace.nspname = 'public'
      and table_class.relname = any(array[
        'analysis_jobs',
        'analysis_routing_decisions',
        'camera_health_baselines',
        'camera_health_incidents',
        'camera_health_observations',
        'camera_health_refresh_runs',
        'capture_sessions',
        'event_person_memory_links',
        'event_vehicle_memory_links',
        'events',
        'interaction_group_events',
        'interaction_groups',
        'mcp_oauth_grants',
        'operational_deviations',
        'operational_expectations',
        'operational_insights',
        'operational_process_definitions',
        'operational_process_deviations',
        'operational_process_instance_steps',
        'operational_process_instances',
        'operational_process_refresh_queue',
        'operational_process_refresh_runs',
        'operational_process_steps',
        'operational_session_events',
        'operational_session_groups',
        'operational_session_outcomes',
        'operational_session_participants',
        'operational_sessions',
        'person_memory_instances',
        'routine_observations',
        'routine_refresh_runs',
        'site_operating_sessions',
        'staff_profile_candidates',
        'staff_profile_learning_queue',
        'staff_profile_learning_runs',
        'staff_profile_match_decisions',
        'staff_profile_observations',
        'staff_profile_update_proposals',
        'staff_profile_versions',
        'vehicle_memory_instances',
        'visual_entity_current_states',
        'visual_state_observations',
        'visual_state_reviews',
        'visual_state_transitions'
      ]::text[])
    group by
      table_namespace.nspname,
      table_class.oid,
      table_class.relname,
      constraint_def.conname,
      constraint_def.conkey
  loop
    if not exists (
      select 1
      from pg_index existing_index
      where existing_index.indrelid = v_row.table_oid
        and existing_index.indisvalid
        and existing_index.indisready
        and existing_index.indpred is null
        and existing_index.indexprs is null
        and (
          select array_agg(index_column.attnum order by index_column.ordinality)
          from unnest(existing_index.indkey::smallint[]) with ordinality
            as index_column(attnum, ordinality)
          where index_column.ordinality <= cardinality(v_row.constraint_columns)
        ) = v_row.constraint_columns
    ) then
      v_index_name := left(
        format(
          'idx_%s_fk_%s',
          v_row.table_name,
          substr(md5(v_row.constraint_name), 1, 8)
        ),
        63
      );

      execute format(
        'create index if not exists %I on %I.%I (%s)',
        v_index_name,
        v_row.schema_name,
        v_row.table_name,
        v_row.column_sql
      );
    end if;
  end loop;
end
$$;

commit;
