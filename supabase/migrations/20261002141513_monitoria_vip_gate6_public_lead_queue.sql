-- MonitorIA VIP — Gate 6: fila pública de interesse comercial.
-- A landing nunca cria conta, trial ou Projeto diretamente.

create table public.vip_lead_requests (
  id uuid primary key default gen_random_uuid(),
  sales_operator_id uuid null
    references public.sales_operators(id) on delete set null,
  project_id uuid null
    references public.vip_projects(id) on delete set null,
  lead_name text not null
    check (char_length(btrim(lead_name)) between 2 and 120),
  lead_email text not null
    check (char_length(btrim(lead_email)) between 5 and 254),
  company_name text not null
    check (char_length(btrim(company_name)) between 2 and 160),
  phone text null
    check (phone is null or char_length(btrim(phone)) between 8 and 40),
  project_kind text not null
    check (project_kind = any (array[
      'enterprise'::text,
      'large_monitoring'::text,
      'scientific'::text,
      'other'::text
    ])),
  expected_camera_count integer not null
    check (expected_camera_count between 10 and 100000),
  objective text null
    check (objective is null or char_length(objective) <= 2000),
  status text not null default 'new'
    check (status = any (array[
      'new'::text,
      'contacted'::text,
      'qualified'::text,
      'converted'::text,
      'disqualified'::text
    ])),
  source text not null default 'vip_landing'
    check (char_length(source) between 2 and 80),
  acquisition jsonb not null default '{}'::jsonb
    check (jsonb_typeof(acquisition) = 'object'),
  first_submitted_at timestamptz not null default now(),
  last_submitted_at timestamptz not null default now(),
  contacted_at timestamptz null,
  converted_at timestamptz null,
  disqualified_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vip_lead_requests_operator_status_idx
  on public.vip_lead_requests(sales_operator_id, status, created_at desc);

create index vip_lead_requests_status_created_idx
  on public.vip_lead_requests(status, created_at desc);

create index vip_lead_requests_project_idx
  on public.vip_lead_requests(project_id)
  where project_id is not null;

create unique index vip_lead_requests_open_email_idx
  on public.vip_lead_requests(lower(lead_email))
  where status in ('new','contacted','qualified');

alter table public.vip_lead_requests enable row level security;

revoke all on table public.vip_lead_requests from anon, authenticated;
grant all on table public.vip_lead_requests to service_role;

comment on table public.vip_lead_requests is
  'Interesses públicos do MonitorIA VIP. A landing grava somente via backend service-role; o vendedor qualifica antes de criar Projeto/convite.';
