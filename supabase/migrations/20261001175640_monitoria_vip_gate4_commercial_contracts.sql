-- MonitorIA VIP — Gate 4: proposta comercial, contrato e fatura inicial.

create table public.vip_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.vip_projects(id) on delete cascade,
  version integer not null check (version >= 1),
  status text not null default 'presented'
    check (status = any (array[
      'presented'::text,
      'accepted'::text,
      'superseded'::text,
      'cancelled'::text
    ])),
  plan_code text not null references public.vip_plan_catalog(code) on delete restrict,
  camera_count integer not null check (camera_count between 10 and 100000),
  recommended_monthly_plan_code text not null
    references public.vip_plan_catalog(code) on delete restrict,
  recommended_annual_plan_code text not null
    references public.vip_plan_catalog(code) on delete restrict,
  pricing_snapshot jsonb not null check (jsonb_typeof(pricing_snapshot) = 'object'),
  proof_snapshot jsonb not null check (jsonb_typeof(proof_snapshot) = 'object'),
  selected_billing_cycle text null
    check (
      selected_billing_cycle is null
      or selected_billing_cycle = any (array['monthly'::text,'annual'::text])
    ),
  presented_at timestamptz not null default now(),
  accepted_at timestamptz null,
  accepted_by uuid null references auth.users(id) on delete set null,
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_by_sales_operator_id uuid null
    references public.sales_operators(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, version)
);

create unique index vip_proposals_one_open_idx
  on public.vip_proposals(project_id)
  where status in ('presented','accepted');

create index vip_proposals_project_created_idx
  on public.vip_proposals(project_id, created_at desc);

create index vip_proposals_sales_operator_idx
  on public.vip_proposals(created_by_sales_operator_id, created_at desc)
  where created_by_sales_operator_id is not null;

alter table public.vip_proposals enable row level security;
revoke all on table public.vip_proposals from anon, authenticated;
grant all on table public.vip_proposals to service_role;

comment on table public.vip_proposals is
  'Snapshot comercial imutável do MonitorIA VIP: prova de valor, preços apresentados e recomendação econômica no momento da proposta.';

create table public.vip_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique
    references public.vip_projects(id) on delete restrict,
  proposal_id uuid not null unique
    references public.vip_proposals(id) on delete restrict,
  organization_id uuid not null
    references public.organizations(id) on delete restrict,
  plan_code text not null
    references public.vip_plan_catalog(code) on delete restrict,
  billing_cycle text not null
    check (billing_cycle = any (array['monthly'::text,'annual'::text])),
  included_cameras integer not null check (included_cameras >= 10),
  contracted_camera_count integer not null check (contracted_camera_count >= 10),
  excess_camera_count integer not null check (excess_camera_count >= 0),
  base_amount_cents integer not null check (base_amount_cents > 0),
  excess_camera_monthly_cents integer not null
    check (excess_camera_monthly_cents > 0),
  initial_excess_amount_cents integer not null default 0
    check (initial_excess_amount_cents >= 0),
  initial_invoice_total_cents integer not null
    check (initial_invoice_total_cents > 0),
  estimated_first_year_total_cents integer not null
    check (estimated_first_year_total_cents > 0),
  status text not null default 'awaiting_payment'
    check (status = any (array[
      'awaiting_payment'::text,
      'paid_pending_activation'::text,
      'active'::text,
      'grace_period'::text,
      'suspended'::text,
      'cancelled'::text
    ])),
  invoice_id uuid null unique
    references public.billing_invoices(id) on delete set null,
  payment_id uuid null unique
    references public.billing_pix_payments(id) on delete set null,
  paid_at timestamptz null,
  base_period_start timestamptz null,
  base_period_end timestamptz null,
  excess_period_start timestamptz null,
  excess_period_end timestamptz null,
  next_excess_invoice_at timestamptz null,
  activated_at timestamptz null,
  cancelled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vip_contract_camera_math_check
    check (excess_camera_count = greatest(contracted_camera_count - included_cameras, 0))
);

create index vip_contracts_org_status_idx
  on public.vip_contracts(organization_id, status, created_at desc);

create index vip_contracts_invoice_idx
  on public.vip_contracts(invoice_id)
  where invoice_id is not null;

alter table public.vip_contracts enable row level security;
revoke all on table public.vip_contracts from anon, authenticated;
grant all on table public.vip_contracts to service_role;

comment on table public.vip_contracts is
  'Contrato comercial por Projeto VIP. Não cria camera_subscriptions; entitlement VIP é ativado no Gate 5.';

create or replace function private.vip_pricing_snapshot_v1(
  p_plan_code text,
  p_camera_count integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_selected public.vip_plan_catalog%rowtype;
  v_excess integer;
  v_monthly_excess integer;
  v_all_quotes jsonb;
  v_recommended_monthly text;
  v_recommended_annual text;
begin
  if p_camera_count < 10 or p_camera_count > 100000 then
    raise exception 'vip_camera_count_invalid';
  end if;

  select plan.*
    into v_selected
  from public.vip_plan_catalog plan
  where plan.code = p_plan_code
    and plan.is_active;

  if not found then
    raise exception 'vip_plan_not_available';
  end if;

  v_excess := greatest(p_camera_count - v_selected.included_cameras, 0);
  v_monthly_excess := v_excess * v_selected.excess_camera_monthly_cents;

  select quote.code
    into v_recommended_monthly
  from (
    select plan.code,
           plan.monthly_amount_cents +
             greatest(p_camera_count - plan.included_cameras, 0) *
             plan.excess_camera_monthly_cents as total_cents,
           plan.sort_order
    from public.vip_plan_catalog plan
    where plan.is_active
  ) quote
  order by quote.total_cents, quote.sort_order, quote.code
  limit 1;

  select quote.code
    into v_recommended_annual
  from (
    select plan.code,
           plan.annual_amount_cents +
             12 * greatest(p_camera_count - plan.included_cameras, 0) *
             plan.excess_camera_monthly_cents as total_cents,
           plan.sort_order
    from public.vip_plan_catalog plan
    where plan.is_active
  ) quote
  order by quote.total_cents, quote.sort_order, quote.code
  limit 1;

  select jsonb_agg(
    jsonb_build_object(
      'planCode', plan.code,
      'displayName', plan.display_name,
      'includedCameras', plan.included_cameras,
      'excessCameraMonthlyCents', plan.excess_camera_monthly_cents,
      'excessCameraCount', greatest(p_camera_count - plan.included_cameras, 0),
      'monthlyBaseCents', plan.monthly_amount_cents,
      'monthlyExcessCents',
        greatest(p_camera_count - plan.included_cameras, 0) *
        plan.excess_camera_monthly_cents,
      'monthlyPayNowCents',
        plan.monthly_amount_cents +
        greatest(p_camera_count - plan.included_cameras, 0) *
        plan.excess_camera_monthly_cents,
      'annualBaseCents', plan.annual_amount_cents,
      'annualPayNowCents',
        plan.annual_amount_cents +
        greatest(p_camera_count - plan.included_cameras, 0) *
        plan.excess_camera_monthly_cents,
      'annualEstimatedFirstYearCents',
        plan.annual_amount_cents +
        12 * greatest(p_camera_count - plan.included_cameras, 0) *
        plan.excess_camera_monthly_cents
    )
    order by plan.sort_order, plan.code
  )
    into v_all_quotes
  from public.vip_plan_catalog plan
  where plan.is_active;

  return jsonb_build_object(
    'version', 'vip-pricing-v1',
    'cameraCount', p_camera_count,
    'selectedPlanCode', v_selected.code,
    'includedCameras', v_selected.included_cameras,
    'excessCameraCount', v_excess,
    'excessCameraMonthlyCents', v_selected.excess_camera_monthly_cents,
    'monthlyBaseCents', v_selected.monthly_amount_cents,
    'monthlyExcessCents', v_monthly_excess,
    'monthlyPayNowCents', v_selected.monthly_amount_cents + v_monthly_excess,
    'monthlyEstimatedFirstYearCents',
      12 * (v_selected.monthly_amount_cents + v_monthly_excess),
    'annualBaseCents', v_selected.annual_amount_cents,
    'annualPayNowCents', v_selected.annual_amount_cents + v_monthly_excess,
    'annualEstimatedFirstYearCents',
      v_selected.annual_amount_cents + 12 * v_monthly_excess,
    'recommendedMonthlyPlanCode', v_recommended_monthly,
    'recommendedAnnualPlanCode', v_recommended_annual,
    'quotes', coalesce(v_all_quotes, '[]'::jsonb)
  );
end;
$$;

revoke all on function private.vip_pricing_snapshot_v1(text, integer)
  from public, anon, authenticated;
grant execute on function private.vip_pricing_snapshot_v1(text, integer)
  to service_role;

create or replace function private.vip_proof_snapshot_v1(
  p_project_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_trial public.trial_runs%rowtype;
  v_camera_count integer := 0;
  v_event_count bigint := 0;
  v_clip_count bigint := 0;
  v_review_count bigint := 0;
  v_continuation_count bigint := 0;
  v_top_types jsonb := '[]'::jsonb;
begin
  select trial.*
    into v_trial
  from public.trial_runs trial
  where trial.vip_project_id = p_project_id
  order by trial.created_at desc
  limit 1;

  if not found then
    raise exception 'vip_trial_not_found';
  end if;

  select count(*)
    into v_camera_count
  from public.trial_run_cameras participant
  where participant.trial_run_id = v_trial.id
    and participant.status <> 'removed';

  select count(*),
         count(*) filter (where event.requires_review),
         count(*) filter (where event.is_continuation)
    into v_event_count, v_review_count, v_continuation_count
  from public.events event
  where event.trial_run_id = v_trial.id
    and event.deleted_at is null;

  select count(*)
    into v_clip_count
  from public.storage_assets asset
  where asset.trial_run_id = v_trial.id
    and asset.kind = 'preserved_clip'
    and asset.status = 'ready'
    and asset.deleted_at is null;

  select coalesce(jsonb_agg(
    jsonb_build_object('type', ranked.primary_event_type, 'count', ranked.total)
    order by ranked.total desc, ranked.primary_event_type
  ), '[]'::jsonb)
    into v_top_types
  from (
    select event.primary_event_type, count(*)::bigint as total
    from public.events event
    where event.trial_run_id = v_trial.id
      and event.deleted_at is null
      and coalesce(event.primary_event_type, '') <> ''
      and event.primary_event_type <> 'no_relevant_change'
    group by event.primary_event_type
    order by count(*) desc, event.primary_event_type
    limit 5
  ) ranked;

  return jsonb_build_object(
    'version', 'vip-proof-v1',
    'trialId', v_trial.id,
    'trialStatus', v_trial.status,
    'captureStartedAt', v_trial.capture_started_at,
    'captureEndsAt', v_trial.capture_ends_at,
    'captureCompletedAt', v_trial.capture_completed_at,
    'cameraCount', v_camera_count,
    'eventCount', v_event_count,
    'clipCount', v_clip_count,
    'reviewCount', v_review_count,
    'continuationCount', v_continuation_count,
    'assistantInteractionsUsed', v_trial.interactions_used,
    'assistantInteractionLimit', v_trial.interaction_limit,
    'topEventTypes', v_top_types
  );
end;
$$;

revoke all on function private.vip_proof_snapshot_v1(uuid)
  from public, anon, authenticated;
grant execute on function private.vip_proof_snapshot_v1(uuid)
  to service_role;

create or replace function public.present_vip_proposal_v1(
  p_project_id uuid,
  p_plan_code text,
  p_camera_count integer,
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
  v_proposal public.vip_proposals%rowtype;
  v_pricing jsonb;
  v_proof jsonb;
  v_version integer;
begin
  perform private.require_monitoria_service_role();

  select project.*
    into v_project
  from public.vip_projects project
  where project.id = p_project_id
  for update;

  if not found then
    raise exception 'vip_project_not_found';
  end if;

  if v_project.status not in ('trial_completed','proposal') then
    raise exception 'vip_project_not_ready_for_proposal';
  end if;

  if p_actor_sales_operator_id is not null
     and p_actor_sales_operator_id is distinct from v_project.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  v_pricing := private.vip_pricing_snapshot_v1(p_plan_code, p_camera_count);
  v_proof := private.vip_proof_snapshot_v1(v_project.id);

  update public.vip_proposals
  set status = 'superseded',
      updated_at = now(),
      metadata = metadata || jsonb_build_object('supersededAt', now())
  where project_id = v_project.id
    and status = 'presented';

  select coalesce(max(proposal.version), 0) + 1
    into v_version
  from public.vip_proposals proposal
  where proposal.project_id = v_project.id;

  insert into public.vip_proposals (
    project_id,
    version,
    status,
    plan_code,
    camera_count,
    recommended_monthly_plan_code,
    recommended_annual_plan_code,
    pricing_snapshot,
    proof_snapshot,
    created_by_user_id,
    created_by_sales_operator_id,
    metadata
  )
  values (
    v_project.id,
    v_version,
    'presented',
    p_plan_code,
    p_camera_count,
    v_pricing->>'recommendedMonthlyPlanCode',
    v_pricing->>'recommendedAnnualPlanCode',
    v_pricing,
    v_proof,
    p_actor_user_id,
    p_actor_sales_operator_id,
    jsonb_build_object(
      'productFamily', 'monitoria_vip',
      'source', 'vip_sales_closing'
    )
  )
  returning * into v_proposal;

  update public.vip_projects
  set selected_plan_code = p_plan_code,
      expected_camera_count = p_camera_count,
      updated_at = now()
  where id = v_project.id;

  if v_project.status = 'trial_completed' then
    perform public.transition_vip_project(
      v_project.id,
      'proposal',
      p_actor_user_id,
      p_actor_sales_operator_id,
      jsonb_build_object(
        'source', 'vip_proposal_presented',
        'proposalId', v_proposal.id,
        'proposalVersion', v_version
      )
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'proposalId', v_proposal.id,
    'projectId', v_project.id,
    'version', v_version,
    'status', v_proposal.status,
    'pricing', v_pricing,
    'proof', v_proof
  );
end;
$$;

revoke all on function public.present_vip_proposal_v1(
  uuid, text, integer, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.present_vip_proposal_v1(
  uuid, text, integer, uuid, uuid
) to service_role;

-- A primeira versão da função de aceite é endurecida pela migration seguinte.
create or replace function public.accept_vip_proposal_v1(
  p_proposal_id uuid,
  p_billing_cycle text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proposal public.vip_proposals%rowtype;
  v_project public.vip_projects%rowtype;
  v_contract public.vip_contracts%rowtype;
  v_invoice_id uuid;
  v_invoice_number text;
  v_pricing jsonb;
  v_base_amount integer;
  v_excess_amount integer;
  v_total integer;
  v_estimated_year integer;
  v_service_start timestamptz := now();
  v_service_end timestamptz;
begin
  perform private.require_monitoria_service_role();

  if p_billing_cycle not in ('monthly','annual') then
    raise exception 'vip_billing_cycle_invalid';
  end if;

  select proposal.* into v_proposal
  from public.vip_proposals proposal
  where proposal.id = p_proposal_id
  for update;

  if not found then raise exception 'vip_proposal_not_found'; end if;

  select project.* into v_project
  from public.vip_projects project
  where project.id = v_proposal.project_id
  for update;

  if not found or v_project.organization_id is null then
    raise exception 'vip_project_organization_missing';
  end if;

  if not exists (
    select 1
    from public.organization_members member
    where member.organization_id = v_project.organization_id
      and member.user_id = p_actor_user_id
      and member.role in ('owner'::public.organization_role,'admin'::public.organization_role)
  ) then
    raise exception 'not_authorized';
  end if;

  select contract.* into v_contract
  from public.vip_contracts contract
  where contract.project_id = v_project.id
  for update;

  if found then
    if v_contract.proposal_id = v_proposal.id
       and v_contract.billing_cycle = p_billing_cycle
       and v_contract.status in ('awaiting_payment','paid_pending_activation','active') then
      return jsonb_build_object(
        'success', true, 'duplicate', true,
        'contractId', v_contract.id, 'invoiceId', v_contract.invoice_id,
        'status', v_contract.status
      );
    end if;
    raise exception 'vip_contract_already_exists';
  end if;

  if v_proposal.status <> 'presented' or v_project.status <> 'proposal' then
    raise exception 'vip_proposal_not_acceptible';
  end if;

  v_pricing := v_proposal.pricing_snapshot;
  v_excess_amount := (v_pricing->>'monthlyExcessCents')::integer;

  if p_billing_cycle = 'monthly' then
    v_base_amount := (v_pricing->>'monthlyBaseCents')::integer;
    v_total := (v_pricing->>'monthlyPayNowCents')::integer;
    v_estimated_year := (v_pricing->>'monthlyEstimatedFirstYearCents')::integer;
    v_service_end := v_service_start + interval '30 days';
  else
    v_base_amount := (v_pricing->>'annualBaseCents')::integer;
    v_total := (v_pricing->>'annualPayNowCents')::integer;
    v_estimated_year := (v_pricing->>'annualEstimatedFirstYearCents')::integer;
    v_service_end := v_service_start + interval '1 year';
  end if;

  insert into public.vip_contracts (
    project_id,proposal_id,organization_id,plan_code,billing_cycle,
    included_cameras,contracted_camera_count,excess_camera_count,
    base_amount_cents,excess_camera_monthly_cents,initial_excess_amount_cents,
    initial_invoice_total_cents,estimated_first_year_total_cents,status,metadata
  )
  values (
    v_project.id,v_proposal.id,v_project.organization_id,v_proposal.plan_code,p_billing_cycle,
    (v_pricing->>'includedCameras')::integer,v_proposal.camera_count,
    (v_pricing->>'excessCameraCount')::integer,v_base_amount,
    (v_pricing->>'excessCameraMonthlyCents')::integer,v_excess_amount,
    v_total,v_estimated_year,'awaiting_payment',
    jsonb_build_object('productFamily','monitoria_vip','pricingVersion',v_pricing->>'version','annualExcessBilling','monthly')
  )
  returning * into v_contract;

  v_invoice_number := private.next_monitoria_invoice_number();

  insert into public.billing_invoices (
    organization_id,invoice_number,status,currency,service_period_start,service_period_end,
    subtotal_cents,discount_cents,adjustment_cents,total_cents,created_by,metadata
  )
  values (
    v_project.organization_id,v_invoice_number,'draft','BRL',v_service_start,v_service_end,
    v_total,0,0,v_total,p_actor_user_id,
    jsonb_build_object('productFamily','monitoria_vip','vipProjectId',v_project.id,'vipProposalId',v_proposal.id,'vipContractId',v_contract.id,'billingCycle',p_billing_cycle)
  )
  returning id into v_invoice_id;

  insert into public.billing_invoice_items (
    invoice_id,organization_id,camera_id,plan_code,price_version_id,item_type,description,
    quantity,base_amount_cents,discount_basis_points,discount_amount_cents,adjustment_amount_cents,
    total_amount_cents,service_start,service_end,metadata
  )
  values (
    v_invoice_id,v_project.organization_id,null,null,null,'vip_contract_base',
    case when p_billing_cycle='annual'
      then 'MonitorIA VIP — plano anual '||upper(v_proposal.plan_code)
      else 'MonitorIA VIP — plano mensal '||upper(v_proposal.plan_code) end,
    1,v_base_amount,0,0,0,v_base_amount,v_service_start,v_service_end,
    jsonb_build_object('vipProjectId',v_project.id,'vipContractId',v_contract.id,'vipPlanCode',v_proposal.plan_code,'billingCycle',p_billing_cycle,'includedCameras',(v_pricing->>'includedCameras')::integer)
  );

  if (v_pricing->>'excessCameraCount')::integer > 0 then
    insert into public.billing_invoice_items (
      invoice_id,organization_id,item_type,description,quantity,base_amount_cents,
      discount_basis_points,discount_amount_cents,adjustment_amount_cents,total_amount_cents,
      service_start,service_end,metadata
    )
    values (
      v_invoice_id,v_project.organization_id,'vip_contract_excess',
      'MonitorIA VIP — câmeras excedentes do primeiro mês',
      (v_pricing->>'excessCameraCount')::integer,
      (v_pricing->>'excessCameraMonthlyCents')::integer,0,0,0,v_excess_amount,
      v_service_start,v_service_start+interval '30 days',
      jsonb_build_object('vipProjectId',v_project.id,'vipContractId',v_contract.id,'vipPlanCode',v_proposal.plan_code,'unitAmountCents',(v_pricing->>'excessCameraMonthlyCents')::integer,'billingCadence','monthly')
    );
  end if;

  insert into public.billing_price_snapshots (
    invoice_id,organization_id,calculation_version,input,output
  )
  values (
    v_invoice_id,v_project.organization_id,'vip-contract-v1',
    jsonb_build_object('proposalId',v_proposal.id,'projectId',v_project.id,'billingCycle',p_billing_cycle,'cameraCount',v_proposal.camera_count),
    v_pricing||jsonb_build_object('selectedBillingCycle',p_billing_cycle,'initialInvoiceTotalCents',v_total)
  );

  update public.vip_contracts set invoice_id=v_invoice_id,updated_at=now()
  where id=v_contract.id returning * into v_contract;

  update public.vip_proposals
  set status='accepted',selected_billing_cycle=p_billing_cycle,accepted_at=now(),
      accepted_by=p_actor_user_id,updated_at=now()
  where id=v_proposal.id;

  update public.vip_projects set billing_cycle=p_billing_cycle,updated_at=now()
  where id=v_project.id;

  perform public.transition_vip_project(
    v_project.id,'payment_pending',p_actor_user_id,null,
    jsonb_build_object('source','vip_proposal_accepted','proposalId',v_proposal.id,'contractId',v_contract.id,'invoiceId',v_invoice_id,'billingCycle',p_billing_cycle)
  );

  insert into public.audit_logs (
    organization_id,actor_user_id,action,entity_type,entity_id,metadata
  )
  values (
    v_project.organization_id,p_actor_user_id,'vip.contract_awaiting_payment',
    'vip_contract',v_contract.id::text,
    jsonb_build_object('invoiceId',v_invoice_id,'invoiceNumber',v_invoice_number,'planCode',v_proposal.plan_code,'billingCycle',p_billing_cycle,'cameraCount',v_proposal.camera_count,'totalCents',v_total)
  );

  return jsonb_build_object(
    'success',true,'duplicate',false,'projectId',v_project.id,'proposalId',v_proposal.id,
    'contractId',v_contract.id,'invoiceId',v_invoice_id,'invoiceNumber',v_invoice_number,
    'billingCycle',p_billing_cycle,'totalCents',v_total,'status','awaiting_payment'
  );
end;
$$;

revoke all on function public.accept_vip_proposal_v1(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.accept_vip_proposal_v1(uuid,text,uuid)
  to service_role;

create or replace function public.reopen_vip_proposal_v1(
  p_project_id uuid,
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
  v_contract public.vip_contracts%rowtype;
  v_proposal public.vip_proposals%rowtype;
begin
  perform private.require_monitoria_service_role();

  select project.* into v_project
  from public.vip_projects project
  where project.id=p_project_id
  for update;

  if not found then raise exception 'vip_project_not_found'; end if;

  if p_actor_sales_operator_id is not null
     and p_actor_sales_operator_id is distinct from v_project.sales_operator_id then
    raise exception 'vip_project_operator_mismatch';
  end if;

  if v_project.status <> 'payment_pending' then
    raise exception 'vip_project_not_payment_pending';
  end if;

  select contract.* into v_contract
  from public.vip_contracts contract
  where contract.project_id=v_project.id
  for update;

  if not found or v_contract.status <> 'awaiting_payment' then
    raise exception 'vip_contract_not_reopenable';
  end if;

  if exists (
    select 1 from public.billing_pix_payments payment
    where payment.invoice_id=v_contract.invoice_id and payment.status='confirmed'
  ) then
    raise exception 'vip_payment_already_confirmed';
  end if;

  update public.billing_pix_payments
  set status='cancelled',error_code='vip_proposal_reopened',
      error_message='Cobrança cancelada porque a proposta VIP foi reaberta.',updated_at=now()
  where invoice_id=v_contract.invoice_id and status='pending';

  update public.billing_invoices
  set status='void',due_at=null,expires_at=null,updated_at=now(),
      metadata=metadata||jsonb_build_object('voidReason','vip_proposal_reopened')
  where id=v_contract.invoice_id and status<>'paid';

  update public.vip_contracts
  set status='cancelled',cancelled_at=now(),updated_at=now(),
      metadata=metadata||jsonb_build_object('cancelReason','vip_proposal_reopened')
  where id=v_contract.id;

  select proposal.* into v_proposal
  from public.vip_proposals proposal
  where proposal.id=v_contract.proposal_id
  for update;

  update public.vip_proposals
  set status='presented',selected_billing_cycle=null,accepted_at=null,
      accepted_by=null,updated_at=now()
  where id=v_proposal.id;

  update public.vip_projects set billing_cycle=null,updated_at=now()
  where id=v_project.id;

  perform public.transition_vip_project(
    v_project.id,'proposal',p_actor_user_id,p_actor_sales_operator_id,
    jsonb_build_object('source','vip_proposal_reopened','proposalId',v_proposal.id,'cancelledContractId',v_contract.id)
  );

  return jsonb_build_object(
    'success',true,'projectId',v_project.id,'proposalId',v_proposal.id,'status','proposal'
  );
end;
$$;

revoke all on function public.reopen_vip_proposal_v1(uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.reopen_vip_proposal_v1(uuid,uuid,uuid)
  to service_role;
