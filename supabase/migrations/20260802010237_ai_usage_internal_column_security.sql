revoke select on public.camera_usage_daily from authenticated;
revoke select on public.camera_usage_monthly from authenticated;
revoke select on public.organization_usage_monthly from authenticated;

grant select (organization_id,camera_id,usage_date,events_count,storage_bytes_added,keyframes_added,clips_added,updated_at)
  on public.camera_usage_daily to authenticated;
grant select (organization_id,camera_id,usage_month,events_count,storage_bytes_added,updated_at)
  on public.camera_usage_monthly to authenticated;
grant select (organization_id,usage_month,active_cameras,events_count,assistant_interactions,storage_bytes,estimated_egress_bytes,updated_at)
  on public.organization_usage_monthly to authenticated;
