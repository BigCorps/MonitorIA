-- MonitorIA VIP — Gate 5
-- VIP vira fonte real de entitlement para câmeras e gravações locais.

alter table public.recording_sessions drop constraint if exists recording_sessions_quota_source_check;
alter table public.recording_sessions add constraint recording_sessions_quota_source_check
check (quota_source in ('subscription','grace_period','trial','legacy','vip_contract'));

create or replace function public.resolve_camera_entitlement(p_camera_id uuid)
returns table (
  camera_id uuid, organization_id uuid, trial_run_id uuid, access_source text,
  monitoring_allowed boolean, plan_code text, period_starts_at timestamptz,
  period_ends_at timestamptz, grace_ends_at timestamptz, capture_ends_at timestamptz,
  exploration_ends_at timestamptz, purge_after timestamptz,
  metadata_retention_days smallint, long_term_keyframes smallint,
  temporary_frame_days smallint, maximum_analysis_frames smallint,
  maximum_escalation_percent smallint, clip_enabled boolean,
  clip_duration_seconds smallint, clip_retention_days smallint,
  assistant_access_allowed boolean, enforcement_enabled boolean, reason text
)
language plpgsql stable security definer set search_path='' as $$
declare
  v_camera public.cameras%rowtype;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_vip public.vip_contracts%rowtype;
  v_plan public.camera_plan_catalog%rowtype;
  v_trial_plan text:=null;
  v_enforcement boolean:=true;
  v_source text:='blocked';
  v_monitoring boolean:=false;
  v_plan_code text:=null;
  v_start timestamptz:=null;
  v_end timestamptz:=null;
  v_grace timestamptz:=null;
  v_trial_id uuid:=null;
  v_capture_end timestamptz:=null;
  v_explore_end timestamptz:=null;
  v_purge timestamptz:=null;
  v_assistant boolean:=false;
  v_reason text:='payment_required';
  v_has_vip boolean:=false;
  v_has_subscription boolean:=false;
begin
  select * into v_camera from public.cameras where id=p_camera_id;
  if not found then raise exception 'camera_not_found'; end if;
  if not (coalesce((select auth.role()),'')='service_role' or private.is_org_member(v_camera.organization_id)) then raise exception 'not_authorized'; end if;

  select coalesce(entitlement_enforcement_enabled,true) into v_enforcement from public.billing_accounts where organization_id=v_camera.organization_id;
  v_enforcement:=coalesce(v_enforcement,true);

  select contract.* into v_vip
  from public.vip_project_cameras link
  join public.vip_projects project on project.id=link.project_id and project.organization_id=link.organization_id
  join public.vip_contracts contract on contract.project_id=project.id and contract.organization_id=project.organization_id
  where link.camera_id=p_camera_id and link.organization_id=v_camera.organization_id and link.status='active'
    and project.status='active' and contract.status in ('active','grace_period')
  order by contract.activated_at desc nulls last,contract.created_at desc limit 1;
  v_has_vip:=found;

  select * into v_subscription from public.camera_subscriptions where camera_id=p_camera_id;
  v_has_subscription:=found;

  select trial.* into v_trial
  from public.trial_run_cameras participant join public.trial_runs trial on trial.id=participant.trial_run_id
  where participant.camera_id=p_camera_id and participant.organization_id=v_camera.organization_id and participant.status<>'removed'
  order by trial.created_at desc limit 1;
  if found then
    select coalesce(selected_plan_code,v_trial.selected_plan_code) into v_trial_plan
    from public.trial_run_cameras where trial_run_id=v_trial.id and camera_id=p_camera_id limit 1;
  else
    select * into v_trial from public.trial_runs where organization_id=v_camera.organization_id and camera_id=p_camera_id order by created_at desc limit 1;
    if found then v_trial_plan:=v_trial.selected_plan_code; end if;
    if not found and v_camera.source_kind='local_recording' then
      select trial.* into v_trial
      from public.trial_runs trial join public.cameras origin on origin.id=trial.camera_id and origin.organization_id=trial.organization_id
      where trial.organization_id=v_camera.organization_id and origin.source_kind='local_recording'
      order by trial.created_at desc limit 1;
      if found then v_trial_plan:=v_trial.selected_plan_code; end if;
    end if;
  end if;

  if not v_enforcement then
    v_source:='legacy'; v_monitoring:=true; v_plan_code:=coalesce(v_subscription.plan_code,v_trial_plan,v_camera.analysis_plan_code,'basic'); v_assistant:=true; v_reason:='legacy_internal_access';
  elsif v_has_vip and private.vip_contract_is_current(v_vip) then
    v_source:='vip_contract'; v_monitoring:=true; v_plan_code:='intensive'; v_start:=v_vip.base_period_start; v_end:=v_vip.base_period_end;
    v_grace:=case when v_vip.status='grace_period' then nullif(v_vip.metadata->>'graceEndsAt','')::timestamptz else null end;
    v_assistant:=true; v_reason:=case when v_vip.status='grace_period' then 'active_vip_grace_period' else 'active_vip_contract' end;
  elsif v_has_subscription and v_subscription.status='active' and v_subscription.current_period_end>now() then
    v_source:='subscription'; v_monitoring:=true; v_plan_code:=v_subscription.plan_code; v_start:=v_subscription.current_period_start; v_end:=v_subscription.current_period_end; v_assistant:=true; v_reason:='active_subscription';
  elsif v_has_subscription and v_subscription.status='grace_period' and v_subscription.grace_ends_at>now() then
    v_source:='grace_period'; v_monitoring:=true; v_plan_code:=v_subscription.plan_code; v_start:=v_subscription.current_period_start; v_end:=v_subscription.current_period_end; v_grace:=v_subscription.grace_ends_at; v_assistant:=true; v_reason:='payment_grace_period';
  elsif v_trial.id is not null and v_trial.status::text='running' and v_trial.capture_started_at<=now() and v_trial.capture_ends_at>now() then
    v_source:='trial'; v_monitoring:=true; v_plan_code:=v_trial_plan; v_start:=v_trial.capture_started_at; v_end:=v_trial.capture_ends_at; v_trial_id:=v_trial.id;
    v_capture_end:=v_trial.capture_ends_at; v_explore_end:=v_trial.exploration_ends_at; v_purge:=v_trial.purge_after; v_assistant:=v_trial.exploration_ends_at is not null and v_trial.exploration_ends_at>now(); v_reason:='active_trial';
  else
    v_plan_code:=coalesce(case when v_has_vip then 'intensive' end,v_subscription.plan_code,v_trial_plan,v_camera.analysis_plan_code);
    v_trial_id:=v_trial.id; v_capture_end:=v_trial.capture_ends_at; v_explore_end:=v_trial.exploration_ends_at; v_purge:=v_trial.purge_after;
    v_assistant:=v_trial.id is not null and v_trial.status::text in ('running','capture_completed','exploration') and v_trial.exploration_ends_at is not null and v_trial.exploration_ends_at>now();
    if v_assistant then v_source:='trial'; v_reason:='trial_exploration_only';
    elsif v_has_vip then v_reason:='vip_contract_not_current';
    elsif v_trial.id is not null and v_trial.status::text='expired' then v_reason:='trial_expired';
    elsif v_trial.id is not null and v_trial.status::text='purged' then v_reason:='trial_data_purged';
    elsif v_trial.id is not null and v_trial.status::text in ('draft','ready') then v_reason:='trial_not_started';
    elsif v_has_subscription and v_subscription.status='suspended' then v_reason:='subscription_suspended';
    else v_reason:='payment_required'; end if;
  end if;

  if v_plan_code is not null then select * into v_plan from public.camera_plan_catalog where code=v_plan_code; end if;
  return query select p_camera_id,v_camera.organization_id,v_trial_id,v_source,v_monitoring,v_plan_code,v_start,v_end,v_grace,v_capture_end,v_explore_end,v_purge,
    v_plan.metadata_retention_days,v_plan.long_term_keyframes,v_plan.temporary_frame_days,v_plan.maximum_analysis_frames,v_plan.maximum_escalation_percent,
    coalesce(v_plan.clip_enabled,false),v_plan.clip_duration_seconds,v_plan.clip_retention_days,v_assistant,v_enforcement,v_reason;
end;
$$;
revoke all on function public.resolve_camera_entitlement(uuid) from public,anon;
grant execute on function public.resolve_camera_entitlement(uuid) to authenticated,service_role;

create or replace function public.reserve_monitoria_recording_session(
  p_organization_id uuid,p_camera_id uuid,p_request_key text,p_source_filename text,
  p_file_size_bytes bigint,p_duration_seconds integer,p_source_started_at timestamptz,
  p_codec text default null,p_width integer default null,p_height integer default null,
  p_decoder_mode text default null,p_native_preview boolean default false,p_browser_metadata jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_existing public.recording_sessions%rowtype;
  v_camera public.cameras%rowtype;
  v_subscription public.camera_subscriptions%rowtype;
  v_trial public.trial_runs%rowtype;
  v_vip public.vip_contracts%rowtype;
  v_trial_plan text:=null;
  v_source text;
  v_enforcement boolean:=true;
  v_plan text;
  v_trial_id uuid:=null;
  v_start timestamptz;
  v_end timestamptz;
  v_limit integer;
  v_used bigint:=0;
  v_session public.recording_sessions%rowtype;
  v_has_vip boolean:=false;
  v_has_subscription boolean:=false;
begin
  if not (coalesce((select auth.role()),'')='service_role' or exists(
    select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=(select auth.uid()) and m.role in ('owner'::public.organization_role,'admin'::public.organization_role)
  )) then raise exception 'not_authorized'; end if;
  if p_request_key is null or char_length(btrim(p_request_key))<8 then raise exception 'invalid_recording_request_key'; end if;
  if p_duration_seconds is null or p_duration_seconds<1 or p_duration_seconds>3600 then raise exception 'invalid_recording_duration'; end if;
  if p_source_started_at is null then raise exception 'recording_source_time_required'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_organization_id::text||':recording-request:'||btrim(p_request_key),0));
  select * into v_existing from public.recording_sessions where organization_id=p_organization_id and request_key=p_request_key;
  if found then
    select coalesce(sum(case when s.status in ('reserved','processing') then s.reserved_seconds else s.processed_seconds end),0) into v_used
    from public.recording_sessions s
    where ((v_existing.quota_source='trial' and v_existing.trial_run_id is not null and s.trial_run_id=v_existing.trial_run_id)
       or (v_existing.quota_source<>'trial' and s.camera_id=v_existing.camera_id))
      and s.quota_period_start=v_existing.quota_period_start and s.quota_period_end=v_existing.quota_period_end;
    return jsonb_build_object('success',true,'duplicate',true,'sessionId',v_existing.id,'quotaSource',v_existing.quota_source,'planCode',v_existing.plan_code,'trialRunId',v_existing.trial_run_id,'quotaLimitSeconds',v_existing.quota_limit_seconds,'quotaUsedSeconds',v_used,'quotaRemainingSeconds',greatest(v_existing.quota_limit_seconds-v_used,0),'reservedSeconds',v_existing.reserved_seconds,'quotaPeriodStart',v_existing.quota_period_start,'quotaPeriodEnd',v_existing.quota_period_end);
  end if;

  select * into v_camera from public.cameras where id=p_camera_id and organization_id=p_organization_id and source_kind='local_recording';
  if not found then raise exception 'recording_source_not_found'; end if;
  select coalesce(entitlement_enforcement_enabled,true) into v_enforcement from public.billing_accounts where organization_id=p_organization_id;
  v_enforcement:=coalesce(v_enforcement,true);

  select contract.* into v_vip
  from public.vip_project_cameras link
  join public.vip_projects project on project.id=link.project_id and project.organization_id=link.organization_id
  join public.vip_contracts contract on contract.project_id=project.id and contract.organization_id=project.organization_id
  where link.camera_id=p_camera_id and link.organization_id=p_organization_id and link.status='active' and project.status='active' and contract.status in ('active','grace_period')
  order by contract.activated_at desc nulls last,contract.created_at desc limit 1;
  v_has_vip:=found;
  select * into v_subscription from public.camera_subscriptions where camera_id=p_camera_id;
  v_has_subscription:=found;

  if not v_enforcement then
    v_source:='legacy'; v_plan:=coalesce(v_camera.analysis_plan_code,'basic'); v_start:=date_trunc('month',now()); v_end:=v_start+interval '1 month'; v_limit:=2592000;
  elsif v_has_vip and private.vip_contract_is_current(v_vip) then
    v_source:='vip_contract'; v_plan:='intensive'; v_start:=v_vip.base_period_start; v_end:=least(v_start+interval '1 month',v_vip.base_period_end);
    while v_end<=now() and v_end<v_vip.base_period_end loop v_start:=v_end; v_end:=least(v_start+interval '1 month',v_vip.base_period_end); end loop;
    if not(v_start<=now() and v_end>now()) then raise exception 'recording_vip_period_not_current'; end if;
    v_limit:=2592000;
  elsif v_has_subscription and v_subscription.status='active' and v_subscription.current_period_end>now() then
    v_source:='subscription'; v_plan:=v_subscription.plan_code; v_start:=v_subscription.current_period_start; v_end:=v_subscription.current_period_end; v_limit:=2592000;
  elsif v_has_subscription and v_subscription.status='grace_period' and v_subscription.grace_ends_at>now() then
    v_source:='grace_period'; v_plan:=v_subscription.plan_code; v_start:=v_subscription.current_period_start; v_end:=v_subscription.current_period_end; v_limit:=2592000;
  else
    select trial.* into v_trial
    from public.trial_run_cameras p join public.trial_runs trial on trial.id=p.trial_run_id
    where p.organization_id=p_organization_id and p.camera_id=p_camera_id and p.status<>'removed' and trial.status::text='running'
      and trial.capture_started_at<=now() and trial.capture_ends_at>now()
    order by trial.created_at desc limit 1;
    if found then select coalesce(selected_plan_code,v_trial.selected_plan_code) into v_trial_plan from public.trial_run_cameras where trial_run_id=v_trial.id and camera_id=p_camera_id limit 1; end if;
    if not found then
      select * into v_trial from public.trial_runs where organization_id=p_organization_id and camera_id=p_camera_id and status::text='running' and capture_started_at<=now() and capture_ends_at>now() order by created_at desc limit 1;
      if found then v_trial_plan:=v_trial.selected_plan_code; end if;
    end if;
    if not found then
      select trial.* into v_trial from public.trial_runs trial join public.cameras origin on origin.id=trial.camera_id and origin.organization_id=trial.organization_id
      where trial.organization_id=p_organization_id and origin.source_kind='local_recording' and trial.status::text='running' and trial.capture_started_at<=now() and trial.capture_ends_at>now()
      order by trial.created_at desc limit 1;
      if found then v_trial_plan:=v_trial.selected_plan_code; end if;
    end if;
    if not found then raise exception 'recording_entitlement_required'; end if;
    v_source:='trial'; v_plan:=coalesce(v_trial_plan,v_trial.selected_plan_code); v_trial_id:=v_trial.id; v_start:=v_trial.capture_started_at; v_end:=v_trial.capture_ends_at; v_limit:=86400;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(case when v_source='trial' and v_trial_id is not null then v_trial_id::text||':recording-trial-quota' else p_camera_id::text||':'||v_start::text end,0));
  select coalesce(sum(case when s.status in ('reserved','processing') then s.reserved_seconds else s.processed_seconds end),0) into v_used
  from public.recording_sessions s where (((v_source='trial' and v_trial_id is not null) and s.trial_run_id=v_trial_id) or (v_source<>'trial' and s.camera_id=p_camera_id)) and s.quota_period_start=v_start and s.quota_period_end=v_end;
  if v_used+p_duration_seconds>v_limit then raise exception 'recording_quota_exceeded'; end if;

  insert into public.recording_sessions(organization_id,camera_id,user_id,request_key,source_filename,file_size_bytes,duration_seconds,source_started_at,codec,width,height,decoder_mode,native_preview,quota_source,plan_code,trial_run_id,quota_period_start,quota_period_end,quota_limit_seconds,reserved_seconds,processed_seconds,browser_metadata)
  values(p_organization_id,p_camera_id,(select auth.uid()),btrim(p_request_key),left(coalesce(nullif(btrim(p_source_filename),''),'gravação'),260),greatest(coalesce(p_file_size_bytes,0),0),p_duration_seconds,p_source_started_at,nullif(left(coalesce(p_codec,''),80),''),p_width,p_height,p_decoder_mode,coalesce(p_native_preview,false),v_source,v_plan,v_trial_id,v_start,v_end,v_limit,p_duration_seconds,p_duration_seconds,coalesce(p_browser_metadata,'{}'::jsonb))
  returning * into v_session;

  return jsonb_build_object('success',true,'duplicate',false,'sessionId',v_session.id,'quotaSource',v_source,'planCode',v_plan,'trialRunId',v_trial_id,'quotaLimitSeconds',v_limit,'quotaUsedSeconds',v_used+p_duration_seconds,'quotaRemainingSeconds',greatest(v_limit-v_used-p_duration_seconds,0),'quotaPeriodStart',v_start,'quotaPeriodEnd',v_end);
end;
$$;
revoke all on function public.reserve_monitoria_recording_session(uuid,uuid,text,text,bigint,integer,timestamptz,text,integer,integer,text,boolean,jsonb) from public,anon;
grant execute on function public.reserve_monitoria_recording_session(uuid,uuid,text,text,bigint,integer,timestamptz,text,integer,integer,text,boolean,jsonb) to authenticated,service_role;
