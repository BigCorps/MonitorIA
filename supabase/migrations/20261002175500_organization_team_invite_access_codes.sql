-- MonitorIA — código próprio de acesso para convites de equipe.
--
-- Motivo:
-- links de autenticação single-use podem ser consumidos por scanners de
-- segurança corporativos. O MonitorIA passa a enviar um código de 6 dígitos
-- próprio e só cria/consome o token Supabase no servidor, depois da validação.
--
-- Esta migration é aditiva e compatível com convites já existentes.

alter table public.organization_invitations
  add column if not exists access_code_hash text,
  add column if not exists access_code_expires_at timestamptz,
  add column if not exists access_code_attempts smallint not null default 0,
  add column if not exists access_code_sent_at timestamptz;

alter table public.organization_invitations
  drop constraint if exists organization_invitations_access_code_hash_check;

alter table public.organization_invitations
  add constraint organization_invitations_access_code_hash_check
  check (
    access_code_hash is null
    or char_length(access_code_hash) = 64
  );

alter table public.organization_invitations
  drop constraint if exists organization_invitations_access_code_attempts_check;

alter table public.organization_invitations
  add constraint organization_invitations_access_code_attempts_check
  check (access_code_attempts between 0 and 10);

create index if not exists organization_invitations_access_code_expiry_idx
  on public.organization_invitations(access_code_expires_at)
  where accepted_at is null
    and revoked_at is null
    and access_code_hash is not null;
