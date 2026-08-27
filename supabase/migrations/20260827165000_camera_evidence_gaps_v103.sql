-- MonitorIA 1.0.3 — Evidence Gap durável
-- NÃO aplicar antes do build/CI desta entrega ficar verde.

begin;

create table if not exists public.camera_evidence_gaps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  site_id uuid not null
    references public.sites(id) on delete cascade,
  camera_id uuid not null
    references public.cameras(id) on delete cascade,
  agent_id uuid not null
    references public.agents(id) on delete cascade,
  capture_session_id uuid
    references public.capture_sessions(id) on delete set null,
  agent_event_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  detector text not null
    check (detector in ('regular_motion','structural_motion')),
  reason text not null
    check (reason = 'visual_evidence_unavailable'),
  time_precision text not null
    check (time_precision = 'detector_log_interval'),
  priority text not null
    check (priority in ('critical','important','normal')),
  status text not null default 'recorded'
    check (status in ('recorded','acknowledged','resolved')),
  local_metrics jsonb not null default '{}'::jsonb,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at >= started_at),
  unique (camera_id, agent_event_id)
);

create index if not exists camera_evidence_gaps_org_time_idx
  on public.camera_evidence_gaps(
    organization_id,
    started_at desc
  );

create index if not exists camera_evidence_gaps_camera_time_idx
  on public.camera_evidence_gaps(
    camera_id,
    started_at desc
  );

create index if not exists camera_evidence_gaps_priority_time_idx
  on public.camera_evidence_gaps(
    priority,
    started_at desc
  );

drop trigger if exists camera_evidence_gaps_set_updated_at
  on public.camera_evidence_gaps;

create trigger camera_evidence_gaps_set_updated_at
before update on public.camera_evidence_gaps
for each row
execute function public.set_updated_at();

alter table public.camera_evidence_gaps
  enable row level security;

drop policy if exists camera_evidence_gaps_select_member
  on public.camera_evidence_gaps;

create policy camera_evidence_gaps_select_member
on public.camera_evidence_gaps
for select
to authenticated
using (
  exists (
    select 1
    from public.organization_members member
    where member.organization_id =
      camera_evidence_gaps.organization_id
      and member.user_id = auth.uid()
  )
);

revoke all on table public.camera_evidence_gaps
  from anon;

grant select on table public.camera_evidence_gaps
  to authenticated;

grant all on table public.camera_evidence_gaps
  to service_role;

-- O MCP de produção é somente leitura.
do $$
begin
  if exists (
    select 1
    from pg_roles
    where rolname = 'monitoria_mcp_readonly'
  ) then
    execute 'grant select on table public.camera_evidence_gaps to monitoria_mcp_readonly';
  end if;
end;
$$;

commit;
