-- Separa políticas ALL em operações específicas e cria índices de FKs.

-- Índices de chaves estrangeiras consultadas com frequência.
create index if not exists agent_cameras_camera_idx on public.agent_cameras(camera_id);
create index if not exists agent_health_org_idx on public.agent_health(organization_id);
create index if not exists agents_site_idx on public.agents(site_id);
create index if not exists analysis_jobs_capture_session_idx on public.analysis_jobs(capture_session_id);
create index if not exists analysis_jobs_org_idx on public.analysis_jobs(organization_id);
create index if not exists analysis_jobs_profile_idx on public.analysis_jobs(profile_id);
create index if not exists audit_logs_actor_user_idx on public.audit_logs(actor_user_id);
create index if not exists camera_profiles_created_by_idx on public.camera_profiles(created_by);
create index if not exists camera_profiles_org_idx on public.camera_profiles(organization_id);
create index if not exists camera_zones_org_idx on public.camera_zones(organization_id);
create index if not exists capture_sessions_agent_idx on public.capture_sessions(agent_id);
create index if not exists capture_sessions_org_idx on public.capture_sessions(organization_id);
create index if not exists event_embeddings_org_idx on public.event_embeddings(organization_id);
create index if not exists event_people_org_idx on public.event_people(organization_id);
create index if not exists event_plate_suggestions_vehicle_idx on public.event_plate_suggestions(event_vehicle_id);
create index if not exists event_plate_suggestions_org_idx on public.event_plate_suggestions(organization_id);
create index if not exists event_vehicles_org_idx on public.event_vehicles(organization_id);
create index if not exists events_profile_idx on public.events(profile_id);
create index if not exists events_site_idx on public.events(site_id);
create index if not exists organizations_created_by_idx on public.organizations(created_by);
create index if not exists storage_assets_analysis_job_idx on public.storage_assets(analysis_job_id);
create index if not exists storage_assets_camera_idx on public.storage_assets(camera_id);
create index if not exists storage_assets_event_idx on public.storage_assets(event_id);
create index if not exists storage_assets_org_idx on public.storage_assets(organization_id);
create index if not exists usage_events_analysis_job_idx on public.usage_events(analysis_job_id);
create index if not exists usage_events_camera_idx on public.usage_events(camera_id);

-- Remove políticas permissivas duplicadas criadas com FOR ALL.
drop policy if exists organization_members_manage_admin on public.organization_members;
drop policy if exists retention_manage_admin on public.retention_policies;
drop policy if exists sites_manage_admin on public.sites;
drop policy if exists cameras_manage_admin on public.cameras;
drop policy if exists camera_profiles_manage_admin on public.camera_profiles;
drop policy if exists camera_zones_manage_admin on public.camera_zones;
drop policy if exists agents_manage_admin on public.agents;
drop policy if exists agent_cameras_manage_admin on public.agent_cameras;

-- Restringe as políticas existentes ao papel autenticado.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname in ('public', 'storage')
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Políticas administrativas separadas por operação.
create policy organization_members_insert_admin on public.organization_members
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy organization_members_update_admin on public.organization_members
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy organization_members_delete_admin on public.organization_members
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy retention_insert_admin on public.retention_policies
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy retention_update_admin on public.retention_policies
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy retention_delete_admin on public.retention_policies
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy sites_insert_admin on public.sites
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy sites_update_admin on public.sites
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy sites_delete_admin on public.sites
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy cameras_insert_admin on public.cameras
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy cameras_update_admin on public.cameras
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy cameras_delete_admin on public.cameras
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy camera_profiles_insert_admin on public.camera_profiles
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy camera_profiles_update_admin on public.camera_profiles
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy camera_profiles_delete_admin on public.camera_profiles
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy camera_zones_insert_admin on public.camera_zones
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy camera_zones_update_admin on public.camera_zones
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy camera_zones_delete_admin on public.camera_zones
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy agents_insert_admin on public.agents
for insert to authenticated
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy agents_update_admin on public.agents
for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]))
with check (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));
create policy agents_delete_admin on public.agents
for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin']::public.organization_role[]));

create policy agent_cameras_insert_admin on public.agent_cameras
for insert to authenticated
with check (exists (
  select 1 from public.agents a
  where a.id = agent_cameras.agent_id
    and private.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
));
create policy agent_cameras_update_admin on public.agent_cameras
for update to authenticated
using (exists (
  select 1 from public.agents a
  where a.id = agent_cameras.agent_id
    and private.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
))
with check (exists (
  select 1 from public.agents a
  where a.id = agent_cameras.agent_id
    and private.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
));
create policy agent_cameras_delete_admin on public.agent_cameras
for delete to authenticated
using (exists (
  select 1 from public.agents a
  where a.id = agent_cameras.agent_id
    and private.has_org_role(a.organization_id, array['owner','admin']::public.organization_role[])
));
