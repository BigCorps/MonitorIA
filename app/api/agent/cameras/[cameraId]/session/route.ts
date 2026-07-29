import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ cameraId: string }>;
};

const StartSchema = z
  .object({
    action: z.literal("start"),
    startedAt: z.string().max(50).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

const EndSchema = z
  .object({
    action: z.literal("end"),
    sessionId: z.string().uuid(),
    endedReason: z.string().trim().min(1).max(120).default("agent_stopped"),
  })
  .strict();

const BodySchema = z.discriminatedUnion("action", [StartSchema, EndSchema]);

function safeIso(value: string | undefined) {
  if (!value) return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { cameraId } = await context.params;

  if (!z.string().uuid().safeParse(cameraId).success) {
    return NextResponse.json(
      { ok: false, error: "invalid_camera_id" },
      { status: 400 },
    );
  }

  const authenticated = await authenticateAgentCamera(request, cameraId);
  if (!authenticated) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_camera" },
      { status: 401 },
    );
  }

  const declaredLength = Number(
    request.headers.get("content-length") ?? "0",
  );

  if (declaredLength > 32 * 1024) {
    return NextResponse.json(
      { ok: false, error: "session_payload_too_large" },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_session_payload" },
      { status: 400 },
    );
  }

  if (parsed.data.action === "start") {
    const now = new Date().toISOString();

    const { error: closeError } = await authenticated.supabase
      .from("capture_sessions")
      .update({
        ended_at: now,
        ended_reason: "agent_restarted",
      })
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("agent_id", authenticated.agent.id)
      .is("ended_at", null);

    if (closeError) {
      console.error(
        "Falha ao encerrar sessão anterior:",
        closeError.message,
      );
      return NextResponse.json(
        { ok: false, error: "previous_session_close_failed" },
        { status: 500 },
      );
    }

    const metadata = {
      ...(parsed.data.metadata ?? {}),
      source: "monitoria_agent",
    };

    const { data: session, error: sessionError } =
      await authenticated.supabase
        .from("capture_sessions")
        .insert({
          organization_id: authenticated.camera.organizationId,
          camera_id: cameraId,
          agent_id: authenticated.agent.id,
          started_at: safeIso(parsed.data.startedAt),
          metadata,
        })
        .select("id,started_at")
        .single();

    if (sessionError || !session) {
      console.error(
        "Falha ao iniciar sessão de captura:",
        sessionError?.message,
      );
      return NextResponse.json(
        { ok: false, error: "capture_session_start_failed" },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        action: "started",
        sessionId: String(session.id),
        startedAt: String(session.started_at),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { data: session, error: sessionError } =
    await authenticated.supabase
      .from("capture_sessions")
      .update({
        ended_at: new Date().toISOString(),
        ended_reason: parsed.data.endedReason,
      })
      .eq("id", parsed.data.sessionId)
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("agent_id", authenticated.agent.id)
      .select("id,frames_observed,events_created")
      .maybeSingle();

  if (sessionError) {
    console.error(
      "Falha ao encerrar sessão de captura:",
      sessionError.message,
    );
    return NextResponse.json(
      { ok: false, error: "capture_session_end_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      action: "ended",
      sessionId: parsed.data.sessionId,
      framesObserved: Number(session?.frames_observed ?? 0),
      eventsCreated: Number(session?.events_created ?? 0),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
