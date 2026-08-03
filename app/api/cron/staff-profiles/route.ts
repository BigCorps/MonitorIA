import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret && secret.length >= 16 &&
    request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

function batchSize() {
  const value = Number(process.env.STAFF_PROFILE_CRON_BATCH_SIZE ?? "100");
  return Number.isFinite(value) ? Math.max(1, Math.min(500, Math.floor(value))) : 100;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") === "full" ? "full" : "queue";
  const organizationId = request.nextUrl.searchParams.get("organization_id");
  const cameraId = request.nextUrl.searchParams.get("camera_id");
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  const result = mode === "full"
    ? await supabase.rpc("refresh_all_staff_profile_intelligence_v1", {
        p_organization_id: organizationId || null,
        p_camera_id: cameraId || null,
        p_from: new Date(Date.now() - 30 * 86400000).toISOString(),
        p_to: new Date().toISOString(),
        p_limit: batchSize() * 20,
      })
    : await supabase.rpc("process_staff_profile_learning_queue_v1", {
        p_limit: batchSize(),
      });

  if (result.error) {
    console.error("Falha na inteligência de perfis operacionais:", result.error.message);
    return NextResponse.json({ ok: false, mode, error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mode,
    startedAt,
    completedAt: new Date().toISOString(),
    result: result.data,
  }, { headers: { "Cache-Control": "no-store" } });
}
