import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { MONITORIA_CLIP_MAX_BYTES } from "@/src/clips/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

const CompletionSchema = z
  .object({
    status: z.enum(["ready", "failed"]),
    assetId: z.string().uuid(),
    byteSize: z
      .number()
      .int()
      .min(0)
      .max(MONITORIA_CLIP_MAX_BYTES),
    contentSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    durationSeconds: z.number().min(0).max(310).nullable(),
    generationMs: z.number().int().min(0).max(10 * 60 * 1000),

    // Compatibilidade com o Agent 0.10.0.
    //
    // A primeira build da Fase 8 já calcula cpuTimeMs no buffer local,
    // porém não o incluiu no payload de conclusão. Tornar o campo opcional
    // evita rejeitar o clipe inteiro por causa de uma métrica de diagnóstico.
    // Agents posteriores podem continuar enviando o valor normalmente.
    cpuTimeMs: z
      .number()
      .int()
      .min(0)
      .max(10 * 60 * 1000)
      .optional()
      .default(0),

    segmentsUsed: z.number().int().min(0).max(160),
    errorCode: z.string().trim().max(100).nullable(),
    errorMessage: z.string().trim().max(1000).nullable(),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: RouteContext,
) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_token" },
      { status: 401 },
    );
  }

  const { requestId } = await context.params;
  if (!z.string().uuid().safeParse(requestId).success) {
    return NextResponse.json(
      { ok: false, error: "invalid_clip_request_id" },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = CompletionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_clip_completion" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { data: clipRequest, error: requestError } =
    await supabase
      .from("clip_generation_requests")
      .select(
        "id,organization_id,camera_id,event_id,storage_asset_id,status,metadata",
      )
      .eq("id", requestId)
      .eq("organization_id", agent.organizationId)
      .eq("agent_id", agent.id)
      .maybeSingle();

  if (requestError || !clipRequest) {
    return NextResponse.json(
      { ok: false, error: "clip_request_not_found" },
      { status: 404 },
    );
  }

  if (
    String(clipRequest.storage_asset_id) !== parsed.data.assetId
  ) {
    return NextResponse.json(
      { ok: false, error: "clip_asset_mismatch" },
      { status: 409 },
    );
  }

  if (
    clipRequest.status === "ready" &&
    parsed.data.status === "ready"
  ) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      requestId,
      assetId: parsed.data.assetId,
    });
  }

  const metadata = {
    ...(clipRequest.metadata &&
    typeof clipRequest.metadata === "object" &&
    !Array.isArray(clipRequest.metadata)
      ? clipRequest.metadata
      : {}),
    generationMs: parsed.data.generationMs,
    cpuTimeMs: parsed.data.cpuTimeMs,
    segmentsUsed: parsed.data.segmentsUsed,
    reportedDurationSeconds: parsed.data.durationSeconds,
    completedAt: new Date().toISOString(),
  };

  if (parsed.data.status === "ready") {
    const { error: assetError } = await supabase
      .from("storage_assets")
      .update({
        status: "ready",
        byte_size: parsed.data.byteSize,
        content_sha256: parsed.data.contentSha256,
        mime_type: "video/mp4",
        deleted_at: null,
      })
      .eq("id", parsed.data.assetId)
      .eq("organization_id", agent.organizationId)
      .eq("event_id", clipRequest.event_id);

    if (assetError) {
      return NextResponse.json(
        { ok: false, error: "clip_asset_update_failed" },
        { status: 500 },
      );
    }

    await supabase
      .from("clip_generation_requests")
      .update({
        status: "ready",
        completed_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    await supabase.from("audit_logs").insert({
      organization_id: agent.organizationId,
      actor_user_id: null,
      action: "camera.clip_ready",
      entity_type: "event",
      entity_id: String(clipRequest.event_id),
      metadata: {
        camera_id: clipRequest.camera_id,
        agent_id: agent.id,
        clip_request_id: requestId,
        storage_asset_id: parsed.data.assetId,
        byte_size: parsed.data.byteSize,
        content_sha256: parsed.data.contentSha256,
        generation_ms: parsed.data.generationMs,
        cpu_time_ms: parsed.data.cpuTimeMs,
        segments_used: parsed.data.segmentsUsed,
      },
    });

    return NextResponse.json({
      ok: true,
      duplicate: false,
      requestId,
      assetId: parsed.data.assetId,
    });
  }

  await Promise.all([
    supabase
      .from("storage_assets")
      .update({
        status: "failed",
      })
      .eq("id", parsed.data.assetId)
      .eq("organization_id", agent.organizationId),
    supabase
      .from("clip_generation_requests")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code:
          parsed.data.errorCode ?? "clip_generation_failed",
        error_message:
          parsed.data.errorMessage ??
          "O Agent não conseguiu gerar o clipe.",
        metadata,
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId),
  ]);

  return NextResponse.json({
    ok: true,
    failed: true,
    requestId,
    assetId: parsed.data.assetId,
  });
}
