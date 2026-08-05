-- MonitorIA.cam — correção do login Google bloqueado pelo Custom Access Token Hook.
--
-- Causa corrigida:
-- 1. O hook tentava descobrir o provedor atual por claims.app_metadata.provider.
--    Em contas originalmente criadas por e-mail, esse campo permanece "email"
--    mesmo quando o login atual foi feito pelo Google.
-- 2. Contas existentes foram inicializadas com allow_google = false, criando
--    um bloqueio circular antes que o primeiro login Google pudesse concluir.
--
-- Esta migration:
-- - mantém desativações feitas explicitamente pelo usuário;
-- - habilita Google somente para preferências antigas nunca alteradas;
-- - passa a validar OAuth pela identidade Google vinculada em auth.identities;
-- - torna Google permitido por padrão para novos usuários.
--
-- Não altera senha, Magic Link, passkeys, TOTP, políticas MFA ou MCP.

begin;

alter table private.user_auth_preferences
  alter column allow_google set default true;

create or replace function private.sync_user_auth_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  password_ready boolean := false;
  signup_provider text := '';
  initial_preferred text := 'magic_link';
begin
  password_ready :=
    lower(
      coalesce(
        new.raw_user_meta_data ->> 'password_login_enabled',
        'false'
      )
    ) = 'true'
    or length(coalesce(new.encrypted_password, '')) > 0;

  signup_provider :=
    lower(
      coalesce(
        new.raw_app_meta_data ->> 'provider',
        ''
      )
    );

  initial_preferred := case
    when signup_provider = 'google' then 'google'
    when password_ready then 'password'
    else 'magic_link'
  end;

  insert into private.user_auth_preferences (
    user_id,
    allow_password,
    allow_magic_link,
    allow_google,
    allow_passkey,
    preferred_method,
    require_mfa
  )
  values (
    new.id,
    password_ready,
    true,
    true,
    false,
    initial_preferred,
    false
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

with repaired_preferences as (
  update private.user_auth_preferences preference
  set
    allow_google = true,
    updated_at = now()
  where preference.allow_google = false
    and not exists (
      select 1
      from private.auth_security_audit_log audit
      where audit.user_id = preference.user_id
        and audit.event_type = 'user_auth_preferences_updated'
    )
  returning preference.user_id
)
insert into private.auth_security_audit_log (
  user_id,
  actor_user_id,
  event_type,
  details
)
select
  repaired.user_id,
  null,
  'google_auth_bootstrap_repaired',
  jsonb_build_object(
    'reason',
    'Enable Google for legacy preferences that were never explicitly edited'
  )
from repaired_preferences repaired;

create or replace function public.custom_access_token_hook(
  event jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_user_id uuid :=
    nullif(event ->> 'user_id', '')::uuid;
  claims jsonb :=
    coalesce(event -> 'claims', '{}'::jsonb);
  authentication_method text :=
    coalesce(event ->> 'authentication_method', '');
  primary_method text;
  preference private.user_auth_preferences%rowtype;
  mfa_required boolean := false;
begin
  if event_user_id is null then
    return jsonb_build_object('claims', claims);
  end if;

  select *
  into preference
  from private.user_auth_preferences
  where user_id = event_user_id;

  if not found then
    preference.allow_password := false;
    preference.allow_magic_link := true;
    preference.allow_google := true;
    preference.allow_passkey := false;
    preference.preferred_method := 'magic_link';
    preference.require_mfa := false;
  end if;

  primary_method := authentication_method;

  if authentication_method in (
    'token_refresh',
    'totp',
    'mfa/phone',
    'mfa/webauthn'
  ) then
    primary_method := nullif(
      claims ->> 'login_method',
      ''
    );

    if primary_method is null then
      select method_name
      into primary_method
      from (
        select case
          when jsonb_typeof(amr_item) = 'object'
            then amr_item ->> 'method'
          when jsonb_typeof(amr_item) = 'string'
            then trim(both '"' from amr_item::text)
          else null
        end as method_name
        from jsonb_array_elements(
          coalesce(claims -> 'amr', '[]'::jsonb)
        ) as amr_item
      ) methods
      where method_name in (
        'password',
        'magiclink',
        'otp',
        'oauth',
        'passkey'
      )
      order by case method_name
        when 'password' then 1
        when 'magiclink' then 2
        when 'otp' then 3
        when 'oauth' then 4
        when 'passkey' then 5
        else 99
      end
      limit 1;
    end if;
  end if;

  if primary_method = 'password'
     and not preference.allow_password then
    raise exception 'auth_method_disabled'
      using errcode = 'P0001';

  elsif primary_method in ('magiclink', 'otp')
     and not preference.allow_magic_link then
    raise exception 'auth_method_disabled'
      using errcode = 'P0001';

  elsif primary_method = 'oauth' then
    -- O evento do hook não informa com segurança qual identidade social foi
    -- usada. Como o MonitorIA habilita somente Google como provedor social,
    -- validamos a identidade Google efetivamente vinculada no Supabase.
    if not private.user_has_google_identity(event_user_id) then
      raise exception 'oauth_provider_not_allowed'
        using errcode = 'P0001';
    end if;

    if not preference.allow_google then
      raise exception 'auth_method_disabled'
        using errcode = 'P0001';
    end if;

  elsif primary_method = 'passkey'
     and not preference.allow_passkey then
    raise exception 'auth_method_disabled'
      using errcode = 'P0001';
  end if;

  mfa_required :=
    private.user_effective_mfa_required(event_user_id);

  claims := jsonb_set(
    claims,
    '{mfa_required}',
    to_jsonb(mfa_required),
    true
  );

  claims := jsonb_set(
    claims,
    '{login_method}',
    to_jsonb(
      coalesce(
        nullif(primary_method, ''),
        authentication_method
      )
    ),
    true
  );

  return jsonb_build_object('claims', claims);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;

grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

comment on function public.custom_access_token_hook(jsonb) is
  'Enforces MonitorIA login-method preferences and MFA claims. OAuth is validated through the linked Google identity.';

commit;
