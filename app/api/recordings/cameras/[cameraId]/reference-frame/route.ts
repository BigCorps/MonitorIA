import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRecordingCamera } from "@/src/lib/recording-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ cameraId: string }> };

function integerHeader(request: Request, name: string, fallback: number) {
  const value = Number(request.headers.get(name));
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;
}

function jpeg(buffer: Buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
}

export async function POST(request: Request, context: RouteContext) {
  const { cameraId } = await context.params;
  if (!z.string().uuid().safeParse(cameraId).success) {
    return NextResponse.json({ ok: false, error: "invalid_camera_id" }, { status: 400 });
  }

  const authorized = await authorizeRecordingCamera(cameraId, {
    requireManager: true,
  });
  if ("error" in authorized) {
    return NextResponse.json(
      { ok: false, error: authorized.error },
      { status: authorized.status },
    );
  }

  if (
    !String(request.headers.get("content-type") ?? "")
      .toLowerCase()
      .startsWith("image/jpeg")
  ) {
    return NextResponse.json(
      { ok: false, error: "jpeg_required" },
      { status: 415 },
    );
  }

  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length < 1024 || bytes.length > 5 * 1024 * 1024 || !jpeg(bytes)) {
    return NextResponse.json(
      { ok: false, error: "invalid_reference_frame" },
      { status: 400 },
    );
  }

  const width = Math.min(16384, integerHeader(request, "x-monitoria-width", 1280));
  const height = Math.min(16384, integerHeader(request, "x-monitoria-height", 720));
  const capturedAtRaw =
    request.headers.get("x-monitoria-captured-at") ?? new Date().toISOString();
  const capturedAt = new Date(capturedAtRaw);
  if (Number.isNaN(capturedAt.getTime())) {
    return NextResponse.json(
      { ok: false, error: "invalid_reference_time" },
      { status: 400 },
    );
  }

  const key = randomUUID();
  const storagePath = [
    authorized.organization.id,
    cameraId,
    "recording-reference",
    `${key}.jpg`,
  ].join("/");

  const { error: uploadError } = await authorized.supabase.storage
    .from("analysis-frames")
    .upload(storagePath, bytes, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Falha no frame de referência da gravação:", uploadError.message);
    return NextResponse.json(
      { ok: false, error: "reference_upload_failed" },
      { status: 500 },
    );
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
  const { data: asset, error: assetError } = await authorized.supabase
    .from("storage_assets")
    .insert({
      organization_id: authorized.organization.id,
      camera_id: cameraId,
      analysis_job_id: null,
      event_id: null,
      kind: "analysis_frame",
      status: "ready",
      bucket: "analysis-frames",
      storage_path: storagePath,
      mime_type: "image/jpeg",
      byte_size: bytes.length,
      width,
      height,
      captured_at: capturedAt.toISOString(),
      expires_at: expiresAt,
      content_sha256: createHash("sha256").update(bytes).digest("hex"),
    })
    .select("id")
    .single();

  if (assetError || !asset) {
    await authorized.supabase.storage
      .from("analysis-frames")
      .remove([storagePath])
      .catch(() => undefined);

    return NextResponse.json(
      { ok: false, error: "reference_registration_failed" },
      { status: 500 },
    );
  }

  await authorized.supabase.from("audit_logs").insert({
    organization_id: authorized.organization.id,
    actor_user_id: authorized.user.id,
    action: "recording.reference_frame_received",
    entity_type: "camera",
    entity_id: cameraId,
    metadata: {
      asset_id: String(asset.id),
      byte_size: bytes.length,
      width,
      height,
      original_video_uploaded: false,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      assetId: String(asset.id),
      width,
      height,
      capturedAt: capturedAt.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
