-- Alinha funções auxiliares e extensão com as recomendações de segurança do Supabase.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Evita expor a extensão vector pelo schema public.
do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'vector' and n.nspname = 'public'
  ) then
    alter extension vector set schema extensions;
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = auth.uid()
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.has_org_role(uuid, public.organization_role[]) from public, anon, authenticated;

-- Troca as referências das políticas existentes para o schema privado.
do $$
declare
  policy_row record;
  new_qual text;
  new_check text;
begin
  for policy_row in
    select schemaname, tablename, policyname, roles, cmd, qual, with_check
    from pg_policies
    where schemaname in ('public', 'storage')
  loop
    new_qual := replace(
      replace(coalesce(policy_row.qual, ''), 'public.is_org_member', 'private.is_org_member'),
      'public.has_org_role', 'private.has_org_role'
    );
    new_check := replace(
      replace(coalesce(policy_row.with_check, ''), 'public.is_org_member', 'private.is_org_member'),
      'public.has_org_role', 'private.has_org_role'
    );

    if new_qual is distinct from coalesce(policy_row.qual, '')
       or new_check is distinct from coalesce(policy_row.with_check, '') then
      execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);

      execute format(
        'create policy %I on %I.%I as permissive for %s to %s %s %s',
        policy_row.policyname,
        policy_row.schemaname,
        policy_row.tablename,
        policy_row.cmd,
        array_to_string(policy_row.roles, ', '),
        case when policy_row.qual is not null then 'using (' || new_qual || ')' else '' end,
        case when policy_row.with_check is not null then 'with check (' || new_check || ')' else '' end
      );
    end if;
  end loop;
end $$;

-- As políticas já não dependem das funções públicas.
drop function if exists public.is_org_member(uuid);
drop function if exists public.has_org_role(uuid, public.organization_role[]);

revoke all on function public.create_organization(text, text) from public, anon;
