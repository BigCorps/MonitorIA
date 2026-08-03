-- Rollback parcial das policies e dos índices criados pela pós-auditoria.
-- As revogações de acesso anônimo às RPCs MCP são mantidas por segurança.

begin;

-- Remove policies divididas e restaura os antigos ALL.
drop policy if exists camera_staff_profiles_insert_admin on public.camera_staff_profiles;
drop policy if exists camera_staff_profiles_update_admin on public.camera_staff_profiles;
drop policy if exists camera_staff_profiles_delete_admin on public.camera_staff_profiles;
create policy camera_staff_profiles_manage
  on public.camera_staff_profiles
  for all to authenticated
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

drop policy if exists camera_visual_entities_insert_admin on public.camera_visual_entities;
drop policy if exists camera_visual_entities_update_admin on public.camera_visual_entities;
drop policy if exists camera_visual_entities_delete_admin on public.camera_visual_entities;
create policy camera_visual_entities_manage
  on public.camera_visual_entities
  for all to authenticated
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

drop policy if exists operational_process_steps_insert_admin on public.operational_process_steps;
drop policy if exists operational_process_steps_update_admin on public.operational_process_steps;
drop policy if exists operational_process_steps_delete_admin on public.operational_process_steps;
create policy operational_process_steps_write_admin
  on public.operational_process_steps
  for all to authenticated
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

-- Remove somente índices com o padrão exclusivo desta migration.
do $$
declare
  v_index record;
begin
  for v_index in
    select schemaname, indexname
    from pg_indexes
    where schemaname = 'public'
      and indexname ~ '^idx_.+_fk_[0-9a-f]{8}$'
  loop
    execute format(
      'drop index if exists %I.%I',
      v_index.schemaname,
      v_index.indexname
    );
  end loop;
end
$$;

commit;
