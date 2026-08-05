-- MonitorIA.cam — verificação somente leitura após a correção.

select
  to_regprocedure(
    'public.monitoria_combined_access_token_hook(jsonb)'
  ) is not null as combined_hook_exists,
  position(
    'custom_access_token_hook'
    in pg_get_functiondef(
      'public.monitoria_combined_access_token_hook(jsonb)'::regprocedure
    )
  ) > 0 as combined_delegates_to_custom_hook,
  position(
    'private.user_has_google_identity'
    in pg_get_functiondef(
      'public.custom_access_token_hook(jsonb)'::regprocedure
    )
  ) > 0 as google_identity_validation_installed,
  position(
    'app_metadata,provider'
    in pg_get_functiondef(
      'public.custom_access_token_hook(jsonb)'::regprocedure
    )
  ) = 0 as obsolete_provider_check_removed;

select
  users.id,
  users.email,
  preferences.allow_password,
  preferences.allow_magic_link,
  preferences.allow_google,
  preferences.allow_passkey,
  preferences.preferred_method,
  exists (
    select 1
    from auth.identities identity
    where identity.user_id = users.id
      and identity.provider = 'google'
  ) as google_identity_linked
from auth.users users
join private.user_auth_preferences preferences
  on preferences.user_id = users.id
where lower(users.email) = lower('ith.almeida@gmail.com');

select
  event_type,
  created_at,
  details
from private.auth_security_audit_log
where event_type = 'google_auth_bootstrap_repaired'
order by created_at desc;
