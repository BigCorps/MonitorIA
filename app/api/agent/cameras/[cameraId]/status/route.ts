import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CameraStatusSchema = z.object({
  status: z.enum(["online", "offline", "error"]),
  streamLabel: z.string().trim().max(160).optional(),
  errorCode: z.string().trim().max(120).optional(),
  errorMessage: z.string().trim().max(900).optional(),
  metadata: z.record(z.unknown()).optional(),
});

type RouteContext = {
  params: Promise<{ cameraId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { cameraId } = await context.params;
  if (!z.string().uuid().safeParse(cameraId).success) {
    return NextResponse.json({ ok: false, error: "invalid_camera_id" }, { status: 400 });
  }

  const authenticated = await authenticateAgentCamera(request, cameraId);
  if (!authenticated) {
    return NextResponse.json({ ok: false, error: "invalid_agent_camera" }, { status: 401 });
  }

  let body: z.infer<typeof CameraStatusSchema>;
  try {
    body = CameraStatusSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: body.status,
  };

  if (body.status === "online") {
    update.last_seen_at = now;
  }

  if (body.streamLabel) {
    update.stream_label = body.streamLabel;
  }

  const { error: updateError } = await authenticated.supabase
    .from("cameras")
    .update(update)
    .eq("id", cameraId)
    .eq("organization_id", authenticated.agent.organizationId);

  if (updateError) {
    console.error("Falha ao atualizar estado da câmera:", updateError.message);
    return NextResponse.json({ ok: false, error: "camera_status_update_failed" }, { status: 500 });
  }

  if (
    authenticated.camera.status !== body.status ||
    body.status === "error"
  ) {
    const { error: auditError } = await authenticated.supabase.from("audit_logs").insert({
      organization_id: authenticated.agent.organizationId,
      actor_user_id: null,
      action: `camera.${body.status}`,
      entity_type: "camera",
      entity_id: cameraId,
      metadata: {
        agent_id: authenticated.agent.id,
        previous_status: authenticated.camera.status,
        error_code: body.errorCode ?? null,
        error_message: body.errorMessage ?? null,
        ...(body.metadata ?? {}),
      },
    });

    if (auditError) {
      console.error("Falha ao registrar auditoria da câmera:", auditError.message);
    }
  }

  return NextResponse.json(
    {
      ok: true,
      cameraId,
      status: body.status,
      serverTime: now,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
