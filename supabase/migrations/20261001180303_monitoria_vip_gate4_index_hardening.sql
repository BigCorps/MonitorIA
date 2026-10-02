-- MonitorIA VIP — Gate 4: índices de apoio das novas FKs.

create index if not exists vip_contracts_project_all_idx
  on public.vip_contracts(project_id);

create index if not exists vip_contracts_proposal_all_idx
  on public.vip_contracts(proposal_id);

create index if not exists vip_contracts_plan_code_idx
  on public.vip_contracts(plan_code);

create index if not exists vip_proposals_plan_code_idx
  on public.vip_proposals(plan_code);

create index if not exists vip_proposals_recommended_monthly_plan_idx
  on public.vip_proposals(recommended_monthly_plan_code);

create index if not exists vip_proposals_recommended_annual_plan_idx
  on public.vip_proposals(recommended_annual_plan_code);

create index if not exists vip_proposals_accepted_by_idx
  on public.vip_proposals(accepted_by)
  where accepted_by is not null;

create index if not exists vip_proposals_created_by_user_idx
  on public.vip_proposals(created_by_user_id)
  where created_by_user_id is not null;
