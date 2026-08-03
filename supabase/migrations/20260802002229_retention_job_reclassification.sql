create or replace function private.reclassify_monitoria_job_assets(p_job_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_job public.analysis_jobs%rowtype;
  v_event public.events%rowtype;
  v_snapshot jsonb;
  v_plan_code text;
  v_long_term_count integer;
  v_metadata_days integer;
  v_temporary_days integer;
  v_clip_days integer;
  v_trial_status public.trial_run_status;
  v_trial_purge_after timestamptz;
  v_promoted integer:=0;
  v_temporary integer:=0;
  v_clips integer:=0;
begin
  select job.* into v_job from public.analysis_jobs job where job.id=p_job_id;
  if not found then return jsonb_build_object('success',false,'reason','analysis_job_not_found','analysisJobId',p_job_id); end if;
  v_plan_code:=coalesce(nullif(v_job.retention_snapshot->>'planCode',''),v_job.analysis_plan_code,'basic');
  v_snapshot:=v_job.retention_snapshot;
  if v_snapshot is null or v_snapshot='{}'::jsonb then
    v_snapshot:=private.monitoria_retention_snapshot(v_plan_code);
    update public.analysis_jobs set retention_snapshot=v_snapshot where id=p_job_id;
  end if;
  v_long_term_count:=greatest(0,coalesce((v_snapshot->>'longTermKeyframes')::integer,1));
  v_metadata_days:=greatest(1,coalesce((v_snapshot->>'metadataRetentionDays')::integer,365));
  v_temporary_days:=greatest(1,coalesce((v_snapshot->>'temporaryFrameDays')::integer,3));
  v_clip_days:=greatest(1,coalesce((v_snapshot->>'clipRetentionDays')::integer,30));
  select event.* into v_event from public.events event where event.analysis_job_id=p_job_id;
  if v_job.trial_run_id is not null then
    select trial.status,trial.purge_after into v_trial_status,v_trial_purge_after from public.trial_runs trial where trial.id=v_job.trial_run_id;
  end if;
  update public.storage_assets asset
  set retention_class='clip',frame_label='clip',retention_snapshot=v_snapshot,
      expires_at=case when coalesce((v_snapshot->>'clipEnabled')::boolean,false)
        then coalesce(asset.captured_at,v_job.ended_at,asset.created_at)+pg_catalog.make_interval(days=>v_clip_days)
        else least(coalesce(asset.expires_at,now()),now()) end
  where asset.analysis_job_id=p_job_id and asset.kind='preserved_clip'::public.asset_kind and asset.deleted_at is null;
  get diagnostics v_clips=row_count;
  if v_event.id is null then
    update public.storage_assets asset
    set event_id=null,kind='analysis_frame'::public.asset_kind,retention_class='temporary',retention_snapshot=v_snapshot,
        expires_at=coalesce(asset.captured_at,v_job.ended_at,asset.created_at)+pg_catalog.make_interval(days=>v_temporary_days)
    where asset.analysis_job_id=p_job_id and asset.kind<>'preserved_clip'::public.asset_kind and asset.deleted_at is null;
    get diagnostics v_temporary=row_count;
  else
    update public.events set retention_snapshot=v_snapshot,
      expires_at=v_event.started_at+pg_catalog.make_interval(days=>v_metadata_days),updated_at=now()
    where id=v_event.id;
    with ranked as (
      select asset.id,row_number() over(order by private.monitoria_frame_priority(v_plan_code,asset.frame_label),asset.captured_at nulls last,asset.id) as frame_rank
      from public.storage_assets asset
      where asset.analysis_job_id=p_job_id and asset.kind<>'preserved_clip'::public.asset_kind and asset.deleted_at is null
    )
    update public.storage_assets asset
    set event_id=v_event.id,
        kind=case when ranked.frame_rank<=v_long_term_count then 'event_keyframe'::public.asset_kind else 'analysis_frame'::public.asset_kind end,
        retention_class=case when ranked.frame_rank<=v_long_term_count then 'long_term' else 'temporary' end,
        retention_snapshot=v_snapshot,
        expires_at=case when ranked.frame_rank<=v_long_term_count
          then v_event.started_at+pg_catalog.make_interval(days=>v_metadata_days)
          else coalesce(asset.captured_at,v_job.ended_at,asset.created_at)+pg_catalog.make_interval(days=>v_temporary_days) end
    from ranked where asset.id=ranked.id;
    select count(*) filter(where retention_class='long_term'),count(*) filter(where retention_class='temporary')
      into v_promoted,v_temporary from public.storage_assets
      where analysis_job_id=p_job_id and kind<>'preserved_clip'::public.asset_kind and deleted_at is null;
  end if;
  if v_trial_status is distinct from 'converted'::public.trial_run_status and v_trial_purge_after is not null then
    update public.events set expires_at=least(expires_at,v_trial_purge_after),updated_at=now() where analysis_job_id=p_job_id;
    update public.storage_assets set expires_at=least(expires_at,v_trial_purge_after)
      where analysis_job_id=p_job_id and deleted_at is null and expires_at is not null;
  end if;
  return jsonb_build_object('success',true,'analysisJobId',p_job_id,'eventId',v_event.id,'planCode',v_plan_code,'longTermAssets',v_promoted,'temporaryAssets',v_temporary,'clipAssets',v_clips);
end;
$$;
revoke all on function private.reclassify_monitoria_job_assets(uuid) from public,anon,authenticated;
grant execute on function private.reclassify_monitoria_job_assets(uuid) to service_role;

create or replace function private.reclassify_monitoria_assets_after_update()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_job_id uuid;
begin
  if pg_trigger_depth()>1 then return null; end if;
  for v_job_id in
    select distinct n.analysis_job_id
    from new_rows n join old_rows o on o.id=n.id
    where n.analysis_job_id is not null and (
      n.event_id is distinct from o.event_id or n.expires_at is distinct from o.expires_at or n.kind is distinct from o.kind or n.retention_class is distinct from o.retention_class
    )
  loop
    perform private.reclassify_monitoria_job_assets(v_job_id);
  end loop;
  return null;
end;
$$;
revoke all on function private.reclassify_monitoria_assets_after_update() from public,anon,authenticated;
grant execute on function private.reclassify_monitoria_assets_after_update() to service_role;
drop trigger if exists trg_storage_assets_retention_reclassify on public.storage_assets;
create trigger trg_storage_assets_retention_reclassify after update on public.storage_assets
referencing old table as old_rows new table as new_rows
for each statement execute function private.reclassify_monitoria_assets_after_update();
comment on function private.reclassify_monitoria_job_assets(uuid) is 'Classifica os frames de um job: 1/2/3 longos conforme o plano e os demais temporários.';
