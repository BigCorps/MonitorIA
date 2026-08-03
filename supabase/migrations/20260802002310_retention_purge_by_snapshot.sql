create or replace function public.purge_expired_monitoria_metadata(p_limit integer default 500)
returns table(events_deleted bigint,jobs_deleted bigint,asset_rows_deleted bigint)
language plpgsql security definer set search_path=''
as $$
declare
  v_limit integer:=greatest(1,least(coalesce(p_limit,500),5000));
  v_events bigint:=0; v_jobs bigint:=0; v_assets bigint:=0;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'service_role_required'; end if;
  delete from public.storage_assets asset
  where asset.id in (
    select candidate.id from public.storage_assets candidate
    where candidate.deleted_at is not null and candidate.deleted_at<=now()-interval '1 hour'
    order by candidate.deleted_at limit v_limit
  );
  get diagnostics v_assets=row_count;
  delete from public.events event
  where event.id in (
    select candidate.id from public.events candidate
    where candidate.expires_at<=now()
      and not exists(select 1 from public.storage_assets asset where asset.event_id=candidate.id and asset.deleted_at is null)
    order by candidate.expires_at limit v_limit
  );
  get diagnostics v_events=row_count;
  delete from public.analysis_jobs job
  where job.id in (
    select candidate.id from public.analysis_jobs candidate
    where candidate.status in ('completed'::public.analysis_job_status,'failed'::public.analysis_job_status,'cancelled'::public.analysis_job_status)
      and candidate.ended_at<=now()-pg_catalog.make_interval(days=>greatest(1,coalesce((candidate.retention_snapshot->>'metadataRetentionDays')::integer,365)))
      and not exists(select 1 from public.events event where event.analysis_job_id=candidate.id)
      and not exists(select 1 from public.storage_assets asset where asset.analysis_job_id=candidate.id and asset.deleted_at is null)
    order by candidate.ended_at limit v_limit
  );
  get diagnostics v_jobs=row_count;
  return query select v_events,v_jobs,v_assets;
end;
$$;
revoke all on function public.purge_expired_monitoria_metadata(integer) from public,anon,authenticated;
grant execute on function public.purge_expired_monitoria_metadata(integer) to service_role;

create or replace function public.reclassify_monitoria_retention_batch(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_limit integer:=greatest(1,least(coalesce(p_limit,500),5000)); v_job_id uuid; v_processed integer:=0; v_results jsonb:='[]'::jsonb;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'service_role_required'; end if;
  for v_job_id in
    select job.id from public.analysis_jobs job
    where exists(select 1 from public.storage_assets asset where asset.analysis_job_id=job.id and asset.deleted_at is null)
    order by job.ended_at desc limit v_limit
  loop
    v_results:=v_results||jsonb_build_array(private.reclassify_monitoria_job_assets(v_job_id));
    v_processed:=v_processed+1;
  end loop;
  return jsonb_build_object('success',true,'processedJobs',v_processed,'results',v_results);
end;
$$;
revoke all on function public.reclassify_monitoria_retention_batch(integer) from public,anon,authenticated;
grant execute on function public.reclassify_monitoria_retention_batch(integer) to service_role;
