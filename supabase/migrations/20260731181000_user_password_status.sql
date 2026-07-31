-- MonitorIA.cam — controle seguro do estado da senha.
--
-- O Supabase permite que a mesma conta use link mágico e senha.
-- Esta estrutura registra quando uma senha real foi cadastrada para que
-- a interface saiba quando mostrar "Criar senha" ou "Alterar senha".

create schema if not exists private;

create table if not exists private.user_security_profiles (
  user_id uuid primary key
    references auth.users(id) on delete cascade,
  password_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on private.user_security_profiles
  from public, anon, authenticated;

-- Contas existentes sem marcação entram como "somente link mágico".
-- No projeto atual isso corresponde à conta já criada pelo link mágico.
insert into private.user_security_profiles (
  user_id,
  password_enabled
)
select
  users.id,
  case
    when lower(
      coalesce(
        users.raw_user_meta_data ->> 'password_login_enabled',
        'false'
      )
    ) = 'true'
      then true
    else false
  end
from auth.users users
on conflict (user_id) do nothing;

create or replace function private.sync_user_security_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  initial_password_enabled boolean := false;
begin
  if tg_op = 'INSERT' then
    initial_password_enabled :=
      lower(
        coalesce(
          new.raw_user_meta_data ->> 'password_login_enabled',
          'false'
        )
      ) = 'true';

    insert into private.user_security_profiles (
      user_id,
      password_enabled
    )
    values (
      new.id,
      initial_password_enabled
    )
    on conflict (user_id)
    do nothing;

    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.encrypted_password is distinct from old.encrypted_password then
    insert into private.user_security_profiles (
      user_id,
      password_enabled,
      updated_at
    )
    values (
      new.id,
      true,
      now()
    )
    on conflict (user_id)
    do update set
      password_enabled = true,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists user_security_profile_after_insert
  on auth.users;

create trigger user_security_profile_after_insert
after insert on auth.users
for each row
execute function private.sync_user_security_profile();

drop trigger if exists user_security_profile_after_password_update
  on auth.users;

create trigger user_security_profile_after_password_update
after update of encrypted_password on auth.users
for each row
execute function private.sync_user_security_profile();

create or replace function public.current_user_has_password()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select profile.password_enabled
      from private.user_security_profiles profile
      where profile.user_id = (select auth.uid())
    ),
    false
  );
$$;

revoke all on function public.current_user_has_password()
  from public, anon;

grant execute on function public.current_user_has_password()
  to authenticated;

create or replace function public.mark_current_user_password_enabled()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'not_authenticated';
  end if;

  insert into private.user_security_profiles (
    user_id,
    password_enabled,
    updated_at
  )
  values (
    current_user_id,
    true,
    now()
  )
  on conflict (user_id)
  do update set
    password_enabled = true,
    updated_at = now();
end;
$$;

revoke all on function public.mark_current_user_password_enabled()
  from public, anon;

grant execute on function public.mark_current_user_password_enabled()
  to authenticated;

comment on table private.user_security_profiles is
  'Estado interno que indica se o usuário já cadastrou uma senha real.';

comment on function public.current_user_has_password() is
  'Informa ao usuário autenticado se sua conta já possui acesso por senha.';
