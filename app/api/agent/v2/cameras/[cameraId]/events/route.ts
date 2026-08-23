import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";
import { normalizeAnalysisPlan } from "@/src/lib/analysis-plans";
import { getVisionPlan } from "@/src/vision/plans";
import {
  applyEffectivePlanToFrozenContext,
  buildFrozenEventAnalysisContext,
} from "@/src/lib/event-ingestion-context";
import { sanitizePostgresText } from "@/src/lib/postgres-safe-json";
import { processMonitoriaEventCore } from "@/src/lib/event-processor-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REQUEST_BYTES = 4_400_000;
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_FRAME_BYTES = 3 * 1024 * 1024;

const IsoDateSchema = z.string().min(20).max(50).refine(
  (value: string) => !Number.isNaN(new Date(value).getTime()),
);

const TimelineSchema = z.object({
  segmentId: z.string().trim().max(180).optional(),
  segmentStartedAt: IsoDateSchema.optional(),
  offsetMs: z.number().int().min(0).max(30 * 60 * 1000).optional(),
  sourceTimestamp: IsoDateSchema.optional(),
  source: z.literal("rtsp_timeline").optional(),
}).passthrough();

const FrameSchema = z.object({
  label: z.enum(["start", "peak", "end", "extra"]),
  capturedAt: IsoDateSchema,
  imageBase64: z.string().min(1000).max(2_900_000),
  width: z.number().int().positive().max(7680).nullable(),
  height: z.number().int().positive().max(4320).nullable(),
  byteSize: z.number().int().positive().max(MAX_FRAME_BYTES),
  timeline: TimelineSchema.optional(),
}).strict();

const LocalMetricsSchema = z.object({
  planCode: z.enum(["basic", "standard", "intensive"]).optional(),
  peakMotionPercent: z.number().min(0).max(100),
  meanMotionPercent: z.number().min(0).max(100),
  durationSeconds: z.number().min(0).max(900),
  framesObserved: z.number().int().min(1).max(1000000),
  closeReason: z.string().trim().min(1).max(80),
}).passthrough();

const EventSubmissionSchema = z.object({
  eventId: z.string().uuid(),
  sessionId: z.string().uuid().nullable(),
  startedAt: IsoDateSchema,
  endedAt: IsoDateSchema,
  localMetrics: LocalMetricsSchema,
  frames: z.array(FrameSchema).min(1).max(4),
}).strict();

type RouteContext = { params: Promise<{ cameraId: string }> };

function isJpeg(buffer: Buffer) {
  return buffer.length >= 4 &&
    buffer[0] === 0xff && buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9;
}

function decodeBase64(value: string) {
  const normalized = value.trim();
  const buffer = Buffer.from(normalized, "base64");
  if (
    normalized.replace(/=+$/, "") !==
    buffer.toString("base64").replace(/=+$/, "")
  ) {
    throw new Error("invalid_base64");
  }
  return buffer;
}


async function existingResponse(supabase: any, job: any) {
  if (job.status === "completed") {
    const { data: event } = await supabase
      .from("events")
      .select("id,summary,primary_event_type,confidence,requires_review")
      .eq("analysis_job_id", job.id)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      duplicate: true,
      pending: false,
      analysisJobId: String(job.id),
      relevant: Boolean(event),
      eventId: event ? String(event.id) : null,
      summary: event ? String(event.summary) : null,
      type: event ? String(event.primary_event_type) : "no_relevant_change",
      confidence: event ? Number(event.confidence) : null,
      requiresReview: event ? Boolean(event.requires_review) : false,
      clipRequest: null,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  // Só existe ACK durável quando todas as evidências já chegaram ao Storage.
  // Isso fecha a janela em que um job podia existir, falhar no terceiro frame
  // e uma repetição receber 202 para um pacote incompleto.
  const { data: ingestion } = await supabase
    .from("event_ingestions")
    .select("id,status,expected_frame_count,evidence_ready_at")
    .eq("analysis_job_id", job.id)
    .maybeSingle();

  if (!ingestion?.evidence_ready_at || ingestion.status === "receiving") {
    return NextResponse.json({
      ok: false,
      error: "event_ingestion_not_durable_yet",
      analysisJobId: String(job.id),
    }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });
  }

  const { count } = await supabase
    .from("event_ingestion_frames")
    .select("frame_label", { count: "exact", head: true })
    .eq("ingestion_id", ingestion.id);

  if ((count ?? 0) < Number(ingestion.expected_frame_count ?? 1)) {
    return NextResponse.json({
      ok: false,
      error: "event_ingestion_evidence_incomplete",
      analysisJobId: String(job.id),
    }, { status: 503, headers: { "Retry-After": "5", "Cache-Control": "no-store" } });
  }

  return NextResponse.json({
    ok: true,
    duplicate: true,
    pending: true,
    analysisJobId: String(job.id),
    ingestionId: String(ingestion.id),
    relevant: null,
    eventId: null,
    summary: null,
    type: null,
    confidence: null,
    requiresReview: false,
    clipRequest: null,
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
}

async function rollbackIncompleteIngestion(
  supabase: any,
  input: { analysisJobId: string; ingestionId: string; storagePaths: string[] },
) {
  // Não há ACK neste ponto, portanto o comportamento correto é voltar ao
  // estado anterior e deixar o Agent repetir o mesmo eventId. A limpeza é
  // best-effort e idempotente; a próxima tentativa usa upsert nos objetos.
  if (input.storagePaths.length) {
    await supabase.storage.from("event-keyframes").remove(input.storagePaths).catch(() => undefined);
  }
  await supabase.from("storage_assets").delete().eq("analysis_job_id", input.analysisJobId);
  await supabase.from("event_ingestions").delete().eq("id", input.ingestionId);
  await supabase.from("analysis_jobs").delete().eq("id", input.analysisJobId).eq("status", "queued");
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { cameraId } = await context.params;
  if (!z.string().uuid().safeParse(cameraId).success) {
    return NextResponse.json({ ok: false, error: "invalid_camera_id" }, { status: 400 });
  }

  const authenticated = await authenticateAgentCamera(request, cameraId);
  if (!authenticated) {
    return NextResponse.json({ ok: false, error: "invalid_agent_camera" }, { status: 401 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ ok: false, error: "event_payload_too_large" }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = EventSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Evento v2 rejeitado:", parsed.error.issues.map((i: { message: string }) => i.message).join("; "));
    return NextResponse.json({ ok: false, error: "invalid_event_payload" }, { status: 400 });
  }

  const input = parsed.data;
  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);
  if (endedAt < startedAt || endedAt.getTime() - startedAt.getTime() > 15 * 60 * 1000) {
    return NextResponse.json({ ok: false, error: "invalid_event_window" }, { status: 400 });
  }

  const labels = new Set(input.frames.map((frame: { label: string }) => frame.label));
  if (labels.size !== input.frames.length) {
    return NextResponse.json({ ok: false, error: "duplicate_frame_labels" }, { status: 400 });
  }

  const decoded: Array<{
    label: (typeof input.frames)[number]["label"];
    capturedAt: string;
    width: number | null;
    height: number | null;
    timeline: Record<string, unknown>;
    buffer: Buffer;
    sha256: string;
  }> = [];
  let totalBytes = 0;

  try {
    for (const frame of input.frames) {
      const buffer = decodeBase64(frame.imageBase64);
      if (
        buffer.length !== frame.byteSize ||
        buffer.length < 1024 ||
        buffer.length > MAX_FRAME_BYTES ||
        !isJpeg(buffer)
      ) throw new Error("invalid_jpeg");

      totalBytes += buffer.length;
      decoded.push({
        label: frame.label,
        capturedAt: new Date(frame.capturedAt).toISOString(),
        width: frame.width,
        height: frame.height,
        timeline: frame.timeline ?? {},
        buffer,
        sha256: createHash("sha256").update(buffer).digest("hex"),
      });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_event_frame" }, { status: 400 });
  }

  if (totalBytes > MAX_TOTAL_FRAME_BYTES) {
    return NextResponse.json({ ok: false, error: "event_frames_too_large" }, { status: 413 });
  }

  const supabase = authenticated.supabase;

  if (input.sessionId) {
    const { data: session, error } = await supabase
      .from("capture_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("agent_id", authenticated.agent.id)
      .maybeSingle();
    if (error || !session) {
      return NextResponse.json({ ok: false, error: "invalid_capture_session" }, { status: 400 });
    }
  }

  const { data: existing, error: existingError } = await supabase
    .from("analysis_jobs")
    .select("id,status,ingestion_id")
    .eq("camera_id", cameraId)
    .eq("agent_event_id", input.eventId)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ ok: false, error: "event_idempotency_unavailable" }, { status: 500 });
  }
  if (existing) return existingResponse(supabase, existing);

  let preliminaryContext;
  try {
    preliminaryContext = await buildFrozenEventAnalysisContext({ authenticated, cameraId });
  } catch (contextError) {
    const code = contextError instanceof Error ? contextError.message : "analysis_context_unavailable";
    const status = code === "active_camera_profile_required" ? 409 : 500;
    return NextResponse.json({ ok: false, error: code }, { status });
  }

  // O plano enviado pelo Agent é apenas uma sugestão inicial. O trigger
  // `enforce_monitoria_analysis_entitlement` é a autoridade para assinatura
  // e trials, inclusive preenchendo trial_run_id. Por isso só congelamos o
  // plano efetivo depois do INSERT ter passado pelo banco.
  const requestedPlanCode = normalizeAnalysisPlan(authenticated.camera.analysisPlanCode);

  const { data: job, error: jobError } = await supabase
    .from("analysis_jobs")
    .insert({
      organization_id: authenticated.camera.organizationId,
      camera_id: cameraId,
      capture_session_id: input.sessionId,
      status: "queued",
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      profile_id: preliminaryContext.profileId,
      profile_version: preliminaryContext.profileVersion,
      prompt_version: preliminaryContext.promptVersion,
      prompt_hash: preliminaryContext.promptHash,
      local_metrics: { ...input.localMetrics, planCode: requestedPlanCode },
      analysis_plan_code: requestedPlanCode,
      source_agent_id: authenticated.agent.id,
      agent_event_id: input.eventId,
      attempt_count: 0,
    })
    .select("id,analysis_plan_code,trial_run_id,retention_snapshot")
    .single();

  if (jobError || !job) {
    // Corrida idempotente: se outra request criou o mesmo agent_event_id, devolve o existente.
    const { data: raced } = await supabase
      .from("analysis_jobs")
      .select("id,status,ingestion_id")
      .eq("camera_id", cameraId)
      .eq("agent_event_id", input.eventId)
      .maybeSingle();
    if (raced) return existingResponse(supabase, raced);

    // O trigger de entitlement é também a autoridade para o fim do trial.
    // Devolver 4xx evita tratar uma regra comercial definitiva como outage do
    // backend; o evento permanece localmente preservado pela fila v2.
    if (jobError?.message?.includes("camera_monitoring_not_allowed")) {
      return NextResponse.json(
        { ok: false, error: "camera_monitoring_not_allowed" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json({ ok: false, error: "analysis_job_create_failed" }, { status: 500 });
  }

  const analysisJobId = String(job.id);
  const effectivePlanCode = normalizeAnalysisPlan(job.analysis_plan_code);
  const effectiveVisionPlan = getVisionPlan(effectivePlanCode);
  const retentionSnapshot =
    job.retention_snapshot && typeof job.retention_snapshot === "object" && !Array.isArray(job.retention_snapshot)
      ? job.retention_snapshot as Record<string, unknown>
      : null;

  // Mantém o MESMO perfil/zona/inteligência capturado antes do INSERT e troca
  // somente plano/retention pelo resultado efetivo do entitlement. Isso evita
  // uma corrida em que uma edição de perfil entre duas queries alteraria um
  // evento que já estava chegando.
  const frozenContext = applyEffectivePlanToFrozenContext(preliminaryContext, {
    planCode: effectivePlanCode,
    retentionSnapshot,
  });

  // Se a configuração do Agent ficou alguns segundos atrasada em relação ao
  // entitlement, nunca rejeitamos um evento já capturado só por trazer frames
  // demais. Escolhemos deterministicamente o subconjunto permitido pelo plano
  // que o próprio banco acabou de autorizar.
  const priority = effectiveVisionPlan.maximumFrames === 1
    ? ["peak", "start", "end", "extra"]
    : ["start", "peak", "end", "extra"];
  const priorityIndex = new Map(priority.map((label, index) => [label, index]));
  const effectiveDecoded = [...decoded]
    .sort((left, right) =>
      (priorityIndex.get(left.label) ?? 99) - (priorityIndex.get(right.label) ?? 99),
    )
    .slice(0, effectiveVisionPlan.maximumFrames);

  const { data: alignedJob, error: alignError } = await supabase
    .from("analysis_jobs")
    .update({
      prompt_hash: frozenContext.promptHash,
      local_metrics: { ...input.localMetrics, planCode: effectivePlanCode },
    })
    .eq("id", analysisJobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (alignError || !alignedJob) {
    await supabase.from("analysis_jobs").delete().eq("id", analysisJobId).eq("status", "queued");
    return NextResponse.json(
      { ok: false, error: "analysis_job_entitlement_alignment_failed" },
      { status: 500 },
    );
  }

  const retentionAnchor = endedAt.getTime();
  const temporaryExpiresAt = new Date(
    retentionAnchor + frozenContext.retention.temporaryFrameDays * 86_400_000,
  ).toISOString();
  const year = String(startedAt.getUTCFullYear());
  const month = String(startedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(startedAt.getUTCDate()).padStart(2, "0");

  const { data: ingestion, error: ingestionError } = await supabase
    .from("event_ingestions")
    .insert({
      organization_id: authenticated.camera.organizationId,
      camera_id: cameraId,
      source_agent_id: authenticated.agent.id,
      analysis_job_id: analysisJobId,
      agent_event_id: input.eventId,
      capture_session_id: input.sessionId,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      local_metrics: { ...input.localMetrics, planCode: effectivePlanCode },
      analysis_context: frozenContext,
      status: "receiving",
      expected_frame_count: effectiveDecoded.length,
    })
    .select("id")
    .single();

  if (ingestionError || !ingestion) {
    await supabase.from("analysis_jobs").delete().eq("id", analysisJobId).eq("status", "queued");
    return NextResponse.json({ ok: false, error: "event_ingestion_create_failed" }, { status: 500 });
  }

  const ingestionId = String(ingestion.id);
  const { data: linkedJob, error: linkError } = await supabase
    .from("analysis_jobs")
    .update({ ingestion_id: ingestionId })
    .eq("id", analysisJobId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (linkError || !linkedJob) {
    await rollbackIncompleteIngestion(supabase, {
      analysisJobId, ingestionId, storagePaths: [],
    });
    return NextResponse.json(
      { ok: false, error: "event_ingestion_link_failed" },
      { status: 500 },
    );
  }

  const uploadedStoragePaths: string[] = [];

  try {
    for (const frame of effectiveDecoded) {
      const storagePath = [
        authenticated.camera.organizationId,
        cameraId,
        year,
        month,
        day,
        analysisJobId,
        `${frame.label}.jpg`,
      ].join("/");

      const { error: uploadError } = await supabase.storage
        .from("event-keyframes")
        .upload(storagePath, frame.buffer, {
          contentType: "image/jpeg",
          cacheControl: "3600",
          upsert: true,
        });
      if (uploadError) throw uploadError;
      uploadedStoragePaths.push(storagePath);

      const { data: asset, error: assetError } = await supabase
        .from("storage_assets")
        .upsert({
          organization_id: authenticated.camera.organizationId,
          camera_id: cameraId,
          analysis_job_id: analysisJobId,
          event_id: null,
          kind: "event_keyframe",
          status: "ready",
          bucket: "event-keyframes",
          storage_path: storagePath,
          mime_type: "image/jpeg",
          byte_size: frame.buffer.length,
          width: frame.width,
          height: frame.height,
          captured_at: frame.capturedAt,
          expires_at: temporaryExpiresAt,
          deleted_at: null,
          frame_label: frame.label,
          retention_class: "temporary",
          content_sha256: frame.sha256,
        }, { onConflict: "bucket,storage_path" })
        .select("id")
        .single();
      if (assetError || !asset) throw assetError ?? new Error("asset_missing");

      const { error: manifestError } = await supabase
        .from("event_ingestion_frames")
        .upsert({
          ingestion_id: ingestionId,
          frame_label: frame.label,
          storage_asset_id: asset.id,
          storage_path: storagePath,
          captured_at: frame.capturedAt,
          width: frame.width,
          height: frame.height,
          byte_size: frame.buffer.length,
          content_sha256: frame.sha256,
          timeline: frame.timeline,
        });
      if (manifestError) throw manifestError;
    }

    const evidenceReadyAt = new Date().toISOString();
    const { data: readyRow, error: readyError } = await supabase.from("event_ingestions").update({
      status: "queued",
      evidence_ready_at: evidenceReadyAt,
      last_error: null,
      next_retry_at: null,
      updated_at: evidenceReadyAt,
    }).eq("id", ingestionId).eq("status", "receiving").select("id").maybeSingle();
    if (readyError || !readyRow) throw readyError ?? new Error("event_ingestion_ready_transition_failed");
  } catch (error) {
    const message = sanitizePostgresText(error instanceof Error ? error.message : String(error));
    console.error(`Falha ao persistir evidência ${ingestionId}:`, message.slice(0, 800));
    await rollbackIncompleteIngestion(supabase, {
      analysisJobId,
      ingestionId,
      storagePaths: uploadedStoragePaths,
    });
    return NextResponse.json({ ok: false, error: "event_evidence_persist_failed" }, { status: 500 });
  }

  // O recibo e todas as evidências já estão duráveis neste ponto. `after()`
  // libera o Agent imediatamente e usa a Function atual apenas como disparo
  // do processamento. Se a execução for interrompida por deploy/timeout, a
  // lease expira e o cron de recovery assume o mesmo ingestionId.
  after(async () => {
    try {
      await processMonitoriaEventCore(ingestionId, "after");
    } catch (error) {
      console.error(
        `Processamento pós-ACK falhou para ${ingestionId}; recovery assumirá:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  });

  return NextResponse.json({
    ok: true,
    duplicate: false,
    pending: true,
    analysisJobId,
    ingestionId,
    relevant: null,
    eventId: null,
    summary: null,
    type: null,
    confidence: null,
    requiresReview: false,
    clipRequest: null,
  }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
