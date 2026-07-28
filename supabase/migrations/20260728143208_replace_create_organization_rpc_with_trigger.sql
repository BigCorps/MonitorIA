-- A organização é criada por INSERT protegido por RLS; defaults são criados por trigger.

revoke all on function public.create_organization(text, text) from public, anon, authenticated;
drop function if exists public.create_organization(text, text);

create or replace function private.bootstrap_organization_defaults()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  insert into public.organization_members(organization_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (organization_id, user_id) do nothing;

  insert into public.retention_policies(organization_id)
  values (new.id)
  on conflict (organization_id) do nothing;

  return new;
end;
$$;

revoke all on function private.bootstrap_organization_defaults() from public, anon, authenticated;

drop trigger if exists organizations_bootstrap_defaults on public.organizations;
create trigger organizations_bootstrap_defaults
after insert on public.organizations
for each row execute function private.bootstrap_organization_defaults();

create policy organizations_insert_self on public.organizations
for insert to authenticated
with check (created_by = auth.uid());
