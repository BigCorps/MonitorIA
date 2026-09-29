-- PILOTO MANUAL: habilita classificação visual criança/adulto em UMA câmera.
-- NÃO transformar em migration.
--
-- Preencha:
--   <ORGANIZATION_ID>
--   <CAMERA_ID>

begin;

do $$
declare
  v_org_id uuid := '<ORGANIZATION_ID>'::uuid;
  v_camera_id uuid := '<CAMERA_ID>'::uuid;
  v_profile_id uuid;
begin
  if not exists (
    select 1
    from public.cameras camera
    where camera.id = v_camera_id
      and camera.organization_id = v_org_id
  ) then
    raise exception 'camera_not_in_organization';
  end if;

  select profile.id
    into v_profile_id
  from public.camera_profiles profile
  where profile.organization_id = v_org_id
    and profile.camera_id = v_camera_id
    and profile.is_active = true
  order by profile.version desc
  limit 1;

  if v_profile_id is null then
    raise exception 'active_camera_profile_not_found';
  end if;

  update public.camera_profiles
  set
    monitoring_goals = case
      when coalesce(monitoring_goals, '[]'::jsonb)
        ? 'PROINF_CHILD_ADULT_CLASSIFICATION'
      then monitoring_goals
      else coalesce(monitoring_goals, '[]'::jsonb)
        || jsonb_build_array('PROINF_CHILD_ADULT_CLASSIFICATION')
    end,
    updated_at = now()
  where id = v_profile_id;
end
$$;

commit;

-- Para desativar depois do piloto:
--
-- update public.camera_profiles
-- set monitoring_goals = (
--   select coalesce(jsonb_agg(item.value), '[]'::jsonb)
--   from jsonb_array_elements(monitoring_goals) item(value)
--   where trim(both '"' from item.value::text)
--     <> 'PROINF_CHILD_ADULT_CLASSIFICATION'
-- ),
-- updated_at = now()
-- where organization_id = '<ORGANIZATION_ID>'::uuid
--   and camera_id = '<CAMERA_ID>'::uuid
--   and is_active = true;
