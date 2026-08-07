-- MonitorIA — PROD-8 + INT-8 — SQL corrigido v2
-- Clipes privados do plano Detalhada e fila auditável de geração local.
-- Compatível com o schema atual: não depende de public.is_org_member(uuid).
-- Pode ser executado inteiro no SQL Editor do Supabase.

begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'event-clips',
  'event-clips',
  false,
  26214400,
  array['video/mp4']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.clip_generation_requests (
  id uuid primary key default gen_random_uuid(),

  organization_id uuid not null
    references public.organizations(id)
    on delete cascade,

  camera_id uuid not null
    references public.cameras(id)
    on delete cascade,

  analysis_job_id uuid not null unique
    references public.analysis_jobs(id)
    on delete cascade,

  event_id uuid not null
    references public.events(id)
    on delete cascade,

  agent_id uuid not null
    references public.agents(id)
    on delete cascade,

  storage_asset_id uuid not null unique
    references public.storage_assets(id)
    on delete cascade,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'uploading',
        'ready',
        'failed',
        'expired'
      )
    ),

  clip_starts_at timestamptz not null,
  clip_ends_at timestamptz not null,

  duration_seconds integer not null default 15
    check (duration_seconds between 5 and 30),

  bucket text not null default 'event-clips',
  storage_path text not null unique,

  upload_expires_at timestamptz,

  attempt_count integer not null default 0
    check (attempt_count between 0 and 20),

  error_code text,
  error_message text,

  metadata jsonb not null default '{}'::jsonb,

  completed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  check (clip_ends_at > clip_starts_at)
);

create index if not exists clip_requests_agent_status_idx
  on public.clip_generation_requests (
    agent_id,
    status,
    created_at
  )
  where status in ('pending', 'uploading');

create index if not exists clip_requests_org_time_idx
  on public.clip_generation_requests (
    organization_id,
    created_at desc
  );

create unique index if not exists storage_assets_one_clip_per_job_idx
  on public.storage_assets (analysis_job_id)
  where
    kind = 'preserved_clip'::public.asset_kind
    and deleted_at is null;

drop trigger if exists clip_generation_requests_set_updated_at
  on public.clip_generation_requests;

create trigger clip_generation_requests_set_updated_at
before update on public.clip_generation_requests
for each row
execute function public.set_updated_at();

alter table public.clip_generation_requests
  enable row level security;

drop policy if exists clip_requests_member_select
  on public.clip_generation_requests;

create policy clip_requests_member_select
on public.clip_generation_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members as member
    where
      member.organization_id =
        clip_generation_requests.organization_id
      and member.user_id = (select auth.uid())
  )
);

revoke all
on table public.clip_generation_requests
from anon, authenticated;

grant select
on table public.clip_generation_requests
to authenticated;

grant all
on table public.clip_generation_requests
to service_role;

comment on table public.clip_generation_requests is
  'Fila auditável de clipes locais solicitados ao MonitorIA Agent.';

comment on column public.clip_generation_requests.storage_path is
  'Destino privado no bucket event-clips; o upload usa URL assinada e não passa pela Vercel.';

comment on column public.clip_generation_requests.metadata is
  'Métricas de geração local, quantidade de segmentos e duração reportada.';

commit;

-- ============================================================
-- VERIFICAÇÃO — deve retornar o bucket e a tabela.
-- ============================================================

select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
where id = 'event-clips';

select
  to_regclass('public.clip_generation_requests')
    as clip_generation_requests_table;

-- Confirma a política criada.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where
  schemaname = 'public'
  and tablename = 'clip_generation_requests'
order by policyname;
