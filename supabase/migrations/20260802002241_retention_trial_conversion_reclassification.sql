create or replace function private.promote_converted_monitoria_trial()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_plan public.camera_plan_catalog%rowtype;
  v_snapshot jsonb;
  v_job_id uuid;
begin
  if old.status=new.status or new.status<>'converted' then return new; end if;
  select plan.* into v_plan
  from public.camera_subscriptions subscription
  join public.camera_plan_catalog plan on plan.code=subscription.plan_code
  where subscription.camera_id=new.camera_id;
  if not found then raise exception 'converted_trial_subscription_plan_not_found'; end if;
  v_snapshot:=private.monitoria_retention_snapshot(v_plan.code);
  update public.analysis_jobs
  set analysis_plan_code=v_plan.code,retention_snapshot=v_snapshot,updated_at=now()
  where trial_run_id=new.id;
  update public.events
  set retention_snapshot=v_snapshot,
      expires_at=started_at+pg_catalog.make_interval(days=>v_plan.metadata_retention_days),
      updated_at=now()
  where trial_run_id=new.id;
  for v_job_id in select job.id from public.analysis_jobs job where job.trial_run_id=new.id loop
    perform private.reclassify_monitoria_job_assets(v_job_id);
  end loop;
  update public.assistant_allowances
  set included_interactions=used_interactions,updated_at=now()
  where source='trial' and source_reference_id=new.id;
  return new;
end;
$$;
revoke all on function private.promote_converted_monitoria_trial() from public,anon,authenticated;
grant execute on function private.promote_converted_monitoria_trial() to service_role;
