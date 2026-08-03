alter table public.analysis_jobs add column if not exists retention_snapshot jsonb not null default '{}'::jsonb;
alter table public.events add column if not exists retention_snapshot jsonb not null default '{}'::jsonb;
alter table public.storage_assets
  add column if not exists frame_label text,
  add column if not exists retention_class text not null default 'temporary',
  add column if not exists retention_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists content_sha256 text,
  add column if not exists promoted_from_asset_id uuid;

alter table public.storage_assets drop constraint if exists storage_assets_frame_label_check;
alter table public.storage_assets add constraint storage_assets_frame_label_check check (frame_label is null or frame_label in ('start','peak','end','extra','profile','clip'));
alter table public.storage_assets drop constraint if exists storage_assets_retention_class_check;
alter table public.storage_assets add constraint storage_assets_retention_class_check check (retention_class in ('temporary','long_term','clip'));
alter table public.storage_assets drop constraint if exists storage_assets_content_sha256_check;
alter table public.storage_assets add constraint storage_assets_content_sha256_check check (content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$');
alter table public.storage_assets drop constraint if exists storage_assets_promoted_from_asset_id_fkey;
alter table public.storage_assets add constraint storage_assets_promoted_from_asset_id_fkey foreign key (promoted_from_asset_id) references public.storage_assets(id) on delete set null;

create index if not exists analysis_jobs_retention_plan_idx on public.analysis_jobs ((retention_snapshot->>'planCode'), ended_at desc);
create index if not exists events_retention_expiry_idx on public.events (organization_id, expires_at) where deleted_at is null;
create index if not exists storage_assets_retention_expiry_idx on public.storage_assets (retention_class, expires_at) where deleted_at is null;
create index if not exists storage_assets_job_frame_idx on public.storage_assets (analysis_job_id, frame_label, captured_at, id) where deleted_at is null;
create index if not exists storage_assets_promoted_from_idx on public.storage_assets (promoted_from_asset_id) where promoted_from_asset_id is not null;

create or replace function private.monitoria_retention_snapshot(p_plan_code text)
returns jsonb language sql stable security definer set search_path=''
as $$
select jsonb_build_object(
  'version',1,
  'planCode',plan.code,
  'metadataRetentionDays',plan.metadata_retention_days,
  'longTermKeyframes',plan.long_term_keyframes,
  'temporaryFrameDays',plan.temporary_frame_days,
  'clipEnabled',plan.clip_enabled,
  'clipDurationSeconds',plan.clip_duration_seconds,
  'clipRetentionDays',plan.clip_retention_days,
  'capturedAt',now()
)
from public.camera_plan_catalog plan
where plan.code=p_plan_code and plan.is_active=true;
$$;
revoke all on function private.monitoria_retention_snapshot(text) from public,anon,authenticated;
grant execute on function private.monitoria_retention_snapshot(text) to service_role;

create or replace function private.monitoria_frame_priority(p_plan_code text,p_frame_label text)
returns integer language sql immutable set search_path=''
as $$
select case when p_plan_code='basic' then
  case p_frame_label when 'peak' then 1 when 'start' then 2 when 'end' then 3 when 'extra' then 4 else 99 end
else
  case p_frame_label when 'start' then 1 when 'peak' then 2 when 'end' then 3 when 'extra' then 4 else 99 end
end;
$$;
revoke all on function private.monitoria_frame_priority(text,text) from public,anon,authenticated;
grant execute on function private.monitoria_frame_priority(text,text) to service_role;

create or replace function private.capture_monitoria_job_retention()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_plan_code text; v_snapshot jsonb;
begin
  v_plan_code:=nullif(new.analysis_plan_code,'');
  if v_plan_code is null then select camera.analysis_plan_code into v_plan_code from public.cameras camera where camera.id=new.camera_id; end if;
  v_plan_code:=coalesce(v_plan_code,'basic');
  v_snapshot:=private.monitoria_retention_snapshot(v_plan_code);
  if v_snapshot is null then raise exception 'retention_plan_not_found'; end if;
  new.analysis_plan_code:=v_plan_code;
  new.retention_snapshot:=v_snapshot;
  return new;
end;
$$;
revoke all on function private.capture_monitoria_job_retention() from public,anon,authenticated;
grant execute on function private.capture_monitoria_job_retention() to service_role;
drop trigger if exists trg_zz_analysis_jobs_retention_snapshot on public.analysis_jobs;
create trigger trg_zz_analysis_jobs_retention_snapshot before insert or update of analysis_plan_code on public.analysis_jobs for each row execute function private.capture_monitoria_job_retention();
