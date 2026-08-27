import {
  NextResponse,
  type NextRequest,
} from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function timeValue(value: unknown) {
  const text = String(value ?? "");
  return /^\d{2}:\d{2}$/.test(text)
    ? text
    : null;
}

function polygonValue(value: unknown) {
  if (!Array.isArray(value)) return null;

  const points = value.flatMap((point) => {
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

  return points.length >= 3
    ? points
    : null;
}

export async function GET(
  request: NextRequest,
) {
  const agent =
    await authenticateAgent(request);

  if (!agent) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_agent_token",
      },
      { status: 401 },
    );
  }

  const supabase =
    createAdminClient();

  const { data, error } = await supabase
    .from("agent_cameras")
    .select(`
      camera:cameras(
        id,
        operational_access_enabled,
        monitoring_schedule,
        site:sites(timezone)
      )
    `)
    .eq("agent_id", agent.id)
    .eq("enabled", true);

  if (error) {
    console.error(
      "Falha ao carregar configuração operacional 1.0.3:",
      error.message,
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          "operational_configuration_unavailable",
      },
      { status: 500 },
    );
  }

  const cameras = (data ?? [])
    .flatMap((row: any) => {
      const relation = row.camera;
      const camera = Array.isArray(relation)
        ? relation[0]
        : relation;
      return camera ? [camera] : [];
    });

  const enabledCameraIds = cameras
    .filter(
      (camera: any) =>
        camera.operational_access_enabled ===
        true,
    )
    .map((camera: any) =>
      String(camera.id),
    );

  const { data: markers, error: markerError } =
    enabledCameraIds.length
      ? await supabase
          .from(
            "camera_visual_entities",
          )
          .select(
            "camera_id,name,polygon,min_confidence,updated_at",
          )
          .in(
            "camera_id",
            enabledCameraIds,
          )
          .eq("enabled", true)
          .eq(
            "primary_operational_marker",
            true,
          )
          .eq(
            "entity_type",
            "access_barrier",
          )
          .order("updated_at", {
            ascending: false,
          })
      : { data: [], error: null };

  if (markerError) {
    console.error(
      "Falha ao carregar marcador operacional 1.0.3:",
      markerError.message,
    );
  }

  const markerByCamera =
    new Map<string, any>();

  for (const marker of markers ?? []) {
    const cameraId = String(
      (marker as any).camera_id,
    );
    if (!markerByCamera.has(cameraId)) {
      markerByCamera.set(
        cameraId,
        marker,
      );
    }
  }

  const responseCameras =
    cameras.map((camera: any) => {
      const schedule =
        objectValue(
          camera.monitoring_schedule,
        );
      const access =
        objectValue(
          schedule.operationalAccess,
        );
      const siteRelation =
        camera.site;
      const site = Array.isArray(
        siteRelation,
      )
        ? siteRelation[0]
        : siteRelation;

      const enabled =
        camera
          .operational_access_enabled ===
        true;

      const marker =
        enabled
          ? markerByCamera.get(
              String(camera.id),
            ) ?? null
          : null;

      return {
        cameraId: String(camera.id),
        operationalAccess: {
          enabled,
          openingTime: enabled
            ? timeValue(
                access.openingTime,
              )
            : null,
          closingTime: enabled
            ? timeValue(
                access.closingTime,
              )
            : null,
          timezone: String(
            site?.timezone ??
              "America/Sao_Paulo",
          ),
          polygon: enabled
            ? polygonValue(
                marker?.polygon,
              )
            : null,
          markerName:
            enabled && marker
              ? String(
                  marker.name ?? "",
                ) || null
              : null,
          markerMinConfidence:
            enabled && marker
              ? Number(
                  marker.min_confidence ??
                    0.78,
                )
              : null,
        },
      };
    });

  return NextResponse.json(
    {
      ok: true,
      configVersion: 1,
      cameras: responseCameras,
      serverTime:
        new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control":
          "private, no-store",
      },
    },
  );
}
