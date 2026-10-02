-- MonitorIA VIP — Gate 5
-- Contrato VIP ativo passa a liberar o serviço da Pesquisa IA sem camera_subscriptions individuais.
create or replace function private.assistant_service_access_allowed(p_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select
    not private.assistant_commercial_enforcement_enabled(p_organization_id)
    or exists (
      select 1
      from public.vip_contracts contract
      join public.vip_projects project
        on project.id=contract.project_id
       and project.organization_id=contract.organization_id
      where contract.organization_id=p_organization_id
        and project.status='active'
        and contract.status in ('active','grace_period')
        and contract.base_period_start is not null
        and contract.base_period_start<=now()
        and (
          (contract.status='active' and contract.base_period_end is not null and contract.base_period_end>now())
          or
          (contract.status='grace_period' and coalesce(nullif(contract.metadata->>'graceEndsAt','')::timestamptz,contract.base_period_end)>now())
        )
    )
    or exists (
      select 1 from public.trial_runs trial
      where trial.organization_id=p_organization_id
        and trial.status::text in ('running','capture_completed','exploration')
        and trial.exploration_ends_at>now()
    )
    or exists (
      select 1 from public.camera_subscriptions subscription
      where subscription.organization_id=p_organization_id
        and (
          (subscription.status in ('active','change_scheduled','cancel_at_period_end') and subscription.current_period_end>now())
          or
          (subscription.status='grace_period' and subscription.grace_ends_at>now())
        )
    )
    or exists (
      select 1 from public.assistant_allowances allowance
      where allowance.organization_id=p_organization_id
        and allowance.source='manual'
        and allowance.period_start<=now()
        and allowance.period_end>now()
        and allowance.expires_at>now()
    );
$$;
revoke all on function private.assistant_service_access_allowed(uuid) from public,anon,authenticated;
grant execute on function private.assistant_service_access_allowed(uuid) to service_role;
