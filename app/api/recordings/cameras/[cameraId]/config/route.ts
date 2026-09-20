import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRecordingCamera } from "@/src/lib/recording-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ cameraId: string }> };

function polygons(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];
    const points = polygon.flatMap((point) => {
      if (!point || typeof point !== "object" || Array.isArray(point)) {
        return [];
      }
      const item = point as Record<string, unknown>;
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

export async function GET(_request: Request, context: RouteContext) {
  const { cameraId } = await context.params;
  if (!z.string().uuid().safeParse(cameraId).success) {
    return NextResponse.json({ ok: false, error: "invalid_camera_id" }, { status: 400 });
  }

  const authorized = await authorizeRecordingCamera(cameraId);
  if ("error" in authorized) {
    return NextResponse.json(
      { ok: false, error: authorized.error },
      { status: authorized.status },
    );
  }

  if (!authorized.entitlement?.monitoring_allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: "recording_entitlement_required",
        reason: authorized.entitlement?.reason ?? "plan_not_selected",
      },
      { status: 403 },
    );
  }

  const { data: profile, error: profileError } = await authorized.supabase
    .from("camera_profiles")
    .select("id,version")
    .eq("organization_id", authorized.organization.id)
    .eq("camera_id", cameraId)
    .eq("is_active", true)
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json(
      { ok: false, error: "active_camera_profile_required" },
      { status: 409 },
    );
  }

  const { data: ignoreZones, error: ignoreError } = await authorized.supabase
    .from("camera_zones")
    .select("polygon")
    .eq("organization_id", authorized.organization.id)
    .eq("camera_profile_id", profile.id)
    .eq("zone_type", "ignore");

  if (ignoreError) {
    return NextResponse.json(
      { ok: false, error: "ignore_zones_unavailable" },
      { status: 500 },
    );
  }

  const camera = authorized.camera;
  const entitlement = authorized.entitlement;

  return NextResponse.json(
    {
      ok: true,
      config: {
        cameraId,
        cameraName: camera.name,
        siteName: camera.siteName,
        sourceKind: "local_recording",
        planCode: camera.analysisPlanCode,
        timezone: camera.timezone,
        captureIntervalSeconds: camera.captureIntervalSeconds,
        consolidationIntervalSeconds: camera.consolidationIntervalSeconds,
        motionStartThreshold: camera.motionStartThreshold,
        motionContinueThreshold: camera.motionContinueThreshold,
        eventCloseAfterSeconds: camera.eventCloseAfterSeconds,
        motionAdaptiveEnabled: camera.motionAdaptiveEnabled,
        motionOverlayMask: camera.motionOverlayMask,
        motionStartConsecutiveFrames: camera.motionStartConsecutiveFrames,
        motionEndConsecutiveFrames: camera.motionEndConsecutiveFrames,
        motionCooldownSeconds: camera.motionCooldownSeconds,
        monitoringSchedule: camera.monitoringSchedule,
        motionIgnorePolygons: (ignoreZones ?? []).flatMap((row: any) =>
          polygons([row.polygon]),
        ),
        maximumAnalysisFrames: Math.max(
          1,
          Math.min(4, Number(entitlement.maximum_analysis_frames ?? 3)),
        ),
        clipEnabled: Boolean(entitlement.clip_enabled),
        clipDurationSeconds:
          entitlement.clip_duration_seconds === null
            ? null
            : Number(entitlement.clip_duration_seconds),
        clipRetentionDays:
          entitlement.clip_retention_days === null
            ? null
            : Number(entitlement.clip_retention_days),
        entitlement: {
          accessSource: String(entitlement.access_source ?? "blocked"),
          monitoringAllowed: Boolean(entitlement.monitoring_allowed),
          periodStartsAt: entitlement.period_starts_at
            ? String(entitlement.period_starts_at)
            : null,
          periodEndsAt: entitlement.period_ends_at
            ? String(entitlement.period_ends_at)
            : null,
          reason: String(entitlement.reason ?? ""),
        },
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
