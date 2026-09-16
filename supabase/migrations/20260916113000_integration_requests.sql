begin;

create table if not exists public.integration_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by_user_id uuid null references auth.users(id) on delete set null,
  requester_email text null,
  contact_phone text null,
  systems text[] not null default '{}',
  use_cases text[] not null default '{}',
  business_type text not null default 'other',
  locations_count integer not null default 1 check (locations_count between 1 and 999),
  cameras_count integer not null default 1 check (cameras_count between 1 and 999),
  other_system text null,
  version_notes text null,
  integration_access text not null default 'unknown',
  supplier_contact text null,
  details text null,
  status text not null default 'new' check (status in ('new','reviewing','waiting_vendor','approved','declined','implemented')),
  admin_notes text null,
  email_sent_at timestamptz null,
  notification_error text null,
  created_at timestamptz not null default now()
);

comment on table public.integration_requests is
  'Solicitações de avaliação de integrações externas do MonitorIA.';

create index if not exists integration_requests_created_at_idx
  on public.integration_requests (created_at desc);

create index if not exists integration_requests_status_idx
  on public.integration_requests (status, created_at desc);

create index if not exists integration_requests_organization_idx
  on public.integration_requests (organization_id, created_at desc);

alter table public.integration_requests enable row level security;

-- O formulário usa createAdminClient() no servidor. Clientes web não precisam
-- de acesso direto a esta tabela.
revoke all on table public.integration_requests from anon, authenticated;

commit;
