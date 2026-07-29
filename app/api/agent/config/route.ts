import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_token" },
      { status: 401 },
    );
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
    return NextResponse.json(
      { ok: false, error: "configuration_unavailable" },
      { status: 500 },
    );
  }

  const cameraRows = (data ?? []).flatMap((row: any) => {
    const relation = row.camera;
    const camera = Array.isArray(relation) ? relation[0] : relation;
    return camera ? [camera] : [];
  });

  const cameraIds = cameraRows.map((camera: any) => String(camera.id));

  const { data: profiles, error: profilesError } = cameraIds.length
    ? await supabase
        .from("camera_profiles")
        .select("id,camera_id,version")
        .in("camera_id", cameraIds)
        .eq("is_active", true)
    : { data: [], error: null };

  if (profilesError) {
    console.error(
      "Falha ao carregar perfis ativos do Agent:",
      profilesError.message,
    );
    return NextResponse.json(
      { ok: false, error: "active_profiles_unavailable" },
      { status: 500 },
    );
  }

  const profilesByCamera = new Map<
    string,
    { id: string; version: number }
  >();

  for (const profile of profiles ?? []) {
    profilesByCamera.set(String((profile as any).camera_id), {
      id: String((profile as any).id),
      version: Number((profile as any).version),
    });
  }

  const cameras = cameraRows.map((camera: any) => {
    const activeProfile = profilesByCamera.get(String(camera.id)) ?? null;

    return {
      id: String(camera.id),
      name: String(camera.name),
      description: String(camera.description ?? ""),
      status: String(camera.status),
      plan: String(camera.analysis_plan_code),
      captureIntervalSeconds: Number(camera.capture_interval_seconds),
      consolidationIntervalSeconds: Number(
        camera.consolidation_interval_seconds,
      ),
      motionStartThreshold: Number(camera.motion_start_threshold),
      motionContinueThreshold: Number(camera.motion_continue_threshold),
      eventCloseAfterSeconds: Number(camera.event_close_after_seconds),
      monitoringGoals: Array.isArray(camera.monitoring_goals)
        ? camera.monitoring_goals.map((goal: unknown) => String(goal))
        : [],
      monitoringEnabled: Boolean(activeProfile),
      activeProfileId: activeProfile?.id ?? null,
      activeProfileVersion: activeProfile?.version ?? null,
    };
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
