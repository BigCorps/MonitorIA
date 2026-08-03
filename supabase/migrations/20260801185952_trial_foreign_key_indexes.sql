create index if not exists trial_device_fingerprints_trial_idx
  on public.trial_device_fingerprints(trial_run_id);

create index if not exists trial_device_fingerprints_org_idx
  on public.trial_device_fingerprints(organization_id);

create index if not exists trial_runs_plan_code_idx
  on public.trial_runs(selected_plan_code);
