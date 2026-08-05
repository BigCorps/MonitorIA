-- Verificação somente leitura dos métodos da conta.

select
  users.email,
  preferences.allow_password,
  preferences.allow_magic_link,
  preferences.allow_google,
  preferences.allow_passkey,
  preferences.preferred_method,
  preferences.require_mfa,
  private.user_passkey_count(users.id) as passkey_count,
  private.user_verified_totp_count(users.id)
    as verified_totp_count,
  private.user_has_google_identity(users.id)
    as google_identity_linked,
  private.user_effective_mfa_required(users.id)
    as effective_mfa_required
from auth.users users
left join private.user_auth_preferences preferences
  on preferences.user_id = users.id
where lower(users.email) = lower('ith.almeida@gmail.com');
