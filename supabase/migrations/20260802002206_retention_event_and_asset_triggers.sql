create or replace function private.capture_monitoria_event_retention()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_snapshot jsonb;
  v_days integer;
  v_trial_status public.trial_run_status;
  v_trial_purge_after timestamptz;
begin
  if new.analysis_job_id is null then return new; end if;
  select job.retention_snapshot into v_snapshot from public.analysis_jobs job where job.id=new.analysis_job_id;
  if v_snapshot is null or v_snapshot='{}'::jsonb then return new; end if;
  v_days:=greatest(1,coalesce((v_snapshot->>'metadataRetentionDays')::integer,365));
  new.retention_snapshot:=v_snapshot;
  new.expires_at:=new.started_at+pg_catalog.make_interval(days=>v_days);
  if new.trial_run_id is not null then
    select trial.status,trial.purge_after into v_trial_status,v_trial_purge_after from public.trial_runs trial where trial.id=new.trial_run_id;
    if v_trial_status is distinct from 'converted'::public.trial_run_status and v_trial_purge_after is not null then
      new.expires_at:=least(new.expires_at,v_trial_purge_after);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_monitoria_event_retention() from public,anon,authenticated;
grant execute on function private.capture_monitoria_event_retention() to service_role;
drop trigger if exists trg_zz_events_retention_snapshot on public.events;
create trigger trg_zz_events_retention_snapshot before insert or update of analysis_job_id,started_at,trial_run_id on public.events for each row execute function private.capture_monitoria_event_retention();

create or replace function private.classify_monitoria_storage_asset_insert()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_job public.analysis_jobs%rowtype;
  v_snapshot jsonb;
  v_temp_days integer;
  v_clip_days integer;
  v_trial_status public.trial_run_status;
  v_trial_purge_after timestamptz;
  v_file_name text;
begin
  v_file_name:=lower(regexp_replace(new.storage_path,'^.*/',''));
  if new.frame_label is null then
    new.frame_label:=case
      when v_file_name~'^start\.(jpg|jpeg|webp|png)$' then 'start'
      when v_file_name~'^peak\.(jpg|jpeg|webp|png)$' then 'peak'
      when v_file_name~'^end\.(jpg|jpeg|webp|png)$' then 'end'
      when v_file_name~'^extra\.(jpg|jpeg|webp|png)$' then 'extra'
      when new.kind='preserved_clip'::public.asset_kind then 'clip'
      when new.analysis_job_id is null then 'profile'
      else null end;
  end if;
  if new.analysis_job_id is null then
    if new.kind='preserved_clip'::public.asset_kind then new.retention_class:='clip'; new.frame_label:=coalesce(new.frame_label,'clip'); end if;
    return new;
  end if;
  select job.* into v_job from public.analysis_jobs job where job.id=new.analysis_job_id;
  if not found then return new; end if;
  v_snapshot:=v_job.retention_snapshot;
  if v_snapshot is null or v_snapshot='{}'::jsonb then v_snapshot:=private.monitoria_retention_snapshot(coalesce(v_job.analysis_plan_code,'basic')); end if;
  new.retention_snapshot:=coalesce(v_snapshot,'{}'::jsonb);
  if new.kind='preserved_clip'::public.asset_kind then
    v_clip_days:=greatest(1,coalesce((v_snapshot->>'clipRetentionDays')::integer,30));
    new.retention_class:='clip'; new.frame_label:='clip';
    new.expires_at:=coalesce(new.captured_at,v_job.ended_at,now())+pg_catalog.make_interval(days=>v_clip_days);
  else
    v_temp_days:=greatest(1,coalesce((v_snapshot->>'temporaryFrameDays')::integer,3));
    new.kind:='analysis_frame'::public.asset_kind; new.retention_class:='temporary';
    new.expires_at:=coalesce(new.captured_at,v_job.ended_at,now())+pg_catalog.make_interval(days=>v_temp_days);
  end if;
  if new.trial_run_id is not null then
    select trial.status,trial.purge_after into v_trial_status,v_trial_purge_after from public.trial_runs trial where trial.id=new.trial_run_id;
    if v_trial_status is distinct from 'converted'::public.trial_run_status and v_trial_purge_after is not null then new.expires_at:=least(new.expires_at,v_trial_purge_after); end if;
  end if;
  return new;
end;
$$;
revoke all on function private.classify_monitoria_storage_asset_insert() from public,anon,authenticated;
grant execute on function private.classify_monitoria_storage_asset_insert() to service_role;
drop trigger if exists trg_zz_storage_assets_retention_insert on public.storage_assets;
create trigger trg_zz_storage_assets_retention_insert before insert on public.storage_assets for each row execute function private.classify_monitoria_storage_asset_insert();

comment on column public.analysis_jobs.retention_snapshot is 'Snapshot imutável da política comercial de retenção usada no job.';
comment on column public.events.retention_snapshot is 'Snapshot da retenção aplicado ao acontecimento no momento da análise.';
comment on column public.storage_assets.frame_label is 'Papel temporal do frame: start, peak, end, extra, profile ou clip.';
comment on column public.storage_assets.retention_class is 'Classe operacional: temporary, long_term ou clip.';
comment on column public.storage_assets.retention_snapshot is 'Snapshot da política que determinou a expiração do objeto.';
