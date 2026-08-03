import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && secret.length >= 16 && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const organizationId = new URL(request.url).searchParams.get("organization_id");
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("evaluate_camera_health_staleness_v1", {
    p_organization_id: organizationId || null,
  });
  if (error) {
    console.error("Falha na avaliação de saúde:", error.message);
    return NextResponse.json({ ok: false, error: "camera_health_evaluation_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, result: data, executedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
