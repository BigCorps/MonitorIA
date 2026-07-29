import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function scheduleValue(value: unknown) {
  const object = objectValue(value);

  if (object.mode !== "weekly") {
    return { mode: "always" as const };
  }

  const weekly = Array.isArray(object.weekly)
    ? object.weekly.flatMap((entry) => {
        const item = objectValue(entry);
        const day = Number(item.day);
        const start = String(item.start ?? "");
        const end = String(item.end ?? "");

        if (
          !Number.isInteger(day) ||
          day < 0 ||
          day > 6 ||
          !/^\d{2}:\d{2}$/.test(start) ||
          !/^\d{2}:\d{2}$/.test(end)
        ) {
          return [];
        }

        return [{ day, start, end }];
      })
    : [];

  return {
    mode: "weekly" as const,
    weekly,
    outsideMode:
      object.outsideMode === "significant_only"
        ? ("significant_only" as const)
        : ("off" as const),
  };
}

function polygonsValue(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];

    const points = polygon.flatMap((point) => {
      const item = objectValue(point);
      const x = Number(item.x);
      const y = Number(item.y);

      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        x > 1 ||
        y < 0 ||
        y > 1
      ) {
        return [];
      }

      return [{ x, y }];
    });

    return points.length >= 3 ? [points] : [];
  });
}

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
        motion_adaptive_enabled,
        motion_overlay_mask,
        motion_start_consecutive_frames,
        motion_end_consecutive_frames,
        motion_cooldown_seconds,
        monitoring_schedule,
        monitoring_goals,
        site:sites(timezone)
      )
    `)
    .eq("agent_id", agent.id)
    .eq("enabled", true);

  if (error) {
    console.error(
      "Falha ao carregar configuração do Agent:",
      error.message,
    );
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

  const profileIds = [...profilesByCamera.values()].map(
    (profile) => profile.id,
  );

  const { data: ignoreZones, error: ignoreError } = profileIds.length
    ? await supabase
        .from("camera_zones")
        .select("camera_profile_id,polygon")
        .in("camera_profile_id", profileIds)
        .eq("zone_type", "ignore")
    : { data: [], error: null };

  if (ignoreError) {
    console.error(
      "Falha ao carregar zonas ignoradas:",
      ignoreError.message,
    );
  }

  const ignoreByProfile = new Map<string, unknown[]>();

  for (const row of ignoreZones ?? []) {
    const profileId = String((row as any).camera_profile_id);
    const list = ignoreByProfile.get(profileId) ?? [];
    list.push((row as any).polygon);
    ignoreByProfile.set(profileId, list);
  }

  const cameras = cameraRows.map((camera: any) => {
    const activeProfile =
      profilesByCamera.get(String(camera.id)) ?? null;
    const siteRelation = camera.site;
    const site = Array.isArray(siteRelation)
      ? siteRelation[0]
      : siteRelation;

    const overlay =
      camera.motion_overlay_mask === "none" ||
      camera.motion_overlay_mask === "top-left" ||
      camera.motion_overlay_mask === "top-right" ||
      camera.motion_overlay_mask === "bottom-left" ||
      camera.motion_overlay_mask === "bottom-right"
        ? camera.motion_overlay_mask
        : "auto";

    return {
      id: String(camera.id),
      name: String(camera.name),
      description: String(camera.description ?? ""),
      status: String(camera.status),
      plan:
        camera.analysis_plan_code === "basic" ||
        camera.analysis_plan_code === "intensive"
          ? camera.analysis_plan_code
          : "standard",
      timezone: String(site?.timezone ?? "America/Sao_Paulo"),
      captureIntervalSeconds: Number(
        camera.capture_interval_seconds,
      ),
      consolidationIntervalSeconds: Number(
        camera.consolidation_interval_seconds,
      ),
      motionStartThreshold: Number(
        camera.motion_start_threshold,
      ),
      motionContinueThreshold: Number(
        camera.motion_continue_threshold,
      ),
      eventCloseAfterSeconds: Number(
        camera.event_close_after_seconds,
      ),
      motionAdaptiveEnabled:
        camera.motion_adaptive_enabled !== false,
      motionOverlayMask: overlay,
      motionStartConsecutiveFrames: Number(
        camera.motion_start_consecutive_frames ?? 3,
      ),
      motionEndConsecutiveFrames: Number(
        camera.motion_end_consecutive_frames ?? 6,
      ),
      motionCooldownSeconds: Number(
        camera.motion_cooldown_seconds ?? 10,
      ),
      monitoringSchedule: scheduleValue(
        camera.monitoring_schedule,
      ),
      motionIgnorePolygons: activeProfile
        ? polygonsValue(
            ignoreByProfile.get(activeProfile.id) ?? [],
          )
        : [],
      monitoringGoals: Array.isArray(camera.monitoring_goals)
        ? camera.monitoring_goals.map((goal: unknown) =>
            String(goal),
          )
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
