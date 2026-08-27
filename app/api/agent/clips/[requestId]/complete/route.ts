import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { MONITORIA_CLIP_MAX_BYTES } from "@/src/clips/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function retryDelayMs(attemptCount: unknown) {
  const attempt = Math.max(1, Number(attemptCount ?? 1));
  return Math.min(
    60 * 60_000,
    60_000 * 2 ** Math.min(6, attempt - 1),
  );
}

function atLeast103(version: unknown) {
  const match = String(version ?? "").match(
    /^(\d+)\.(\d+)\.(\d+)/,
  );
  if (!match) return false;

  const [major, minor, patch] = match
    .slice(1)
    .map(Number);

  return (
    major! > 1 ||
    (major === 1 &&
      (minor! > 0 ||
        (minor === 0 && patch! >= 3)))
  );
}

function durationIntegrity(
  requestedDurationSeconds: number,
  reportedDurationSeconds: number | null,
) {
  const requested = Math.max(
    0,
    Number(requestedDurationSeconds) || 0,
  );
  const reported =
    reportedDurationSeconds === null
      ? null
      : Math.max(
          0,
          Number(reportedDurationSeconds) || 0,
        );

  const toleranceSeconds = Math.max(
    1.5,
    Math.min(4, requested * 0.06),
  );
  const coverageRatio =
    reported !== null && requested > 0
      ? Math.min(1, reported / requested)
      : null;

  return {
    requested,
    reported,
    toleranceSeconds,
    coverageRatio,
    accepted:
      reported !== null &&
      requested > 0 &&
      reported > 0 &&
      reported + toleranceSeconds >= requested &&
      (coverageRatio ?? 0) >= 0.94,
  };
}

type RouteContext = {
  params: Promise<{ requestId: string }>;
};

const CompletionSchema = z
  .object({
    status: z.enum(["ready", "failed"]),
    assetId: z.string().uuid(),
    claimToken: z
      .string()
      .uuid()
      .optional()
      .nullable(),
    byteSize: z
      .number()
      .int()
      .min(0)
      .max(MONITORIA_CLIP_MAX_BYTES),
    contentSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    durationSeconds: z
      .number()
      .min(0)
      .max(310)
      .nullable(),
    generationMs: z
      .number()
      .int()
      .min(0)
      .max(30 * 60 * 1000),
    cpuTimeMs: z
      .number()
      .int()
      .min(0)
      .max(30 * 60 * 1000)
      .optional()
      .default(0),
    segmentsUsed: z
      .number()
      .int()
      .min(0)
      .max(10000),
    transcoded: z
      .boolean()
      .optional()
      .default(false),
    sourceBitrateKbps: z
      .number()
      .min(0)
      .max(100000)
      .nullable()
      .optional(),
    outputBitrateKbps: z
      .number()
      .min(0)
      .max(100000)
      .nullable()
      .optional(),
    segmentIds: z
      .array(z.string().trim().min(1).max(220))
      .max(256)
      .optional()
      .default([]),
    errorCode: z
      .string()
      .trim()
      .max(100)
      .nullable(),
    errorMessage: z
      .string()
      .trim()
      .max(1000)
      .nullable(),
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
  if (
    !z.string().uuid().safeParse(requestId).success
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_clip_request_id",
      },
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
      {
        ok: false,
        error: "invalid_clip_completion",
      },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const [
    { data: clipRequest, error },
    { data: agentRow },
  ] = await Promise.all([
    supabase
      .from("clip_generation_requests")
      .select(
        "id,organization_id,camera_id,event_id,storage_asset_id,status,metadata,claim_token,claim_expires_at,attempt_count,duration_seconds,bucket,storage_path",
      )
      .eq("id", requestId)
      .eq(
        "organization_id",
        agent.organizationId,
      )
      .eq("agent_id", agent.id)
      .maybeSingle(),
    supabase
      .from("agents")
      .select("version")
      .eq("id", agent.id)
      .maybeSingle(),
  ]);

  if (error || !clipRequest) {
    return NextResponse.json(
      {
        ok: false,
        error: "clip_request_not_found",
      },
      { status: 404 },
    );
  }

  if (
    String(clipRequest.storage_asset_id) !==
    parsed.data.assetId
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "clip_asset_mismatch",
      },
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

  if (clipRequest.claim_token) {
    if (
      !parsed.data.claimToken ||
      String(clipRequest.claim_token) !==
        parsed.data.claimToken
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "clip_claim_mismatch",
        },
        { status: 409 },
      );
    }
  } else if (parsed.data.claimToken) {
    return NextResponse.json(
      {
        ok: false,
        error: "clip_claim_mismatch",
      },
      { status: 409 },
    );
  }

  const integrity = durationIntegrity(
    Number(clipRequest.duration_seconds),
    parsed.data.durationSeconds,
  );
  const requiresIntegrity =
    atLeast103(agentRow?.version);

  const metadata = {
    ...(clipRequest.metadata &&
    typeof clipRequest.metadata === "object" &&
    !Array.isArray(clipRequest.metadata)
      ? clipRequest.metadata
      : {}),
    generationMs: parsed.data.generationMs,
    cpuTimeMs: parsed.data.cpuTimeMs,
    segmentsUsed: parsed.data.segmentsUsed,
    requestedDurationSeconds:
      integrity.requested,
    reportedDurationSeconds:
      parsed.data.durationSeconds,
    clipCoverageRatio:
      integrity.coverageRatio,
    clipIntegrityToleranceSeconds:
      integrity.toleranceSeconds,
    clipIntegrityStatus:
      parsed.data.status === "ready"
        ? integrity.accepted
          ? requiresIntegrity
            ? "verified_v103"
            : "legacy_report_accepted"
          : "incomplete"
        : "generation_failed",
    transcoded: parsed.data.transcoded,
    sourceBitrateKbps:
      parsed.data.sourceBitrateKbps ?? null,
    outputBitrateKbps:
      parsed.data.outputBitrateKbps ?? null,
    sourceSegmentIds:
      parsed.data.segmentIds,
    completedAt: new Date().toISOString(),
  };

  // Defesa em profundidade:
  // - 1.0.3 é obrigado a reportar duração real medida por ffprobe.
  // - qualquer Agent que reporte explicitamente uma duração curta também é
  //   rejeitado, mesmo sendo legado.
  const clearDurationMismatch =
    parsed.data.durationSeconds !== null &&
    !integrity.accepted;
  const integrityRejected =
    parsed.data.status === "ready" &&
    (clearDurationMismatch ||
      (requiresIntegrity &&
        !integrity.accepted));

  if (integrityRejected) {
    await supabase.storage
      .from(String(clipRequest.bucket))
      .remove([String(clipRequest.storage_path)])
      .catch(() => undefined);

    await Promise.all([
      supabase
        .from("storage_assets")
        .update({ status: "failed" })
        .eq("id", parsed.data.assetId)
        .eq(
          "organization_id",
          agent.organizationId,
        ),
      supabase
        .from("clip_generation_requests")
        .update({
          status: "pending",
          claim_token: null,
          claim_expires_at: null,
          error_code:
            "clip_incomplete_coverage",
          error_message:
            `Vídeo incompleto: solicitado ${integrity.requested.toFixed(
              1,
            )}s, recebido ${
              integrity.reported === null
                ? "sem duração"
                : `${integrity.reported.toFixed(
                    1,
                  )}s`
            }.`,
          next_attempt_at: new Date(
            Date.now() +
              retryDelayMs(
                clipRequest.attempt_count,
              ),
          ).toISOString(),
          metadata,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", requestId),
    ]);

    return NextResponse.json({
      ok: true,
      retryScheduled: true,
      integrityRejected: true,
      error: "clip_incomplete_coverage",
      requestId,
      assetId: parsed.data.assetId,
    });
  }

  if (parsed.data.status === "ready") {
    const { error: assetError } =
      await supabase
        .from("storage_assets")
        .update({
          status: "ready",
          byte_size: parsed.data.byteSize,
          content_sha256:
            parsed.data.contentSha256,
          mime_type: "video/mp4",
          deleted_at: null,
        })
        .eq("id", parsed.data.assetId)
        .eq(
          "organization_id",
          agent.organizationId,
        )
        .eq(
          "event_id",
          clipRequest.event_id,
        );

    if (assetError) {
      return NextResponse.json(
        {
          ok: false,
          error: "clip_asset_update_failed",
        },
        { status: 500 },
      );
    }

    await supabase
      .from("clip_generation_requests")
      .update({
        status: "ready",
        completed_at:
          new Date().toISOString(),
        claim_token: null,
        claim_expires_at: null,
        error_code: null,
        error_message: null,
        next_attempt_at: null,
        metadata,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", requestId);

    await supabase
      .from("audit_logs")
      .insert({
        organization_id:
          agent.organizationId,
        actor_user_id: null,
        action: "camera.clip_ready",
        entity_type: "event",
        entity_id: String(
          clipRequest.event_id,
        ),
        metadata: {
          camera_id:
            clipRequest.camera_id,
          agent_id: agent.id,
          clip_request_id: requestId,
          storage_asset_id:
            parsed.data.assetId,
          byte_size:
            parsed.data.byteSize,
          content_sha256:
            parsed.data.contentSha256,
          generation_ms:
            parsed.data.generationMs,
          transcoded:
            parsed.data.transcoded,
          requested_duration_seconds:
            integrity.requested,
          actual_duration_seconds:
            parsed.data.durationSeconds,
          coverage_ratio:
            integrity.coverageRatio,
          integrity_status:
            metadata.clipIntegrityStatus,
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
      .update({ status: "failed" })
      .eq("id", parsed.data.assetId)
      .eq(
        "organization_id",
        agent.organizationId,
      ),
    supabase
      .from("clip_generation_requests")
      .update({
        status: "pending",
        claim_token: null,
        claim_expires_at: null,
        error_code:
          parsed.data.errorCode ??
          "clip_generation_failed",
        error_message:
          parsed.data.errorMessage ??
          "O Agent não conseguiu gerar o clipe.",
        next_attempt_at: new Date(
          Date.now() +
            retryDelayMs(
              clipRequest.attempt_count,
            ),
        ).toISOString(),
        metadata,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", requestId),
  ]);

  return NextResponse.json({
    ok: true,
    retryScheduled: true,
    requestId,
    assetId: parsed.data.assetId,
  });
}
