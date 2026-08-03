create or replace function public.process_monitoria_trials()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to_exploration bigint := 0;
  v_to_expired bigint := 0;
begin
  perform private.require_monitoria_service_role();

  update public.trial_runs
  set status = 'exploration',
      capture_completed_at = coalesce(capture_completed_at, capture_ends_at, now()),
      status_reason = 'capture_completed',
      updated_at = now()
  where status = 'running'
    and capture_ends_at is not null
    and capture_ends_at <= now();

  get diagnostics v_to_exploration = row_count;

  update public.trial_runs
  set status = 'expired',
      expired_at = coalesce(expired_at, exploration_ends_at, now()),
      status_reason = 'exploration_expired',
      updated_at = now()
  where status in ('running', 'capture_completed', 'exploration')
    and exploration_ends_at is not null
    and exploration_ends_at <= now();

  get diagnostics v_to_expired = row_count;

  return jsonb_build_object(
    'movedToExploration', v_to_exploration,
    'movedToExpired', v_to_expired,
    'processedAt', now()
  );
end;
$$;

revoke all on function public.process_monitoria_trials()
  from public, anon, authenticated;
grant execute on function public.process_monitoria_trials()
  to service_role;

create or replace function public.purge_monitoria_trial_data(
  p_trial_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_events bigint := 0;
  v_jobs bigint := 0;
  v_assets bigint := 0;
  v_usage bigint := 0;
  v_threads bigint := 0;
begin
  perform private.require_monitoria_service_role();

  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.id = p_trial_run_id
  for update;

  if not found then
    raise exception 'trial_not_found';
  end if;

  if v_trial.status = 'purged' then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'trialId', v_trial.id
    );
  end if;

  if v_trial.status <> 'expired'
     or v_trial.purge_after is null
     or v_trial.purge_after > now() then
    raise exception 'trial_not_ready_for_purge';
  end if;

  if exists (
    select 1
    from public.storage_assets asset
    where asset.trial_run_id = v_trial.id
      and asset.deleted_at is null
      and asset.status <> 'deleted'
  ) then
    raise exception 'trial_storage_objects_not_deleted';
  end if;

  delete from public.assistant_threads thread
  where thread.organization_id = v_trial.organization_id
    and v_trial.capture_started_at is not null
    and thread.created_at >= v_trial.capture_started_at
    and thread.created_at < coalesce(v_trial.exploration_ends_at, now());
  get diagnostics v_threads = row_count;

  delete from public.assistant_usage_events usage
  using public.assistant_allowances allowance
  where usage.allowance_id = allowance.id
    and allowance.source = 'trial'
    and allowance.source_reference_id = v_trial.id;

  delete from public.assistant_allowances allowance
  where allowance.source = 'trial'
    and allowance.source_reference_id = v_trial.id;

  delete from public.events event
  where event.trial_run_id = v_trial.id;
  get diagnostics v_events = row_count;

  delete from public.analysis_jobs job
  where job.trial_run_id = v_trial.id;
  get diagnostics v_jobs = row_count;

  delete from public.storage_assets asset
  where asset.trial_run_id = v_trial.id;
  get diagnostics v_assets = row_count;

  delete from public.usage_events usage
  where usage.trial_run_id = v_trial.id;
  get diagnostics v_usage = row_count;

  update public.trial_runs
  set status = 'purged',
      purged_at = now(),
      status_reason = 'trial_data_purged',
      readiness_snapshot = '{}'::jsonb,
      updated_at = now()
  where id = v_trial.id;

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_trial.organization_id,
    null,
    'trial.purged',
    'trial_run',
    v_trial.id::text,
    jsonb_build_object(
      'eventsDeleted', v_events,
      'jobsDeleted', v_jobs,
      'assetRowsDeleted', v_assets,
      'usageRowsDeleted', v_usage,
      'threadsDeleted', v_threads
    )
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'trialId', v_trial.id,
    'eventsDeleted', v_events,
    'jobsDeleted', v_jobs,
    'assetRowsDeleted', v_assets,
    'usageRowsDeleted', v_usage,
    'threadsDeleted', v_threads
  );
end;
$$;

revoke all on function public.purge_monitoria_trial_data(uuid)
  from public, anon, authenticated;
grant execute on function public.purge_monitoria_trial_data(uuid)
  to service_role;
