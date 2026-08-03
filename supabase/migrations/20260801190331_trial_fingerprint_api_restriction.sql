revoke all on table public.trial_device_fingerprints
  from anon, authenticated;

grant all on table public.trial_device_fingerprints
  to service_role;
