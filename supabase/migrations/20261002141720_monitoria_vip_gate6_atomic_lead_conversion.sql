-- MonitorIA VIP — Gate 6: conversão transacional de lead em Projeto + convite.

create or replace function public.convert_vip_lead_request_v1(
  p_lead_request_id uuid,
  p_plan_code text,
  p_camera_count integer,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_user_id uuid,
  p_actor_sales_operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead public.vip_lead_requests%rowtype;
  v_operator_id uuid;
  v_plan public.vip_plan_catalog%rowtype;
  v_project public.vip_projects%rowtype;
  v_invite_result jsonb;
begin
  perform private.require_monitoria_service_role();

  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_sales_trial_token_hash';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_sales_trial_expiry';
  end if;

  if p_camera_count < 10 or p_camera_count > 100000 then
    raise exception 'vip_camera_count_invalid';
  end if;

  select lead.*
    into v_lead
  from public.vip_lead_requests lead
  where lead.id = p_lead_request_id
  for update;

  if not found then
    raise exception 'vip_lead_request_not_found';
  end if;

  if v_lead.status not in ('new','contacted','qualified') then
    raise exception 'vip_lead_request_not_convertible';
  end if;

  v_operator_id := coalesce(
    v_lead.sales_operator_id,
    p_actor_sales_operator_id
  );

  if p_actor_sales_operator_id is not null
     and v_lead.sales_operator_id is not null
     and p_actor_sales_operator_id is distinct from v_lead.sales_operator_id then
    raise exception 'vip_lead_operator_mismatch';
  end if;

  if v_operator_id is null then
    select operator.id
      into v_operator_id
    from public.sales_operators operator
    where operator.active = true
    order by operator.created_at asc
    limit 1;
  end if;

  if v_operator_id is null or not exists (
    select 1
    from public.sales_operators operator
    where operator.id = v_operator_id
      and operator.active = true
  ) then
    raise exception 'vip_sales_operator_unavailable';
  end if;

  select plan.*
    into v_plan
  from public.vip_plan_catalog plan
  where plan.code = p_plan_code
    and plan.is_active = true;

  if not found then
    raise exception 'vip_plan_unavailable';
  end if;

  if v_plan.technical_plan_code <> 'intensive'
     or v_plan.trial_duration_minutes <> 60
     or v_plan.trial_max_cameras <> 6 then
    raise exception 'vip_plan_contract_invalid';
  end if;

  insert into public.vip_projects (
    sales_operator_id,
    name,
    company_name,
    lead_name,
    lead_email,
    project_kind,
    status,
    selected_plan_code,
    expected_camera_count,
    technical_plan_code,
    trial_duration_minutes,
    trial_max_cameras,
    objective,
    created_by,
    metadata
  )
  values (
    v_operator_id,
    left(v_lead.company_name || ' — MonitorIA VIP', 160),
    v_lead.company_name,
    v_lead.lead_name,
    lower(v_lead.lead_email),
    v_lead.project_kind,
    'lead',
    p_plan_code,
    p_camera_count,
    'intensive',
    60,
    6,
    v_lead.objective,
    p_actor_user_id,
    jsonb_build_object(
      'productFamily','monitoria_vip',
      'source','vip_landing_lead',
      'vipLeadRequestId',v_lead.id
    )
  )
  returning * into v_project;

  v_invite_result := public.create_vip_sales_invite(
    v_project.id,
    lower(p_token_hash),
    p_expires_at,
    p_actor_user_id,
    v_operator_id
  );

  if coalesce((v_invite_result->>'success')::boolean,false) is not true then
    raise exception 'vip_sales_invite_creation_failed';
  end if;

  update public.vip_lead_requests
  set status = 'converted',
      sales_operator_id = v_operator_id,
      project_id = v_project.id,
      converted_at = now(),
      updated_at = now()
  where id = v_lead.id;

  return jsonb_build_object(
    'success',true,
    'leadRequestId',v_lead.id,
    'projectId',v_project.id,
    'salesOperatorId',v_operator_id,
    'salesInviteId',v_invite_result->>'salesInviteId',
    'expiresAt',v_invite_result->>'expiresAt',
    'durationMinutes',60,
    'maxCameras',6,
    'vipPlanCode',p_plan_code
  );
end;
$$;

revoke all on function public.convert_vip_lead_request_v1(
  uuid,text,integer,text,timestamptz,uuid,uuid
) from public,anon,authenticated;

grant execute on function public.convert_vip_lead_request_v1(
  uuid,text,integer,text,timestamptz,uuid,uuid
) to service_role;
