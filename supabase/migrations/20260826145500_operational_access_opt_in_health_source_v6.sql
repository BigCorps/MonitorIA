-- MonitorIA — câmera opt-in como fonte da inferência operacional
-- JÁ APLICADA no Supabase de produção em 26/08/2026.
-- Adicione ao GitHub para manter o histórico sincronizado.
-- Não execute novamente manualmente no projeto atual.

do $patch$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'private.monitoria_reconcile_operating_from_health_v1(uuid,timestamp with time zone)'::regprocedure
  ) into v_definition;

  if position(
    'private.monitoria_access_name_is_physical_v1(entity.name)'
    in v_definition
  ) = 0 then
    raise exception 'expected health reconciler predicate not found';
  end if;

  v_definition := replace(
    v_definition,
    'and private.monitoria_access_name_is_physical_v1(entity.name)',
    'and camera.operational_access_enabled'
  );

  execute v_definition;
end;
$patch$;

comment on function private.monitoria_reconcile_operating_from_health_v1(uuid,timestamptz) is
  'Reconcilia abertura/fechamento por mudança persistente de regime visual. A câmera de referência é definida pelo opt-in cameras.operational_access_enabled; o nome da área visual não é requisito.';

update public.camera_visual_entities entity
set metadata = coalesce(entity.metadata,'{}'::jsonb)
  - 'reason'
  - 'invalidatedAt'
  - 'invalidatedBy'
  - 'operationalAccessDisabledAt'
  || jsonb_build_object(
    'operationalAccessOptIn', true,
    'operationalAccessMetadataCleanedAt', now()
  ),
  updated_at = now()
from public.cameras camera
where camera.id = entity.camera_id
  and camera.operational_access_enabled
  and entity.enabled
  and entity.primary_operational_marker
  and entity.entity_type = 'access_barrier';
