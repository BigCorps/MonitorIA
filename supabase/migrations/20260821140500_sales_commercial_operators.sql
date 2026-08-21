-- MonitorIA — Fase 10 Comercial
-- Operadores comerciais, atribuição estável de leads e rastreamento de conversão.

create table if not exists public.sales_operators (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  email text not null unique check (email = lower(btrim(email))),
  user_id uuid null references auth.users(id) on delete set null,
  active boolean not null default true,
  created_by uuid null references auth.users(id) on delete set null,
  last_access_at timestamptz null,
  deactivated_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sales_operators_user_id_idx
  on public.sales_operators(user_id)
  where user_id is not null;

create index if not exists sales_operators_active_idx
  on public.sales_operators(active, created_at desc);

alter table public.sales_operators enable row level security;

revoke all on table public.sales_operators from anon, authenticated;
grant select, insert, update, delete on table public.sales_operators to service_role;

alter table public.sales_trial_invites
  add column if not exists sales_operator_id uuid null
  references public.sales_operators(id) on delete set null;

create index if not exists sales_trial_invites_sales_operator_idx
  on public.sales_trial_invites(sales_operator_id, created_at desc);

comment on table public.sales_operators is
  'Operadores comerciais autorizados a gerar e acompanhar trials assistidos.';

comment on column public.sales_trial_invites.sales_operator_id is
  'Responsável comercial estável pelo lead, independente do usuário de autenticação.';
