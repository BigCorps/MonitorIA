create or replace view public.camera_retention_usage
with (security_invoker=true)
as
with asset_totals as (
  select asset.organization_id,asset.camera_id,
    count(*) filter(where asset.deleted_at is null and asset.retention_class='long_term') as long_term_assets,
    count(*) filter(where asset.deleted_at is null and asset.retention_class='temporary') as temporary_assets,
    count(*) filter(where asset.deleted_at is null and asset.retention_class='clip') as clip_assets,
    coalesce(sum(asset.byte_size) filter(where asset.deleted_at is null and asset.retention_class='long_term'),0) as long_term_bytes,
    coalesce(sum(asset.byte_size) filter(where asset.deleted_at is null and asset.retention_class='temporary'),0) as temporary_bytes,
    coalesce(sum(asset.byte_size) filter(where asset.deleted_at is null and asset.retention_class='clip'),0) as clip_bytes,
    min(asset.expires_at) filter(where asset.deleted_at is null and asset.retention_class='temporary') as next_temporary_expiry,
    min(asset.captured_at) filter(where asset.deleted_at is null and asset.retention_class='long_term') as oldest_long_term_asset,
    max(asset.captured_at) filter(where asset.deleted_at is null and asset.retention_class='long_term') as newest_long_term_asset
  from public.storage_assets asset
  group by asset.organization_id,asset.camera_id
),
event_totals as (
  select event.organization_id,event.camera_id,
    count(*) filter(where event.deleted_at is null) as retained_events,
    min(event.started_at) filter(where event.deleted_at is null) as oldest_event,
    max(event.started_at) filter(where event.deleted_at is null) as newest_event
  from public.events event
  group by event.organization_id,event.camera_id
),
health as (
  select event.organization_id,event.camera_id,
    count(*) filter(
      where event.deleted_at is null
        and coalesce(asset_count.long_term_count,0)<>least(
          coalesce((event.retention_snapshot->>'longTermKeyframes')::integer,1),
          coalesce(asset_count.available_frame_count,0)
        )
    ) as events_with_keyframe_mismatch
  from public.events event
  left join lateral (
    select count(*) filter(where asset.deleted_at is null and asset.retention_class='long_term') as long_term_count,
           count(*) filter(where asset.deleted_at is null and asset.kind<>'preserved_clip'::public.asset_kind) as available_frame_count
    from public.storage_assets asset where asset.event_id=event.id
  ) asset_count on true
  group by event.organization_id,event.camera_id
)
select camera.id as camera_id,camera.organization_id,camera.name as camera_name,
  entitlement.access_source,entitlement.plan_code,entitlement.metadata_retention_days,
  entitlement.long_term_keyframes,entitlement.temporary_frame_days,
  entitlement.clip_enabled,entitlement.clip_retention_days,
  coalesce(event_totals.retained_events,0)::bigint as retained_events,
  coalesce(asset_totals.long_term_assets,0)::bigint as long_term_assets,
  coalesce(asset_totals.temporary_assets,0)::bigint as temporary_assets,
  coalesce(asset_totals.clip_assets,0)::bigint as clip_assets,
  coalesce(asset_totals.long_term_bytes,0)::bigint as long_term_bytes,
  coalesce(asset_totals.temporary_bytes,0)::bigint as temporary_bytes,
  coalesce(asset_totals.clip_bytes,0)::bigint as clip_bytes,
  (coalesce(asset_totals.long_term_bytes,0)+coalesce(asset_totals.temporary_bytes,0)+coalesce(asset_totals.clip_bytes,0))::bigint as total_bytes,
  asset_totals.next_temporary_expiry,
  coalesce(event_totals.oldest_event,asset_totals.oldest_long_term_asset) as oldest_retained_at,
  coalesce(event_totals.newest_event,asset_totals.newest_long_term_asset) as newest_retained_at,
  coalesce(health.events_with_keyframe_mismatch,0)::bigint as events_with_keyframe_mismatch
from public.cameras camera
cross join lateral public.resolve_camera_entitlement(camera.id) entitlement
left join asset_totals on asset_totals.organization_id=camera.organization_id and asset_totals.camera_id=camera.id
left join event_totals on event_totals.organization_id=camera.organization_id and event_totals.camera_id=camera.id
left join health on health.organization_id=camera.organization_id and health.camera_id=camera.id;

grant select on public.camera_retention_usage to authenticated,service_role;
comment on view public.camera_retention_usage is 'Uso de retenção por câmera, bytes por classe e divergências de keyframes.';
