-- MonitorIA VIP — Gate 1: criação atômica do convite comercial VIP.

create or replace function public.create_vip_sales_invite(
  p_project_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_user_id uuid default null,
  p_actor_sales_operator_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project public.vip_projects%rowtype;
  v_invite public.sales_trial_invites%rowtype;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_sales_trial_token_hash';
  end if;

  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid_sales_trial_expiry';
  end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id = p_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if p_actor_sales_operator_id is not null
     and p_actor_sales_operator_id is distinct from v_project.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  if not exists (
    select 1 from public.sales_operators operator
    where operator.id = v_project.sales_operator_id
      and operator.active = true
  ) then
    raise exception 'vip_sales_operator_inactive';
  end if;

  if v_project.status not in ('lead', 'invited') then
    raise exception 'vip_project_not_invitable';
  end if;

  update public.sales_trial_invites
  set revoked_at = now(), updated_at = now()
  where vip_project_id = v_project.id
    and redeemed_at is null
    and revoked_at is null;

  insert into public.sales_trial_invites (
    token_hash, lead_name, lead_email, company_name,
    selected_plan_code, duration_minutes, max_cameras,
    expires_at, created_by, metadata, sales_operator_id, vip_project_id
  ) values (
    lower(p_token_hash),
    v_project.lead_name,
    v_project.lead_email,
    v_project.company_name,
    'intensive',
    60,
    6,
    p_expires_at,
    p_actor_user_id,
    jsonb_build_object(
      'productFamily', 'monitoria_vip',
      'vipProjectId', v_project.id,
      'vipPlanCode', v_project.selected_plan_code,
      'projectKind', v_project.project_kind
    ),
    v_project.sales_operator_id,
    v_project.id
  ) returning * into v_invite;

  if v_project.status = 'lead' then
    perform public.transition_vip_project(
      v_project.id,
      'invited',
      p_actor_user_id,
      p_actor_sales_operator_id,
      jsonb_build_object(
        'source', 'vip_sales_invite_created',
        'salesInviteId', v_invite.id
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'projectId', v_project.id,
    'salesInviteId', v_invite.id,
    'expiresAt', v_invite.expires_at,
    'durationMinutes', v_invite.duration_minutes,
    'maxCameras', v_invite.max_cameras,
    'technicalPlanCode', v_invite.selected_plan_code,
    'vipPlanCode', v_project.selected_plan_code
  );
end;
$$;

revoke all on function public.create_vip_sales_invite(uuid, text, timestamptz, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.create_vip_sales_invite(uuid, text, timestamptz, uuid, uuid)
  to service_role;
