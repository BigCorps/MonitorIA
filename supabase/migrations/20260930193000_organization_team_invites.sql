-- MonitorIA — equipe por organização e convites por link/e-mail.
-- Mantém owner/admin/operator/viewer já existentes em organization_role.

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  role public.organization_role not null check (role <> 'owner'::public.organization_role),
  token_hash text not null unique check (char_length(token_hash) = 64),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (accepted_at is null and accepted_by is null)
    or (accepted_at is not null and accepted_by is not null)
  )
);

create index if not exists organization_invitations_org_idx
  on public.organization_invitations(organization_id, created_at desc);
create index if not exists organization_invitations_email_idx
  on public.organization_invitations(email);
create index if not exists organization_invitations_pending_idx
  on public.organization_invitations(organization_id, expires_at)
  where accepted_at is null and revoked_at is null;

alter table public.organization_invitations enable row level security;

-- Convites são manipulados pelas Server Actions com service_role depois de
-- validar owner/admin. Não exponha tokens/hashes pela Data API do navegador.
revoke all on table public.organization_invitations from anon, authenticated;
grant all on table public.organization_invitations to service_role;

create or replace function public.set_organization_invitation_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_organization_invitation_updated_at() from public, anon, authenticated;

drop trigger if exists organization_invitations_updated_at
  on public.organization_invitations;
create trigger organization_invitations_updated_at
before update on public.organization_invitations
for each row execute function public.set_organization_invitation_updated_at();
