import { NextResponse } from "next/server";
import { z } from "zod";
import {
  approveCameraProfileAction,
} from "@/app/dashboard/cameras/profile-actions";
import { initialCameraProfileActionState } from "@/app/dashboard/cameras/profile-action-state";
import { authorizeRecordingCamera } from "@/src/lib/recording-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ cameraId: string }> };

const BodySchema = z.object({
  profileId: z.string().uuid(),
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
      { ok: false, error: "invalid_profile_activation" },
      { status: 400 },
    );
  }

  const form = new FormData();
  form.set("camera_id", cameraId);
  form.set("profile_id", body.profileId);

  const state = await approveCameraProfileAction(
    initialCameraProfileActionState,
    form,
  );

  if (state.status !== "success") {
    return NextResponse.json(
      { ok: false, error: state.message || "profile_activation_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, profileId: body.profileId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
