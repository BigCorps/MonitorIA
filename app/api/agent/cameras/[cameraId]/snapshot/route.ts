import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ cameraId: string }>;
};

function parsePositiveInteger(value: string | null) {
  if (!value) return null;
  const number = Number.parseInt(value, 10);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeCapturedAt(value: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isJpeg(buffer: Buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { cameraId } = await context.params;
  if (!z.string().uuid().safeParse(cameraId).success) {
    return NextResponse.json({ ok: false, error: "invalid_camera_id" }, { status: 400 });
  }

  const authenticated = await authenticateAgentCamera(request, cameraId);
  if (!authenticated) {
    return NextResponse.json({ ok: false, error: "invalid_agent_camera" }, { status: 401 });
  }

  const contentType = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "image/jpeg") {
    return NextResponse.json({ ok: false, error: "jpeg_required" }, { status: 415 });
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (declaredLength > MAX_SNAPSHOT_BYTES) {
    return NextResponse.json({ ok: false, error: "snapshot_too_large" }, { status: 413 });
  }

  const buffer = Buffer.from(await request.arrayBuffer());
  if (
    buffer.length < 1024 ||
    buffer.length > MAX_SNAPSHOT_BYTES ||
    !isJpeg(buffer)
  ) {
    return NextResponse.json({ ok: false, error: "invalid_jpeg" }, { status: 400 });
  }

  const capturedAt = safeCapturedAt(request.headers.get("x-monitoria-captured-at"));
  const width = parsePositiveInteger(request.headers.get("x-monitoria-width"));
  const height = parsePositiveInteger(request.headers.get("x-monitoria-height"));
  const streamLabel = request.headers.get("x-monitoria-stream-label")?.trim().slice(0, 160) || null;

  const { data: retention } = await authenticated.supabase
    .from("retention_policies")
    .select("temporary_frame_days")
    .eq("organization_id", authenticated.agent.organizationId)
    .maybeSingle();

  const retentionDays = Math.max(
    1,
    Math.min(30, Number(retention?.temporary_frame_days ?? 3)),
  );
  const expiresAt = new Date(
    Date.now() + retentionDays * 24 * 60 * 60 * 1000,
  );

  const year = capturedAt.getUTCFullYear();
  const month = String(capturedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(capturedAt.getUTCDate()).padStart(2, "0");
  const filename = `setup-${capturedAt.getTime()}-${randomUUID()}.jpg`;
  const storagePath = [
    authenticated.agent.organizationId,
    cameraId,
    String(year),
    month,
    day,
    filename,
  ].join("/");

  const { error: uploadError } = await authenticated.supabase.storage
    .from("analysis-frames")
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Falha ao enviar primeiro frame:", uploadError.message);
    return NextResponse.json({ ok: false, error: "snapshot_upload_failed" }, { status: 500 });
  }

  const { data: asset, error: assetError } = await authenticated.supabase
    .from("storage_assets")
    .insert({
      organization_id: authenticated.agent.organizationId,
      camera_id: cameraId,
      analysis_job_id: null,
      event_id: null,
      kind: "analysis_frame",
      status: "ready",
      bucket: "analysis-frames",
      storage_path: storagePath,
      mime_type: "image/jpeg",
      byte_size: buffer.length,
      width,
      height,
      captured_at: capturedAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();

  if (assetError || !asset) {
    console.error("Falha ao registrar primeiro frame:", assetError?.message);
    await authenticated.supabase.storage.from("analysis-frames").remove([storagePath]);
    return NextResponse.json({ ok: false, error: "snapshot_registration_failed" }, { status: 500 });
  }

  const cameraUpdate: Record<string, unknown> = {
    status: "online",
    last_seen_at: new Date().toISOString(),
  };

  if (streamLabel) {
    cameraUpdate.stream_label = streamLabel;
  }

  const { error: cameraError } = await authenticated.supabase
    .from("cameras")
    .update(cameraUpdate)
    .eq("id", cameraId)
    .eq("organization_id", authenticated.agent.organizationId);

  if (cameraError) {
    console.error("Falha ao marcar câmera online:", cameraError.message);
    return NextResponse.json({ ok: false, error: "camera_online_update_failed" }, { status: 500 });
  }

  await authenticated.supabase.from("audit_logs").insert({
    organization_id: authenticated.agent.organizationId,
    actor_user_id: null,
    action: "camera.first_frame_received",
    entity_type: "camera",
    entity_id: cameraId,
    metadata: {
      agent_id: authenticated.agent.id,
      asset_id: String(asset.id),
      width,
      height,
      byte_size: buffer.length,
      expires_at: expiresAt.toISOString(),
    },
  });

  return NextResponse.json(
    {
      ok: true,
      cameraId,
      assetId: String(asset.id),
      capturedAt: capturedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      byteSize: buffer.length,
      width,
      height,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
