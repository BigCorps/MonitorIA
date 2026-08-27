import {
  NextResponse,
  type NextRequest,
} from "next/server";
import { z } from "zod";

import {
  authenticateAgentCamera,
} from "@/src/lib/agent-camera";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IsoDateSchema = z
  .string()
  .min(20)
  .max(50)
  .refine(
    (value) =>
      !Number.isNaN(
        new Date(value).getTime(),
      ),
  );

const EvidenceGapSchema = z
  .object({
    eventId: z.string().uuid(),
    cameraId: z.string().uuid(),
    cameraName: z
      .string()
      .trim()
      .min(1)
      .max(160),
    sessionId: z
      .string()
      .uuid()
      .nullable(),
    startedAt: IsoDateSchema,
    endedAt: IsoDateSchema,
    detector: z.enum([
      "regular_motion",
      "structural_motion",
    ]),
    reason: z.literal(
      "visual_evidence_unavailable",
    ),
    timePrecision: z.literal(
      "detector_log_interval",
    ),
    priority: z.enum([
      "critical",
      "important",
      "normal",
    ]),
    localMetrics: z
      .record(
        z.string(),
        z.unknown(),
      )
      .default({}),
  })
  .strict();

type RouteContext = {
  params: Promise<{
    cameraId: string;
  }>;
};

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const { cameraId } =
    await context.params;

  if (
    !z
      .string()
      .uuid()
      .safeParse(cameraId)
      .success
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_camera_id",
      },
      { status: 400 },
    );
  }

  const authenticated =
    await authenticateAgentCamera(
      request,
      cameraId,
    );

  if (!authenticated) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "invalid_agent_camera",
      },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
      },
      { status: 400 },
    );
  }

  const parsed =
    EvidenceGapSchema.safeParse(raw);

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "invalid_evidence_gap",
      },
      { status: 400 },
    );
  }

  const input = parsed.data;

  if (input.cameraId !== cameraId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "camera_id_mismatch",
      },
      { status: 409 },
    );
  }

  const startedAt =
    new Date(input.startedAt);
  const endedAt =
    new Date(input.endedAt);

  if (
    endedAt < startedAt ||
    endedAt.getTime() -
      startedAt.getTime() >
      15 * 60 * 1000
  ) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "invalid_gap_window",
      },
      { status: 400 },
    );
  }

  const supabase =
    authenticated.supabase;

  const { data: existing } =
    await supabase
      .from("camera_evidence_gaps")
      .select("id")
      .eq(
        "organization_id",
        authenticated.camera
          .organizationId,
      )
      .eq("camera_id", cameraId)
      .eq(
        "agent_event_id",
        input.eventId,
      )
      .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      gapId: String(existing.id),
    });
  }

  const { data: inserted, error } =
    await supabase
      .from("camera_evidence_gaps")
      .insert({
        organization_id:
          authenticated.camera
            .organizationId,
        site_id:
          authenticated.camera.siteId,
        camera_id: cameraId,
        agent_id:
          authenticated.agent.id,
        capture_session_id:
          input.sessionId,
        agent_event_id:
          input.eventId,
        started_at:
          startedAt.toISOString(),
        ended_at:
          endedAt.toISOString(),
        detector: input.detector,
        reason: input.reason,
        time_precision:
          input.timePrecision,
        priority: input.priority,
        local_metrics:
          input.localMetrics,
        status: "recorded",
      })
      .select("id")
      .single();

  if (error || !inserted) {
    // Corrida idempotente: se outro POST ganhou entre SELECT e INSERT,
    // devolvemos o registro existente.
    const { data: raced } =
      await supabase
        .from(
          "camera_evidence_gaps",
        )
        .select("id")
        .eq(
          "organization_id",
          authenticated.camera
            .organizationId,
        )
        .eq(
          "camera_id",
          cameraId,
        )
        .eq(
          "agent_event_id",
          input.eventId,
        )
        .maybeSingle();

    if (raced) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        gapId: String(raced.id),
      });
    }

    console.error(
      "Falha ao registrar evidence gap 1.0.3:",
      error?.message ??
        "gap_missing",
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "evidence_gap_persistence_failed",
      },
      { status: 503 },
    );
  }

  await supabase
    .from("audit_logs")
    .insert({
      organization_id:
        authenticated.camera
          .organizationId,
      actor_user_id: null,
      action:
        "camera.evidence_gap_recorded",
      entity_type: "camera",
      entity_id: cameraId,
      metadata: {
        gap_id: inserted.id,
        agent_id:
          authenticated.agent.id,
        agent_event_id:
          input.eventId,
        detector: input.detector,
        priority: input.priority,
        reason: input.reason,
        time_precision:
          input.timePrecision,
        started_at:
          startedAt.toISOString(),
        ended_at:
          endedAt.toISOString(),
      },
    })
    .then(() => undefined)
    .catch(() => undefined);

  return NextResponse.json(
    {
      ok: true,
      duplicate: false,
      gapId: String(inserted.id),
    },
    {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
