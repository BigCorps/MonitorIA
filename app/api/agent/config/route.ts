import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ ok: false, error: "invalid_agent_token" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("agent_cameras")
    .select(`
      camera:cameras(
        id,
        name,
        description,
        status,
        analysis_plan_code,
        capture_interval_seconds,
        consolidation_interval_seconds,
        motion_start_threshold,
        motion_continue_threshold,
        event_close_after_seconds,
        monitoring_goals
      )
    `)
    .eq("agent_id", agent.id)
    .eq("enabled", true);

  if (error) {
    console.error("Falha ao carregar configuração do Agent:", error.message);
    return NextResponse.json({ ok: false, error: "configuration_unavailable" }, { status: 500 });
  }

  const cameras = (data ?? []).flatMap((row: any) => {
    const relation = row.camera;
    const camera = Array.isArray(relation) ? relation[0] : relation;
    if (!camera) return [];

    return [{
      id: String(camera.id),
      name: String(camera.name),
      description: String(camera.description ?? ""),
      status: String(camera.status),
      plan: String(camera.analysis_plan_code),
      captureIntervalSeconds: Number(camera.capture_interval_seconds),
      consolidationIntervalSeconds: Number(camera.consolidation_interval_seconds),
      motionStartThreshold: Number(camera.motion_start_threshold),
      motionContinueThreshold: Number(camera.motion_continue_threshold),
      eventCloseAfterSeconds: Number(camera.event_close_after_seconds),
      monitoringGoals: Array.isArray(camera.monitoring_goals) ? camera.monitoring_goals : [],
    }];
  });

  return NextResponse.json(
    {
      ok: true,
      agent: { id: agent.id, name: agent.name },
      cameras,
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
