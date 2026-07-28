-- Least-privilege grants for the MonitorIA Data API.
-- RLS still decides which rows each signed-in user may access.

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all sequences in schema public from anon;

revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from authenticated;

-- User-managed configuration tables.
grant select, insert, update on table public.organizations to authenticated;
grant select, insert, update, delete on table public.organization_members to authenticated;
grant select, insert, update, delete on table public.retention_policies to authenticated;
grant select, insert, update, delete on table public.sites to authenticated;
grant select, insert, update, delete on table public.cameras to authenticated;
grant select, insert, update, delete on table public.camera_profiles to authenticated;
grant select, insert, update, delete on table public.camera_zones to authenticated;
grant select, insert, update, delete on table public.agents to authenticated;
grant select, insert, update, delete on table public.agent_cameras to authenticated;

-- Operational data is written only by trusted backend/Agent credentials.
grant select on table public.agent_health to authenticated;
grant select on table public.capture_sessions to authenticated;
grant select on table public.analysis_jobs to authenticated;
grant select on table public.events to authenticated;
grant select on table public.event_people to authenticated;
grant select on table public.event_vehicles to authenticated;
grant select on table public.event_plate_suggestions to authenticated;
grant select on table public.storage_assets to authenticated;
grant select on table public.event_embeddings to authenticated;
grant select on table public.usage_events to authenticated;
grant select on table public.audit_logs to authenticated;

-- Prevent accidental execution of trigger helpers through the API.
revoke execute on function public.set_updated_at() from public, anon, authenticated;
