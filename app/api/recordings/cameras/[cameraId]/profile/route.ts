import { NextResponse } from "next/server";
import { z } from "zod";
import {
  analyzeCameraProfileAction,
} from "@/app/dashboard/cameras/profile-actions";
import { initialCameraProfileActionState } from "@/app/dashboard/cameras/profile-action-state";
import { authorizeRecordingCamera } from "@/src/lib/recording-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ cameraId: string }> };

const BodySchema = z.object({
  sourceAssetId: z.string().uuid(),
  userGuidance: z.string().trim().max(2000).optional().default(""),
}).strict();

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

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_profile_request" },
      { status: 400 },
    );
  }

  const form = new FormData();
  form.set("camera_id", cameraId);
  form.set("source_asset_id", body.sourceAssetId);
  form.set(
    "user_guidance",
    body.userGuidance ||
      "Fonte de gravação local. Analise como uma câmera fixa do MonitorIA.",
  );

  const state = await analyzeCameraProfileAction(
    initialCameraProfileActionState,
    form,
  );

  if (state.status !== "success" || !state.profileId) {
    return NextResponse.json(
      { ok: false, error: state.message || "profile_analysis_failed" },
      { status: 500 },
    );
  }

  const [{ data: profile }, { data: zones }] = await Promise.all([
    authorized.supabase
      .from("camera_profiles")
      .select(
        "id,version,environment_description,monitoring_goals,ignore_instructions,profile_metadata,is_active",
      )
      .eq("id", state.profileId)
      .eq("camera_id", cameraId)
      .eq("organization_id", authorized.organization.id)
      .maybeSingle(),
    authorized.supabase
      .from("camera_zones")
      .select("id,name,zone_type,person_role_hint,description,polygon,sort_order")
      .eq("camera_profile_id", state.profileId)
      .eq("organization_id", authorized.organization.id)
      .order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json(
    {
      ok: true,
      profile: profile
        ? {
            id: String(profile.id),
            version: Number(profile.version),
            environmentDescription: String(profile.environment_description),
            monitoringGoals: Array.isArray(profile.monitoring_goals)
              ? profile.monitoring_goals.map(String)
              : [],
            ignoreInstructions: Array.isArray(profile.ignore_instructions)
              ? profile.ignore_instructions.map(String)
              : [],
            metadata:
              profile.profile_metadata &&
              typeof profile.profile_metadata === "object"
                ? profile.profile_metadata
                : {},
            zones: (zones ?? []).map((zone: any) => ({
              id: String(zone.id),
              name: String(zone.name),
              type: String(zone.zone_type),
              personRoleHint: String(zone.person_role_hint ?? "none"),
              description: String(zone.description ?? ""),
              polygon: zone.polygon,
            })),
          }
        : { id: state.profileId },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
