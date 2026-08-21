-- MonitorIA — trava no banco os contratos comerciais dos dois tipos de trial.
-- Aplicado em produção via MCP em 2026-08-21.
--
-- Landing/self-service: 24 horas e exatamente 1 câmera.
-- Lead/sales-assisted: 60 minutos e de 1 a 6 câmeras.

alter table public.trial_runs
  drop constraint if exists trial_runs_mode_contract_check;

alter table public.trial_runs
  add constraint trial_runs_mode_contract_check
  check (
    (trial_mode = 'self_service' and duration_minutes = 1440 and max_cameras = 1)
    or
    (trial_mode = 'sales_assisted' and duration_minutes = 60 and max_cameras between 1 and 6)
  );

alter table public.sales_trial_invites
  drop constraint if exists sales_trial_invites_commercial_contract_check;

alter table public.sales_trial_invites
  add constraint sales_trial_invites_commercial_contract_check
  check (duration_minutes = 60 and max_cameras between 1 and 6);
