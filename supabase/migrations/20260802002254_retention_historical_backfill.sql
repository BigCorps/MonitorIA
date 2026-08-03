update public.analysis_jobs job
set retention_snapshot=private.monitoria_retention_snapshot(coalesce(job.analysis_plan_code,camera.analysis_plan_code,'basic'))
from public.cameras camera
where camera.id=job.camera_id and (job.retention_snapshot='{}'::jsonb or job.retention_snapshot is null);

update public.storage_assets asset
set frame_label=case
  when lower(regexp_replace(asset.storage_path,'^.*/',''))~'^start\.(jpg|jpeg|webp|png)$' then 'start'
  when lower(regexp_replace(asset.storage_path,'^.*/',''))~'^peak\.(jpg|jpeg|webp|png)$' then 'peak'
  when lower(regexp_replace(asset.storage_path,'^.*/',''))~'^end\.(jpg|jpeg|webp|png)$' then 'end'
  when lower(regexp_replace(asset.storage_path,'^.*/',''))~'^extra\.(jpg|jpeg|webp|png)$' then 'extra'
  when asset.kind='preserved_clip'::public.asset_kind then 'clip'
  when asset.analysis_job_id is null then 'profile'
  else asset.frame_label end
where asset.frame_label is null;

do $$
declare v_job_id uuid;
begin
  for v_job_id in select distinct asset.analysis_job_id from public.storage_assets asset where asset.analysis_job_id is not null order by asset.analysis_job_id loop
    perform private.reclassify_monitoria_job_assets(v_job_id);
  end loop;
end;
$$;

alter table public.retention_policies
  alter column keyframe_days set default 365,
  alter column metadata_days set default 365,
  alter column preserved_clip_days set default 30;
update public.retention_policies
set keyframe_days=365,metadata_days=365,preserved_clip_days=coalesce(preserved_clip_days,30),updated_at=now()
where keyframe_days<>365 or metadata_days<>365 or preserved_clip_days is null;
