import {
  MONITORIA_CLIP_MAX_DURATION_SECONDS,
  MONITORIA_CLIP_PRE_ROLL_SECONDS,
  MONITORIA_CLIP_RETENTION_DAYS,
  clipDurationForEvent,
  planSupportsClips,
} from "@/src/clips/policy";

export type MonitoriaClipUploadRequest = {
  requestId: string;
  assetId: string;
  eventId: string;
  signedUrl: string;
  storagePath: string;
  clipStartsAt: string;
  clipEndsAt: string;
  durationSeconds: number;
  uploadExpiresAt: string;
};

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

function dateParts(value: Date) {
  return {
    year: String(value.getUTCFullYear()),
    month: String(value.getUTCMonth() + 1).padStart(2, "0"),
    day: String(value.getUTCDate()).padStart(2, "0"),
  };
}

/**
 * Cria ou renova uma solicitação de clipe.
 *
 * O evento já foi persistido quando esta função é chamada. Qualquer falha
 * aqui é registrada, mas nunca invalida o acontecimento ou suas imagens.
 */
export async function createMonitoriaClipUploadRequest(input: {
  supabase: any;
  organizationId: string;
  cameraId: string;
  agentId: string;
  analysisJobId: string;
  eventId: string;
  planCode: string;
  startedAt: string;
  endedAt: string;
}): Promise<MonitoriaClipUploadRequest | null> {
  if (!planSupportsClips(input.planCode)) return null;

  const { data: entitlement, error: entitlementError } =
    await input.supabase
      .from("camera_entitlements")
      .select(
        "clip_enabled,clip_duration_seconds,clip_retention_days,monitoring_allowed",
      )
      .eq("organization_id", input.organizationId)
      .eq("camera_id", input.cameraId)
      .maybeSingle();

  if (entitlementError) {
    console.error(
      "Falha ao consultar direito de clipe:",
      entitlementError.message,
    );
  }

  // Compatibilidade com câmeras legadas que ainda não possuem snapshot de
  // entitlement, sem liberar clipe para planos diferentes do Detalhada.
  const clipEnabled =
    entitlement?.clip_enabled === true ||
    (entitlement == null && input.planCode === "intensive");

  if (!clipEnabled) return null;

  /*
   * Antes: 15 segundos fixos, e o boundedInteger travava qualquer
   * configuração em 30. Agora o clipe cobre o acontecimento inteiro.
   *
   * camera_entitlements.clip_duration_seconds passou a ser o LIMITE da
   * câmera, não a duração. Quem decide o tamanho é o evento.
   */
  const durationSeconds = clipDurationForEvent({
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    maxAllowedSeconds: boundedInteger(
      entitlement?.clip_duration_seconds,
      MONITORIA_CLIP_MAX_DURATION_SECONDS,
      5,
      MONITORIA_CLIP_MAX_DURATION_SECONDS,
    ),
  });
  const retentionDays = boundedInteger(
    entitlement?.clip_retention_days,
    MONITORIA_CLIP_RETENTION_DAYS,
    1,
    365,
  );

  const eventStart = new Date(input.startedAt);
  // Pré-roll definido na política, junto do cálculo da duração.
  const clipStartsAt = new Date(
    eventStart.getTime() - MONITORIA_CLIP_PRE_ROLL_SECONDS * 1000,
  );
  const clipEndsAt = new Date(
    clipStartsAt.getTime() + durationSeconds * 1000,
  );
  const parts = dateParts(eventStart);
  const storagePath = [
    input.organizationId,
    input.cameraId,
    parts.year,
    parts.month,
    parts.day,
    input.eventId,
    "clip.mp4",
  ].join("/");
  const expiresAt = new Date(
    eventStart.getTime() + retentionDays * 86_400_000,
  ).toISOString();

  const { data: existingAsset } = await input.supabase
    .from("storage_assets")
    .select("id,status")
    .eq("bucket", "event-clips")
    .eq("storage_path", storagePath)
    .is("deleted_at", null)
    .maybeSingle();

  if (existingAsset?.status === "ready") {
    return null;
  }

  const { data: asset, error: assetError } = existingAsset
    ? await input.supabase
        .from("storage_assets")
        .update({
          status: "pending",
          event_id: input.eventId,
          expires_at: expiresAt,
        })
        .eq("id", existingAsset.id)
        .select("id,status")
        .single()
    : await input.supabase
        .from("storage_assets")
        .insert({
          organization_id: input.organizationId,
          camera_id: input.cameraId,
          analysis_job_id: input.analysisJobId,
          event_id: input.eventId,
          kind: "preserved_clip",
          status: "pending",
          bucket: "event-clips",
          storage_path: storagePath,
          mime_type: "video/mp4",
          captured_at: input.startedAt,
          expires_at: expiresAt,
          deleted_at: null,
          frame_label: "clip",
          retention_class: "clip",
        })
        .select("id,status")
        .single();

  if (assetError || !asset) {
    console.error(
      "Falha ao preparar ativo de clipe:",
      assetError?.message ?? "asset_missing",
    );
    return null;
  }

  const { data: existingRequest } = await input.supabase
    .from("clip_generation_requests")
    .select("id,status")
    .eq("analysis_job_id", input.analysisJobId)
    .maybeSingle();

  if (existingRequest?.status === "ready") {
    return null;
  }

  const requestPayload = {
    organization_id: input.organizationId,
    camera_id: input.cameraId,
    analysis_job_id: input.analysisJobId,
    event_id: input.eventId,
    agent_id: input.agentId,
    storage_asset_id: asset.id,
    status: "pending",
    clip_starts_at: clipStartsAt.toISOString(),
    clip_ends_at: clipEndsAt.toISOString(),
    duration_seconds: durationSeconds,
    bucket: "event-clips",
    storage_path: storagePath,
    error_code: null,
    error_message: null,
    updated_at: new Date().toISOString(),
  };

  const { data: clipRequest, error: requestError } =
    existingRequest
      ? await input.supabase
          .from("clip_generation_requests")
          .update(requestPayload)
          .eq("id", existingRequest.id)
          .select("id,status")
          .single()
      : await input.supabase
          .from("clip_generation_requests")
          .insert(requestPayload)
          .select("id,status")
          .single();

  if (requestError || !clipRequest) {
    console.error(
      "Falha ao criar solicitação de clipe:",
      requestError?.message ?? "request_missing",
    );
    await input.supabase
      .from("storage_assets")
      .update({ status: "failed" })
      .eq("id", asset.id);
    return null;
  }

  const { data: signed, error: signedError } =
    await input.supabase.storage
      .from("event-clips")
      .createSignedUploadUrl(storagePath, {
        upsert: true,
      });

  if (signedError || !signed?.signedUrl) {
    console.error(
      "Falha ao assinar upload do clipe:",
      signedError?.message ?? "signed_url_missing",
    );
    await input.supabase
      .from("clip_generation_requests")
      .update({
        status: "failed",
        error_code: "signed_upload_unavailable",
        error_message:
          signedError?.message ?? "URL de upload indisponível.",
      })
      .eq("id", clipRequest.id);
    return null;
  }

  const uploadExpiresAt = new Date(
    Date.now() + 2 * 60 * 60 * 1000,
  ).toISOString();

  await input.supabase
    .from("clip_generation_requests")
    .update({
      status: "uploading",
      upload_expires_at: uploadExpiresAt,
      attempt_count: 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clipRequest.id);

  return {
    requestId: String(clipRequest.id),
    assetId: String(asset.id),
    eventId: input.eventId,
    signedUrl: String(signed.signedUrl),
    storagePath,
    clipStartsAt: clipStartsAt.toISOString(),
    clipEndsAt: clipEndsAt.toISOString(),
    durationSeconds,
    uploadExpiresAt,
  };
}
