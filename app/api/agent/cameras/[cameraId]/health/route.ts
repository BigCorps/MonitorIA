import { NextResponse, type NextRequest } from "next/server";
import { CameraHealthMetricsSchema } from "@/src/contracts/camera-health";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ cameraId: string }> }) {
  const { cameraId } = await context.params;
  const authenticated = await authenticateAgentCamera(request, cameraId);
  if (!authenticated) return NextResponse.json({ ok: false, error: "invalid_agent_camera" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }

  const parsed = CameraHealthMetricsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_camera_health_payload" }, { status: 400 });
  }

  const supabase = authenticated.supabase;
  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select("health_intelligence_enabled")
    .eq("id", cameraId)
    .eq("organization_id", authenticated.camera.organizationId)
    .maybeSingle();

  if (cameraError || !camera) return NextResponse.json({ ok: false, error: "camera_unavailable" }, { status: 404 });
  if (!camera.health_intelligence_enabled) {
    return NextResponse.json({ ok: true, ignored: true, reason: "camera_health_disabled" });
  }

  const value = parsed.data;
  const { data: observation, error } = await supabase
    .from("camera_health_observations")
    .insert({
      organization_id: authenticated.camera.organizationId,
      site_id: authenticated.camera.siteId,
      camera_id: cameraId,
      agent_id: authenticated.agent.id,
      source: value.source,
      captured_at: value.capturedAt,
      width: value.width,
      height: value.height,
      brightness_mean: value.brightnessMean,
      contrast_stddev: value.contrastStddev,
      edge_density: value.edgeDensity,
      blur_score: value.blurScore,
      dark_pixel_ratio: value.darkPixelRatio,
      bright_pixel_ratio: value.brightPixelRatio,
      grid_signature: value.gridSignature,
      content_hash: value.contentHash.toLowerCase(),
      metadata: value.metadata,
    })
    .select("id")
    .single();

  if (error || !observation) {
    console.error("Falha ao registrar saúde da câmera:", error?.message);
    return NextResponse.json({ ok: false, error: "camera_health_insert_failed" }, { status: 500 });
  }

  const { data: result, error: processingError } = await supabase.rpc(
    "process_camera_health_observation_v1",
    { p_observation_id: observation.id },
  );

  if (processingError) {
    console.error("Falha ao processar saúde da câmera:", processingError.message);
    return NextResponse.json({ ok: false, error: "camera_health_processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, observationId: observation.id, result }, { headers: { "Cache-Control": "no-store" } });
}
