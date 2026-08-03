-- MonitorIA.cam — métodos de acesso configuráveis e política de MFA.
--
-- Pré-requisito:
--   supabase/migrations/20260731181000_user_password_status.sql
--
-- Depois de executar esta migration, habilite no Dashboard:
-- Authentication > Hooks > Custom Access Token
-- Função: public.custom_access_token_hook

create schema if not exists private;

create table if not exists private.user_auth_preferences (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  allow_password boolean not null default false,
  allow_magic_link boolean not null default true,
  allow_google boolean not null default false,
  allow_passkey boolean not null default false,
  preferred_method text not null default 'magic_link'
    check (
      preferred_method in (
        'password',
        'magic_link',
        'google',
        'passkey'
      )
    ),
  require_mfa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.user_auth_preferences
  from public, anon, authenticated;

create table if not exists private.organization_auth_policies (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  mfa_policy text not null default 'optional'
    check (mfa_policy in ('optional', 'admins', 'all')),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.organization_auth_policies
  from public, anon, authenticated;

insert into private.organization_auth_policies (
  organization_id,
  mfa_policy
)
select
  organization.id,
  'optional'
from public.organizations organization
on conflict (organization_id) do nothing;

create table if not exists private.auth_security_audit_log (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid
    references public.organizations(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_security_audit_log_user_created_idx
  on private.auth_security_audit_log (user_id, created_at desc);

create index if not exists auth_security_audit_log_org_created_idx
  on private.auth_security_audit_log (
    organization_id,
    created_at desc
  );

revoke all on private.auth_security_audit_log
  from public, anon, authenticated;

create or replace function private.user_passkey_count(
  p_user_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_count integer := 0;
begin
  if p_user_id is null
     or to_regclass('auth.webauthn_credentials') is null then
    return 0;
  end if;

  execute
    'select count(*)::integer
       from auth.webauthn_credentials
      where user_id = $1'
    into result_count
    using p_user_id;

  return coalesce(result_count, 0);
end;
$$;

create or replace function private.user_verified_totp_count(
  p_user_id uuid
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result_count integer := 0;
begin
  if p_user_id is null
     or to_regclass('auth.mfa_factors') is null then
    return 0;
  end if;

  execute
    'select count(*)::integer
       from auth.mfa_factors
      where user_id = $1
        and factor_type = ''totp''
        and status = ''verified'''
    into result_count
    using p_user_id;

  return coalesce(result_count, 0);
end;
$$;

create or replace function private.user_has_google_identity(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.identities identity
    where identity.user_id = p_user_id
      and identity.provider = 'google'
  );
$$;

insert into private.user_auth_preferences (
  user_id,
  allow_password,
  allow_magic_link,
  allow_google,
  allow_passkey,
  preferred_method,
  require_mfa
)
select
  users.id,
  coalesce(security.password_enabled, false),
  true,
  private.user_has_google_identity(users.id),
  private.user_passkey_count(users.id) > 0,
  case
    when private.user_has_google_identity(users.id)
      then 'google'
    when coalesce(security.password_enabled, false)
      then 'password'
    else 'magic_link'
  end,
  false
from auth.users users
left join private.user_security_profiles security
  on security.user_id = users.id
on conflict (user_id) do nothing;

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
    signup_provider = 'google',
    false,
    initial_preferred,
    false
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists user_auth_preferences_after_insert
  on auth.users;

create trigger user_auth_preferences_after_insert
after insert on auth.users
for each row
execute function private.sync_user_auth_preferences();

create or replace function private.user_effective_mfa_required(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (
        select preference.require_mfa
        from private.user_auth_preferences preference
        where preference.user_id = p_user_id
      ),
      false
    )
    or exists (
      select 1
      from public.organization_members membership
      left join private.organization_auth_policies policy
        on policy.organization_id = membership.organization_id
      where membership.user_id = p_user_id
        and (
          coalesce(policy.mfa_policy, 'optional') = 'all'
          or (
            coalesce(policy.mfa_policy, 'optional') = 'admins'
            and membership.role::text in ('owner', 'admin')
          )
        )
    );
$$;

create or replace function public.get_current_user_auth_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  preference private.user_auth_preferences%rowtype;
  current_organization_id uuid;
  current_role text;
  current_org_policy text := 'optional';
  can_manage_policy boolean := false;
  password_ready boolean := false;
  google_linked boolean := false;
  passkey_count integer := 0;
  totp_count integer := 0;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  select *
  into preference
  from private.user_auth_preferences
  where user_id = current_user_id;

  if not found then
    preference.user_id := current_user_id;
    preference.allow_password := false;
    preference.allow_magic_link := true;
    preference.allow_google := false;
    preference.allow_passkey := false;
    preference.preferred_method := 'magic_link';
    preference.require_mfa := false;
  end if;

  select
    membership.organization_id,
    membership.role::text
  into
    current_organization_id,
    current_role
  from public.organization_members membership
  where membership.user_id = current_user_id
  order by membership.created_at asc
  limit 1;

  if current_organization_id is not null then
    select coalesce(policy.mfa_policy, 'optional')
    into current_org_policy
    from private.organization_auth_policies policy
    where policy.organization_id = current_organization_id;

    if not found then
      current_org_policy := 'optional';
    end if;
  end if;

  can_manage_policy :=
    current_role in ('owner', 'admin');

  select coalesce(security.password_enabled, false)
  into password_ready
  from private.user_security_profiles security
  where security.user_id = current_user_id;

  if not found then
    password_ready := false;
  end if;

  google_linked :=
    private.user_has_google_identity(current_user_id);
  passkey_count :=
    private.user_passkey_count(current_user_id);
  totp_count :=
    private.user_verified_totp_count(current_user_id);

  return jsonb_build_object(
    'allow_password', preference.allow_password,
    'allow_magic_link', preference.allow_magic_link,
    'allow_google', preference.allow_google,
    'allow_passkey', preference.allow_passkey,
    'preferred_method', preference.preferred_method,
    'require_mfa', preference.require_mfa,
    'effective_mfa_required',
      private.user_effective_mfa_required(current_user_id),
    'password_configured', password_ready,
    'google_linked', google_linked,
    'passkey_count', passkey_count,
    'totp_factor_count', totp_count,
    'current_aal',
      coalesce((select auth.jwt() ->> 'aal'), 'aal1'),
    'current_organization_id', current_organization_id,
    'current_role', current_role,
    'organization_mfa_policy', current_org_policy,
    'can_manage_organization_policy', can_manage_policy
  );
end;
$$;

revoke all on function public.get_current_user_auth_settings()
  from public, anon;

grant execute on function public.get_current_user_auth_settings()
  to authenticated;

create or replace function public.update_current_user_auth_preferences(
  p_allow_password boolean,
  p_allow_magic_link boolean,
  p_allow_google boolean,
  p_allow_passkey boolean,
  p_preferred_method text,
  p_require_mfa boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  enabled_count integer;
  password_ready boolean := false;
  google_linked boolean := false;
  passkey_count integer := 0;
  old_values jsonb;
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  if p_preferred_method not in (
    'password',
    'magic_link',
    'google',
    'passkey'
  ) then
    raise exception 'invalid_preferred_method'
      using errcode = 'P0001';
  end if;

  enabled_count :=
    (case when p_allow_password then 1 else 0 end)
    + (case when p_allow_magic_link then 1 else 0 end)
    + (case when p_allow_google then 1 else 0 end)
    + (case when p_allow_passkey then 1 else 0 end);

  if enabled_count < 1 then
    raise exception 'at_least_one_auth_method_required'
      using errcode = 'P0001';
  end if;

  if (
    p_preferred_method = 'password'
    and not p_allow_password
  ) or (
    p_preferred_method = 'magic_link'
    and not p_allow_magic_link
  ) or (
    p_preferred_method = 'google'
    and not p_allow_google
  ) or (
    p_preferred_method = 'passkey'
    and not p_allow_passkey
  ) then
    raise exception 'preferred_method_must_be_enabled'
      using errcode = 'P0001';
  end if;

  select coalesce(security.password_enabled, false)
  into password_ready
  from private.user_security_profiles security
  where security.user_id = current_user_id;

  if not found then
    password_ready := false;
  end if;

  google_linked :=
    private.user_has_google_identity(current_user_id);
  passkey_count :=
    private.user_passkey_count(current_user_id);

  if p_allow_password and not password_ready then
    raise exception 'password_not_configured'
      using errcode = 'P0001';
  end if;

  if (
    p_preferred_method = 'google'
    or (
      enabled_count = 1
      and p_allow_google
    )
  ) and not google_linked then
    raise exception 'google_not_linked'
      using errcode = 'P0001';
  end if;

  if p_preferred_method = 'passkey'
     and passkey_count < 1 then
    raise exception 'passkey_not_configured'
      using errcode = 'P0001';
  end if;

  if enabled_count = 1
     and p_allow_passkey
     and passkey_count < 2 then
    raise exception 'passkey_only_requires_two_credentials'
      using errcode = 'P0001';
  end if;

  select to_jsonb(preference)
  into old_values
  from private.user_auth_preferences preference
  where preference.user_id = current_user_id;

  insert into private.user_auth_preferences (
    user_id,
    allow_password,
    allow_magic_link,
    allow_google,
    allow_passkey,
    preferred_method,
    require_mfa,
    updated_at
  )
  values (
    current_user_id,
    p_allow_password,
    p_allow_magic_link,
    p_allow_google,
    p_allow_passkey,
    p_preferred_method,
    p_require_mfa,
    now()
  )
  on conflict (user_id)
  do update set
    allow_password = excluded.allow_password,
    allow_magic_link = excluded.allow_magic_link,
    allow_google = excluded.allow_google,
    allow_passkey = excluded.allow_passkey,
    preferred_method = excluded.preferred_method,
    require_mfa = excluded.require_mfa,
    updated_at = now();

  insert into private.auth_security_audit_log (
    user_id,
    actor_user_id,
    event_type,
    details
  )
  values (
    current_user_id,
    current_user_id,
    'user_auth_preferences_updated',
    jsonb_build_object(
      'before', old_values,
      'after', jsonb_build_object(
        'allow_password', p_allow_password,
        'allow_magic_link', p_allow_magic_link,
        'allow_google', p_allow_google,
        'allow_passkey', p_allow_passkey,
        'preferred_method', p_preferred_method,
        'require_mfa', p_require_mfa
      )
    )
  );

  return public.get_current_user_auth_settings();
end;
$$;

revoke all on function public.update_current_user_auth_preferences(
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  boolean
) from public, anon;

grant execute on function public.update_current_user_auth_preferences(
  boolean,
  boolean,
  boolean,
  boolean,
  text,
  boolean
) to authenticated;

create or replace function public.update_current_organization_mfa_policy(
  p_organization_id uuid,
  p_mfa_policy text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  member_role text;
  previous_policy text := 'optional';
begin
  if current_user_id is null then
    raise exception 'not_authenticated'
      using errcode = 'P0001';
  end if;

  if p_mfa_policy not in ('optional', 'admins', 'all') then
    raise exception 'invalid_mfa_policy'
      using errcode = 'P0001';
  end if;

  select membership.role::text
  into member_role
  from public.organization_members membership
  where membership.user_id = current_user_id
    and membership.organization_id = p_organization_id
  limit 1;

  if member_role is null
     or member_role not in ('owner', 'admin') then
    raise exception 'insufficient_organization_role'
      using errcode = 'P0001';
  end if;

  select coalesce(policy.mfa_policy, 'optional')
  into previous_policy
  from private.organization_auth_policies policy
  where policy.organization_id = p_organization_id;

  if not found then
    previous_policy := 'optional';
  end if;

  insert into private.organization_auth_policies (
    organization_id,
    mfa_policy,
    updated_by,
    updated_at
  )
  values (
    p_organization_id,
    p_mfa_policy,
    current_user_id,
    now()
  )
  on conflict (organization_id)
  do update set
    mfa_policy = excluded.mfa_policy,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into private.auth_security_audit_log (
    user_id,
    actor_user_id,
    organization_id,
    event_type,
    details
  )
  values (
    current_user_id,
    current_user_id,
    p_organization_id,
    'organization_mfa_policy_updated',
    jsonb_build_object(
      'before', previous_policy,
      'after', p_mfa_policy,
      'actor_role', member_role
    )
  );

  return public.get_current_user_auth_settings();
end;
$$;

revoke all on function public.update_current_organization_mfa_policy(
  uuid,
  text
) from public, anon;

grant execute on function public.update_current_organization_mfa_policy(
  uuid,
  text
) to authenticated;

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
  provider text :=
    lower(
      coalesce(
        claims #>> '{app_metadata,provider}',
        ''
      )
    );
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
    preference.allow_google := false;
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
    if provider <> 'google' then
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

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

comment on table private.user_auth_preferences is
  'Métodos de autenticação permitidos e preferência de MFA por usuário.';

comment on table private.organization_auth_policies is
  'Política de MFA aplicada aos integrantes da organização.';

comment on function public.custom_access_token_hook(jsonb) is
  'Bloqueia métodos desativados e adiciona mfa_required/login_method ao JWT.';
