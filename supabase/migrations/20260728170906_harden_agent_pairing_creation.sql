drop function if exists public.create_agent_pairing_code(uuid, text);

create or replace function public.create_agent_pairing_code(
  p_camera_id uuid,
  p_code_hash text,
  p_created_by uuid
)
returns table(pairing_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_organization_id uuid;
  v_site_id uuid;
  v_pairing_id uuid;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  select c.organization_id, c.site_id
    into v_organization_id, v_site_id
  from public.cameras c
  where c.id = p_camera_id;

  if v_organization_id is null then
    raise exception 'camera not found';
  end if;

  if not exists (
    select 1
    from public.organization_members m
    where m.organization_id = v_organization_id
      and m.user_id = p_created_by
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'access denied';
  end if;

  update public.agent_pairing_codes
     set revoked_at = now()
   where camera_id = p_camera_id
     and used_at is null
     and revoked_at is null;

  insert into public.agent_pairing_codes(
    organization_id,
    site_id,
    camera_id,
    code_hash,
    expires_at,
    created_by
  ) values (
    v_organization_id,
    v_site_id,
    p_camera_id,
    p_code_hash,
    v_expires_at,
    p_created_by
  )
  returning id into v_pairing_id;

  update public.cameras
     set pairing_status = 'pairing'
   where id = p_camera_id;

  return query select v_pairing_id, v_expires_at;
end;
$$;

revoke execute on function public.create_agent_pairing_code(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.create_agent_pairing_code(uuid, text, uuid)
  to service_role;

create policy agent_pairing_codes_explicit_deny
on public.agent_pairing_codes
as restrictive
for all
to authenticated
using (false)
with check (false);
