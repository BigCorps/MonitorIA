-- MonitorIA — Dashboard de Produção — Fase 7
-- Funcionamento das câmeras: confirmação explícita de reposicionamento intencional.
-- Migration aditiva. Não altera Agent, ONVIF/RTSP, descoberta, pareamento ou FFmpeg.

begin;

create or replace function public.replace_camera_health_baseline_from_latest_v1(
  p_camera_id uuid,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_camera public.cameras%rowtype;
  v_observation public.camera_health_observations%rowtype;
  v_baseline_id uuid;
  v_version integer;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  select *
    into v_camera
  from public.cameras
  where id = p_camera_id
  for update;

  if not found then
    raise exception 'Câmera não encontrada.';
  end if;

  if not private.has_org_role(
    v_camera.organization_id,
    array['owner'::public.organization_role, 'admin'::public.organization_role]
  ) then
    raise exception 'Acesso negado.';
  end if;

  select *
    into v_observation
  from public.camera_health_observations
  where organization_id = v_camera.organization_id
    and camera_id = v_camera.id
  order by captured_at desc
  limit 1;

  if not found then
    raise exception 'Ainda não existe uma verificação recente para usar como referência.';
  end if;

  if v_observation.issue_codes && array[
    'possible_frame_freeze',
    'lens_obstructed',
    'low_light',
    'overexposed',
    'blurry',
    'image_degraded'
  ]::text[] then
    raise exception 'A imagem atual ainda apresenta um problema de qualidade. Corrija a imagem antes de criar uma nova referência visual.';
  end if;

  select coalesce(max(version), 0) + 1
    into v_version
  from public.camera_health_baselines
  where camera_id = v_camera.id;

  update public.camera_health_baselines
  set status = 'retired',
      retired_at = now(),
      updated_at = now()
  where camera_id = v_camera.id
    and status = 'active';

  update public.camera_health_baselines
  set status = 'rejected',
      notes = trim(concat_ws(
        ' ',
        notes,
        'Substituída por uma nova referência confirmada pelo administrador.'
      )),
      updated_at = now()
  where camera_id = v_camera.id
    and status = 'proposed';

  insert into public.camera_health_baselines (
    organization_id,
    site_id,
    camera_id,
    profile_id,
    version,
    status,
    source,
    captured_at,
    brightness_mean,
    contrast_stddev,
    edge_density,
    blur_score,
    dark_pixel_ratio,
    bright_pixel_ratio,
    grid_signature,
    content_hash,
    sample_count,
    distinct_days,
    confidence,
    approved_by,
    approved_at,
    notes
  )
  values (
    v_camera.organization_id,
    v_observation.site_id,
    v_camera.id,
    null,
    v_version,
    'active',
    'replacement',
    v_observation.captured_at,
    v_observation.brightness_mean,
    v_observation.contrast_stddev,
    v_observation.edge_density,
    v_observation.blur_score,
    v_observation.dark_pixel_ratio,
    v_observation.bright_pixel_ratio,
    v_observation.grid_signature,
    v_observation.content_hash,
    1,
    1,
    v_observation.confidence,
    auth.uid(),
    now(),
    trim(concat_ws(
      ' ',
      'Nova referência criada a partir da última verificação após reposicionamento intencional.',
      nullif(btrim(coalesce(p_notes, '')), '')
    ))
  )
  returning id into v_baseline_id;

  -- A nova referência precisa de pelo menos uma próxima leitura para ser
  -- comparada. Por isso voltamos temporariamente ao estado de aprendizado em
  -- vez de mascarar outras possíveis falhas de imagem como "saudável".
  update public.cameras
  set health_status = 'learning',
      updated_at = now()
  where id = v_camera.id;

  -- O usuário acabou de declarar que mudança de posição/referência era
  -- intencional. Somente os incidentes diretamente relacionados à referência
  -- visual são resolvidos; problemas de iluminação, foco ou obstrução não são
  -- encerrados por este fluxo.
  update public.camera_health_incidents
  set status = 'resolved',
      resolved_at = now(),
      updated_at = now()
  where camera_id = v_camera.id
    and status in ('observing', 'open')
    and incident_type in ('baseline_required', 'frame_shifted', 'profile_drift');

  update public.operational_insights
  set status = 'resolved',
      valid_until = now(),
      updated_at = now()
  where source_entity_type = 'camera_health_incident'
    and source_entity_id in (
      select incident.id
      from public.camera_health_incidents incident
      where incident.camera_id = v_camera.id
        and incident.incident_type in (
          'baseline_required',
          'frame_shifted',
          'profile_drift'
        )
        and incident.status = 'resolved'
    );

  insert into public.audit_logs (
    organization_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    v_camera.organization_id,
    auth.uid(),
    'camera_health.reference_replaced',
    'camera',
    v_camera.id::text,
    jsonb_build_object(
      'baselineId', v_baseline_id,
      'version', v_version,
      'sourceObservationId', v_observation.id,
      'sourceCapturedAt', v_observation.captured_at,
      'reason', 'intentional_reposition'
    )
  );

  return jsonb_build_object(
    'success', true,
    'cameraId', v_camera.id,
    'baselineId', v_baseline_id,
    'version', v_version,
    'status', 'active'
  );
end;
$$;

revoke all on function public.replace_camera_health_baseline_from_latest_v1(uuid, text)
  from public;
grant execute on function public.replace_camera_health_baseline_from_latest_v1(uuid, text)
  to authenticated;
comment on function public.replace_camera_health_baseline_from_latest_v1(uuid, text) is
  'Fase 7 dashboard: cria uma nova referência visual ativa a partir da observação mais recente somente após confirmação explícita de owner/admin.';

commit;
