-- MonitorIA VIP — Gate 2: onboarding guiado e readiness consolidado.
-- Não altera o pipeline técnico; apenas consolida sinais existentes.

alter table public.vip_projects
  add column if not exists onboarding_last_activity_at timestamptz null,
  add column if not exists onboarding_attention_code text null,
  add column if not exists onboarding_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(onboarding_snapshot) = 'object');

comment on column public.vip_projects.onboarding_last_activity_at is
  'Última interação do cliente com o onboarding VIP; usada para continuidade e análise de abandono.';
comment on column public.vip_projects.onboarding_attention_code is
  'Próxima ação técnica sugerida pelo readiness consolidado do onboarding VIP.';
comment on column public.vip_projects.onboarding_snapshot is
  'Snapshot técnico consolidado de Agent, câmeras, perfis e trial; não substitui as tabelas de origem.';

create or replace function public.refresh_vip_onboarding_v1(
  p_project_id uuid,
  p_touch_activity boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
  v_trial public.trial_runs%rowtype;
  v_agents_total integer := 0;
  v_agents_online integer := 0;
  v_cameras_total integer := 0;
  v_cameras_named integer := 0;
  v_profiles_active integer := 0;
  v_trial_cameras integer := 0;
  v_trial_ready integer := 0;
  v_readiness jsonb;
  v_camera_readiness jsonb := '[]'::jsonb;
  v_attention text := null;
  v_snapshot jsonb;
  v_iteration integer := 0;
  v_progressed boolean;
  v_trial_status text := null;
begin
  select project.*
    into v_project
  from public.vip_projects project
  where project.id = p_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if v_project.organization_id is not null then
    select count(*),
           count(*) filter (
             where agent.status = 'online'
               and agent.last_heartbeat_at is not null
               and agent.last_heartbeat_at >= now() - interval '10 minutes'
           )
      into v_agents_total, v_agents_online
    from public.agents agent
    where agent.organization_id = v_project.organization_id
      and agent.status <> 'disabled';

    select count(*),
           count(*) filter (where camera.setup_named_at is not null)
      into v_cameras_total, v_cameras_named
    from public.cameras camera
    where camera.organization_id = v_project.organization_id;

    select count(distinct profile.camera_id)
      into v_profiles_active
    from public.camera_profiles profile
    join public.cameras camera on camera.id = profile.camera_id
    where profile.organization_id = v_project.organization_id
      and camera.organization_id = v_project.organization_id
      and profile.is_active;

    select trial.*
      into v_trial
    from public.trial_runs trial
    where trial.vip_project_id = v_project.id
    order by trial.created_at desc
    limit 1;

    if found then
      v_trial_status := v_trial.status::text;

      for v_readiness in
        select private.monitoria_trial_readiness(
          v_project.organization_id,
          participant.camera_id
        )
        from public.trial_run_cameras participant
        where participant.trial_run_id = v_trial.id
          and participant.status <> 'removed'
        order by participant.created_at
      loop
        v_trial_cameras := v_trial_cameras + 1;
        if coalesce((v_readiness->>'ready')::boolean, false) then
          v_trial_ready := v_trial_ready + 1;
        end if;

        v_camera_readiness :=
          v_camera_readiness || jsonb_build_array(
            jsonb_build_object(
              'cameraId', v_readiness->>'cameraId',
              'cameraName', v_readiness->>'cameraName',
              'sourceKind', v_readiness->>'sourceKind',
              'ready', coalesce((v_readiness->>'ready')::boolean, false),
              'reasons', coalesce(v_readiness->'reasons', '[]'::jsonb)
            )
          );
      end loop;
    end if;
  end if;

  -- Reconcilia somente avanços que já estão comprovados pelos dados técnicos.
  -- Nunca avança proposal/payment/active automaticamente.
  loop
    exit when v_iteration >= 6;
    v_iteration := v_iteration + 1;
    v_progressed := false;

    if v_project.status = 'invited'
       and v_project.organization_id is not null then
      perform public.transition_vip_project(
        v_project.id,
        'project_setup',
        null,
        null,
        jsonb_build_object('source', 'vip_onboarding_readiness')
      );
      v_progressed := true;

    elsif v_project.status = 'project_setup'
       and v_project.organization_id is not null then
      perform public.transition_vip_project(
        v_project.id,
        'installing',
        null,
        null,
        jsonb_build_object('source', 'vip_onboarding_readiness')
      );
      v_progressed := true;

    elsif v_project.status = 'installing'
       and v_cameras_total > 0 then
      perform public.transition_vip_project(
        v_project.id,
        'calibrating',
        null,
        null,
        jsonb_build_object('source', 'vip_onboarding_readiness')
      );
      v_progressed := true;

    elsif v_project.status = 'calibrating'
       and (
         (v_trial_status = 'ready' and v_trial_cameras > 0 and v_trial_ready = v_trial_cameras)
         or v_trial_status = any(array['running','capture_completed','exploration','converted']::text[])
       ) then
      perform public.transition_vip_project(
        v_project.id,
        'ready_for_trial',
        null,
        null,
        jsonb_build_object('source', 'vip_onboarding_readiness')
      );
      v_progressed := true;

    elsif v_project.status = 'ready_for_trial'
       and v_trial_status = any(array['running','capture_completed','exploration','converted']::text[]) then
      perform public.transition_vip_project(
        v_project.id,
        'trial_running',
        null,
        null,
        jsonb_build_object('source', 'vip_trial_state_sync')
      );
      v_progressed := true;

    elsif v_project.status = 'trial_running'
       and v_trial_status = any(array['capture_completed','exploration','converted']::text[]) then
      perform public.transition_vip_project(
        v_project.id,
        'trial_completed',
        null,
        null,
        jsonb_build_object('source', 'vip_trial_state_sync')
      );
      v_progressed := true;
    end if;

    exit when not v_progressed;

    select project.*
      into v_project
    from public.vip_projects project
    where project.id = p_project_id
    for update;
  end loop;

  if v_project.status in ('active','cancelled') then
    v_attention := null;
  elsif v_project.organization_id is null then
    v_attention := 'workspace_required';
  elsif v_cameras_total = 0 and v_agents_total = 0 then
    v_attention := 'install_agent';
  elsif v_cameras_total = 0 then
    v_attention := 'discover_cameras';
  elsif v_cameras_named < v_cameras_total or v_profiles_active < v_cameras_total then
    v_attention := 'configure_camera_context';
  elsif v_trial_status is null then
    v_attention := 'trial_not_linked';
  elsif v_trial_cameras = 0 then
    v_attention := 'select_trial_cameras';
  elsif v_trial_ready < v_trial_cameras then
    v_attention := 'resolve_camera_readiness';
  elsif v_trial_status = 'ready' then
    v_attention := 'ready_to_start';
  elsif v_trial_status = 'running' then
    v_attention := 'trial_running';
  elsif v_trial_status = any(array['capture_completed','exploration']::text[]) then
    v_attention := 'review_trial_results';
  elsif v_trial_status = 'converted' then
    v_attention := 'contract_converted';
  else
    v_attention := 'continue_onboarding';
  end if;

  v_snapshot := jsonb_build_object(
    'checkedAt', now(),
    'projectStatus', v_project.status,
    'workspaceLinked', v_project.organization_id is not null,
    'agentsTotal', v_agents_total,
    'agentsOnline', v_agents_online,
    'camerasTotal', v_cameras_total,
    'camerasNamed', v_cameras_named,
    'activeProfiles', v_profiles_active,
    'trialId', case when v_trial.id is null then null else v_trial.id end,
    'trialStatus', v_trial_status,
    'trialCameras', v_trial_cameras,
    'trialReadyCameras', v_trial_ready,
    'cameraReadiness', v_camera_readiness,
    'attentionCode', v_attention
  );

  update public.vip_projects
  set onboarding_last_activity_at = case
        when p_touch_activity then now()
        else onboarding_last_activity_at
      end,
      onboarding_attention_code = v_attention,
      onboarding_snapshot = v_snapshot,
      updated_at = now()
  where id = v_project.id;

  return jsonb_build_object(
    'success', true,
    'projectId', v_project.id,
    'status', v_project.status,
    'attentionCode', v_attention,
    'snapshot', v_snapshot
  );
end;
$$;

revoke all on function public.refresh_vip_onboarding_v1(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.refresh_vip_onboarding_v1(uuid, boolean)
  to service_role;
