-- MonitorIA.cam — dados comerciais complementares da organização.

create table if not exists public.organization_profiles (
  organization_id uuid primary key
    references public.organizations(id) on delete cascade,
  legal_name text not null default ''
    check (char_length(legal_name) <= 200),
  tax_id text not null default ''
    check (char_length(tax_id) <= 32),
  phone text not null default ''
    check (char_length(phone) <= 40),
  contact_email text not null default ''
    check (char_length(contact_email) <= 254),
  website text not null default ''
    check (char_length(website) <= 500),
  industry text not null default ''
    check (char_length(industry) <= 120),
  logo_url text null
    check (logo_url is null or char_length(logo_url) <= 1000),
  updated_by uuid null
    references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists organization_profiles_set_updated_at
  on public.organization_profiles;

create trigger organization_profiles_set_updated_at
before update on public.organization_profiles
for each row execute function public.set_updated_at();

alter table public.organization_profiles enable row level security;

drop policy if exists organization_profiles_select_member
  on public.organization_profiles;
create policy organization_profiles_select_member
on public.organization_profiles
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists organization_profiles_insert_admin
  on public.organization_profiles;
create policy organization_profiles_insert_admin
on public.organization_profiles
for insert
to authenticated
with check (
  private.has_org_role(
    organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  )
);

drop policy if exists organization_profiles_update_admin
  on public.organization_profiles;
create policy organization_profiles_update_admin
on public.organization_profiles
for update
to authenticated
using (
  private.has_org_role(
    organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  )
)
with check (
  private.has_org_role(
    organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  )
);

drop policy if exists organization_profiles_delete_admin
  on public.organization_profiles;
create policy organization_profiles_delete_admin
on public.organization_profiles
for delete
to authenticated
using (
  private.has_org_role(
    organization_id,
    array[
      'owner'::public.organization_role,
      'admin'::public.organization_role
    ]
  )
);

revoke all on public.organization_profiles
  from public, anon;

grant select, insert, update, delete
  on public.organization_profiles
  to authenticated;

grant all on public.organization_profiles
  to service_role;

comment on table public.organization_profiles is
  'Dados comerciais complementares da organização exibidos na página de perfil.';
