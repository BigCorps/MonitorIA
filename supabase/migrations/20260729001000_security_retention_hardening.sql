-- Corrige cast inseguro da policy do Storage.
drop policy if exists storage_read_org_assets on storage.objects;

create policy storage_read_org_assets
on storage.objects
for select
to authenticated
using (
  bucket_id = any (
    array[
      'analysis-frames'::text,
      'event-keyframes'::text,
      'preserved-clips'::text
    ]
  )
  and case
    when coalesce((storage.foldername(name))[1], '') ~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then private.is_org_member(
      ((storage.foldername(name))[1])::uuid
    )
    else false
  end
);

-- Mantém apenas o índice original que garante um perfil ativo por câmera.
drop index if exists public.camera_profiles_one_active_per_camera_idx;

-- Endurece as funções usadas pelas policies.
create or replace function private.is_org_member(
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.has_org_role(
  target_organization_id uuid,
  allowed_roles public.organization_role[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_organization_id
      and m.user_id = (select auth.uid())
      and m.role = any(allowed_roles)
  );
$$;

revoke all on function private.is_org_member(uuid)
  from public, anon;
revoke all on function private.has_org_role(
  uuid,
  public.organization_role[]
) from public, anon;

grant execute on function private.is_org_member(uuid)
  to authenticated, service_role;
grant execute on function private.has_org_role(
  uuid,
  public.organization_role[]
) to authenticated, service_role;

-- Alinha a retenção padrão da v1 ao documento do produto.
alter table public.retention_policies
  alter column keyframe_days set default 90,
  alter column metadata_days set default 90;

update public.retention_policies
set keyframe_days = least(keyframe_days, 90),
    metadata_days = least(metadata_days, 90),
    updated_at = now()
where keyframe_days > 90
   or metadata_days > 90;

-- Garante tecnicamente que um track_id nunca represente a mesma pessoa
-- ou veículo entre eventos distintos.
create or replace function private.scope_event_local_track_id()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prefix text;
begin
  if new.local_track_id is null
     or pg_catalog.btrim(new.local_track_id) = '' then
    new.local_track_id := null;
    return new;
  end if;

  v_prefix := new.event_id::text || ':';

  if pg_catalog.left(
       new.local_track_id,
       pg_catalog.length(v_prefix)
     ) <> v_prefix then
    new.local_track_id :=
      v_prefix || pg_catalog.left(new.local_track_id, 100);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_scope_event_people_track_id
  on public.event_people;

create trigger trg_scope_event_people_track_id
before insert or update of event_id, local_track_id
on public.event_people
for each row
execute function private.scope_event_local_track_id();

drop trigger if exists trg_scope_event_vehicle_track_id
  on public.event_vehicles;

create trigger trg_scope_event_vehicle_track_id
before insert or update of event_id, local_track_id
on public.event_vehicles
for each row
execute function private.scope_event_local_track_id();

comment on column public.event_people.local_track_id is
  'Identificador transitório limitado ao evento. Não pode ser reutilizado para reidentificação entre eventos, sessões ou dias.';

comment on column public.event_vehicles.local_track_id is
  'Identificador transitório limitado ao evento. Não pode ser reutilizado entre eventos.';

comment on table public.event_plate_suggestions is
  'Estrutura reservada para add-on futuro. A leitura de placas permanece desativada na v1.';

-- Remove somente metadados cujos objetos de Storage já foram excluídos
-- pelo endpoint autenticado de retenção.
create or replace function public.purge_expired_monitoria_metadata(
  p_limit integer default 500
)
returns table(
  events_deleted bigint,
  jobs_deleted bigint,
  asset_rows_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer :=
    greatest(1, least(coalesce(p_limit, 500), 5000));
  v_events bigint := 0;
  v_jobs bigint := 0;
  v_assets bigint := 0;
begin
  delete from public.events e
  where e.id in (
    select candidate.id
    from public.events candidate
    where candidate.expires_at <= now()
      and not exists (
        select 1
        from public.storage_assets sa
        where sa.event_id = candidate.id
          and sa.deleted_at is null
      )
    order by candidate.expires_at
    limit v_limit
  );
  get diagnostics v_events = row_count;

  delete from public.analysis_jobs aj
  where aj.id in (
    select candidate.id
    from public.analysis_jobs candidate
    join public.retention_policies rp
      on rp.organization_id = candidate.organization_id
    where candidate.status in (
        'completed'::public.analysis_job_status,
        'failed'::public.analysis_job_status,
        'cancelled'::public.analysis_job_status
      )
      and candidate.ended_at <=
        now() - pg_catalog.make_interval(
          days => rp.metadata_days::integer
        )
      and not exists (
        select 1
        from public.events e
        where e.analysis_job_id = candidate.id
      )
      and not exists (
        select 1
        from public.storage_assets sa
        where sa.analysis_job_id = candidate.id
          and sa.deleted_at is null
      )
    order by candidate.ended_at
    limit v_limit
  );
  get diagnostics v_jobs = row_count;

  delete from public.storage_assets sa
  where sa.id in (
    select candidate.id
    from public.storage_assets candidate
    where candidate.deleted_at is not null
      and candidate.deleted_at <= now() - interval '1 day'
      and candidate.event_id is null
      and candidate.analysis_job_id is null
    order by candidate.deleted_at
    limit v_limit
  );
  get diagnostics v_assets = row_count;

  return query select v_events, v_jobs, v_assets;
end;
$$;

revoke all on function
  public.purge_expired_monitoria_metadata(integer)
  from public, anon, authenticated;

grant execute on function
  public.purge_expired_monitoria_metadata(integer)
  to service_role;
