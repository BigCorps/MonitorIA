import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { authorizeRecordingCamera } from "@/src/lib/recording-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  cameraId: z.string().uuid(),
  requestKey: z.string().trim().min(8).max(160),
  sourceFilename: z.string().trim().min(1).max(260),
  fileSizeBytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  durationSeconds: z.number().int().min(1).max(3600),
  sourceStartedAt: z.string().datetime({ offset: true }),
  codec: z.string().trim().max(80).nullable().optional(),
  width: z.number().int().min(1).max(16384).nullable().optional(),
  height: z.number().int().min(1).max(16384).nullable().optional(),
  decoderMode: z.enum(["native", "compatibility"]),
  nativePreview: z.boolean(),
  browserMetadata: z.record(z.unknown()).optional().default({}),
}).strict();

function rpcStatus(message: string) {
  if (
    message.includes("recording_quota_exceeded") ||
    message.includes("recording_entitlement_required")
  ) {
    return 403;
  }
  if (message.includes("not_authorized")) return 403;
  return 400;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return NextResponse.json(
      { ok: false, error: "organization_not_found" },
      { status: 404 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_recording_session" },
      { status: 400 },
    );
  }

  const authorized = await authorizeRecordingCamera(body.cameraId, {
    requireManager: true,
  });
  if ("error" in authorized) {
    return NextResponse.json(
      { ok: false, error: authorized.error },
      { status: authorized.status },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "reserve_monitoria_recording_session",
    {
      p_organization_id: organization.id,
      p_camera_id: body.cameraId,
      p_request_key: body.requestKey,
      p_source_filename: body.sourceFilename,
      p_file_size_bytes: body.fileSizeBytes,
      p_duration_seconds: body.durationSeconds,
      p_source_started_at: body.sourceStartedAt,
      p_codec: body.codec ?? null,
      p_width: body.width ?? null,
      p_height: body.height ?? null,
      p_decoder_mode: body.decoderMode,
      p_native_preview: body.nativePreview,
      p_browser_metadata: body.browserMetadata,
    },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: rpcStatus(error.message) },
    );
  }

  return NextResponse.json(
    { ok: true, ...((data ?? {}) as Record<string, unknown>) },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
