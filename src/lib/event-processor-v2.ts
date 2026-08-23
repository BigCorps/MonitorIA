import { createHash } from "node:crypto";
import { CameraProfileSchema } from "@/src/contracts/camera-profile";
import { normalizeAnalyzedEventZones } from "@/src/lib/event-analysis";
import { persistAnalysisRoutingDecision } from "@/src/lib/analysis-routing";
import { persistEventVehicleAppearanceAndContinuity } from "@/src/lib/event-vehicle-continuity";
import { persistEventPersonAppearanceAndContinuity } from "@/src/lib/event-continuity";
import { createMonitoriaClipUploadRequest } from "@/src/lib/clip-generation";
import { sanitizePostgresJson, sanitizePostgresText } from "@/src/lib/postgres-safe-json";
import {
  estimateVisionCostBreakdown,
  estimateVisionCostUsd,
} from "@/src/vision/cost";
import { analyzeEventForPlan, runVisionModel } from "@/src/vision/plan-runner";
import { getVisionPlan, otherValidationModel } from "@/src/vision/plans";
import type { AnalyzeEventInput, VisionAnalysisAttempt, VisionPlanOutcome } from "@/src/vision/types";
import type { FrozenEventAnalysisContext } from "@/src/lib/event-ingestion-context";

export type ProcessSource = "after" | "recovery";

type ClaimRow = {
  ingestion_id: string;
  analysis_job_id: string;
  lease_token: string;
};

function promptCacheKey(input: {
  cameraId: string;
  profileVersion: number;
  planCode: string;
  modelGroup: string;
}) {
  return `mtr_${createHash("sha256")
    .update([input.cameraId, input.profileVersion, input.planCode, input.modelGroup].join(":"))
    .digest("hex")
    .slice(0, 48)}`;
}

function envBoolean(value: string | undefined, fallback = false) {
  return value === undefined ? fallback : value.toLowerCase() === "true";
}

function boundedInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function distinctAttempts(attempts: VisionAnalysisAttempt[]) {
  const seen = new Set<string>();
  return attempts.filter((attempt) => {
    if (seen.has(attempt.responseId)) return false;
    seen.add(attempt.responseId);
    return true;
  });
}

async function shouldRunAbTest(supabase: any, cameraId: string) {
  if (!envBoolean(process.env.VISION_AB_TEST_ENABLED)) return false;
  const samplePercent = Math.max(
    0,
    Math.min(100, boundedInteger(process.env.VISION_AB_TEST_SAMPLE_PERCENT, 100)),
  );
  if (Math.random() * 100 >= samplePercent) return false;
  const maximum = Math.max(
    1,
    boundedInteger(process.env.VISION_AB_TEST_MAX_PER_CAMERA, 50),
  );
  const { count, error } = await supabase
    .from("vision_model_experiments")
    .select("id", { count: "exact", head: true })
    .eq("camera_id", cameraId);
  if (error) {
    console.error("Falha ao contar testes A/B:", error.message);
    return false;
  }
  return (count ?? 0) < maximum;
}

async function recordAuxiliaryUsage(
  supabase: any,
  input: {
    organizationId: string;
    cameraId: string;
    analysisJobId: string;
    planCode: string;
    attempt: VisionAnalysisAttempt;
  },
) {
  const cost = estimateVisionCostBreakdown(input.attempt.model, input.attempt.usage);

  // Retry depois de um checkpoint pago não pode duplicar custo auxiliar. A
  // lease impede concorrência normal; esta consulta cobre queda entre INSERT
  // e fechamento do recibo.
  const { count: existingCount, error: lookupError } = await supabase
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("analysis_job_id", input.analysisJobId)
    .contains("metadata", { response_id: input.attempt.responseId });
  if (lookupError) {
    console.error("Falha ao verificar uso auxiliar existente:", lookupError.message);
  } else if ((existingCount ?? 0) > 0) {
    return;
  }

  const { error } = await supabase.from("usage_events").insert({
    organization_id: input.organizationId,
    camera_id: input.cameraId,
    analysis_job_id: input.analysisJobId,
    provider: input.attempt.provider,
    model: input.attempt.model,
    input_tokens: input.attempt.usage.inputTokens,
    cached_input_tokens: input.attempt.usage.cachedInputTokens,
    output_tokens: input.attempt.usage.outputTokens,
    reasoning_tokens: input.attempt.usage.reasoningTokens,
    analysis_plan_code: input.planCode,
    estimated_cost_usd: cost.totalCostUsd,
    pricing: cost.rates,
    metadata: sanitizePostgresJson({
      purpose:
        input.attempt.role === "ab_candidate"
          ? "vision_ab_candidate"
          : "vision_escalation_primary",
      role: input.attempt.role,
      response_id: input.attempt.responseId,
      latency_ms: input.attempt.latencyMs,
      cost_breakdown: cost,
    }),
  });
  if (error) console.error("Falha ao registrar chamada auxiliar:", error.message);
}

function processingRetryDelayMs(attemptCount: unknown) {
  const attempt = Math.max(1, Number(attemptCount ?? 1));
  return Math.min(15 * 60_000, 60_000 * 2 ** Math.min(4, attempt - 1));
}

function isTerminalEvidenceError(message: string) {
  return [
    "event_ingestion_frames_missing",
    "event_ingestion_frames_incomplete",
    "event_ingestion_context_invalid",
    "event_frame_hash_mismatch",
    "event_ingestion_prepared_analysis_invalid",
  ].some((code) => message.includes(code));
}

async function downloadFrames(supabase: any, ingestionId: string, expected: number) {
  const { data: rows, error } = await supabase
    .from("event_ingestion_frames")
    .select("frame_label,storage_path,captured_at,width,height,byte_size,content_sha256,timeline")
    .eq("ingestion_id", ingestionId)
    .order("captured_at", { ascending: true });

  if (error || !rows?.length) throw new Error("event_ingestion_frames_missing");
  if (rows.length < expected) throw new Error("event_ingestion_frames_incomplete");

  const frames: AnalyzeEventInput["frames"] = [];
  for (const row of rows) {
    const { data: object, error: downloadError } = await supabase.storage
      .from("event-keyframes")
      .download(String(row.storage_path));
    if (downloadError || !object) {
      throw new Error(`event_frame_download_failed:${row.frame_label}`);
    }
    const bytes = Buffer.from(await object.arrayBuffer());
    const digest = createHash("sha256").update(bytes).digest("hex");
    if (digest !== String(row.content_sha256)) {
      throw new Error(`event_frame_hash_mismatch:${row.frame_label}`);
    }
    frames.push({
      label: String(row.frame_label) as AnalyzeEventInput["frames"][number]["label"],
      capturedAt: String(row.captured_at),
      imageUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
    });
  }
  return frames;
}

/**
 * Processador durável da 1.0.2.
 *
 * O Supabase é a fonte de verdade. `after()` apenas dispara esta função; o
 * recovery chama a MESMA função após expirar a lease. Nenhum token do Agent,
 * request original ou estado em memória é necessário depois do ACK.
 */
export async function processMonitoriaEventCore(
  ingestionId: string,
  source: ProcessSource = "recovery",
) {
  const { createAdminClient } = await import("@/src/lib/supabase/admin");
  const supabase = createAdminClient();

  const { data: claimRows, error: claimError } = await supabase.rpc(
    "claim_monitoria_event_ingestion",
    { p_ingestion_id: ingestionId, p_lease_seconds: 420 },
  );
  if (claimError) throw new Error(`event_ingestion_claim_failed:${claimError.message}`);

  const claim = (Array.isArray(claimRows) ? claimRows[0] : claimRows) as ClaimRow | null;
  if (!claim?.lease_token) {
    const { data: current } = await supabase
      .from("event_ingestions")
      .select("status,completed_at,processing_lease_expires_at")
      .eq("id", ingestionId)
      .maybeSingle();
    return {
      skipped: true,
      status: String(current?.status ?? "missing"),
      completed: Boolean(current?.completed_at),
    };
  }

  const leaseToken = String(claim.lease_token);
  const analysisJobId = String(claim.analysis_job_id);

  const { data: ingestion, error: ingestionError } = await supabase
    .from("event_ingestions")
    .select("id,organization_id,camera_id,source_agent_id,analysis_job_id,agent_event_id,capture_session_id,started_at,ended_at,local_metrics,analysis_context,prepared_analysis,prepared_analysis_meta,ai_completed_at,status,expected_frame_count,attempt_count")
    .eq("id", ingestionId)
    .eq("processing_lease_token", leaseToken)
    .maybeSingle();
  if (ingestionError || !ingestion) throw new Error("event_ingestion_not_found_after_claim");

  const organizationId = String(ingestion.organization_id);
  const cameraId = String(ingestion.camera_id);
  const agentId = ingestion.source_agent_id ? String(ingestion.source_agent_id) : null;

  try {
    // Se a transação de conclusão já foi commitada e a Function caiu antes de
    // fechar o recibo, nunca repetimos a IA. Reparamos apenas os efeitos
    // idempotentes que podem ter ficado depois do commit.
    const { data: committedJob } = await supabase
      .from("analysis_jobs")
      .select("status")
      .eq("id", analysisJobId)
      .maybeSingle();
    if (committedJob?.status === "completed") {
      const { data: committedEvent } = await supabase
        .from("events")
        .select("id,started_at,ended_at,analyzed_payload")
        .eq("analysis_job_id", analysisJobId)
        .maybeSingle();

      let context: FrozenEventAnalysisContext | null = null;
      try {
        context = ingestion.analysis_context as FrozenEventAnalysisContext;
        if (context?.schemaVersion !== "monitoria-event-context/1") context = null;
      } catch { context = null; }

      if (committedEvent && context) {
        const cameraProfile = CameraProfileSchema.parse(context.cameraProfile);
        const payload = committedEvent.analyzed_payload && typeof committedEvent.analyzed_payload === "object"
          ? committedEvent.analyzed_payload as any
          : {};
        if (context.features.shortMemoryEnabled) {
          await persistEventPersonAppearanceAndContinuity({
            supabase, organizationId, eventId: String(committedEvent.id),
            people: Array.isArray(payload.people) ? payload.people : [],
            sessionSignals: Array.isArray(payload.sessionSignals) ? payload.sessionSignals : [],
            zones: cameraProfile.zones.map((zone: { id: string; personRoleHint?: string }) => ({ id: zone.id, personRoleHint: zone.personRoleHint ?? "none" })),
          }).catch((error: unknown) => console.error("Recovery de continuidade de pessoas falhou:", error));
        }
        if (context.features.vehicleMemoryEnabled) {
          await persistEventVehicleAppearanceAndContinuity({
            supabase, organizationId, eventId: String(committedEvent.id),
            vehicles: Array.isArray(payload.vehicles) ? payload.vehicles : [],
          }).catch((error: unknown) => console.error("Recovery de continuidade de veículos falhou:", error));
        }
        if (agentId) {
          await createMonitoriaClipUploadRequest({
            supabase, organizationId, cameraId, agentId, analysisJobId,
            eventId: String(committedEvent.id), planCode: context.planCode,
            startedAt: String(committedEvent.started_at), endedAt: String(committedEvent.ended_at),
            agentVersion: "1.0.2",
            frozenClipPolicy: {
              enabled: context.retention.clipEnabled,
              durationSeconds: context.retention.clipDurationSeconds,
              retentionDays: context.retention.clipRetentionDays,
            },
          }).catch((error: unknown) => console.error("Recovery do pedido de clipe falhou:", error));
        }

        // A Function pode cair depois do commit atômico e antes dos efeitos
        // complementares. O checkpoint pago permite reparar roteamento e
        // metadados de custo SEM outra chamada de IA.
        const preparedMeta = ingestion.prepared_analysis_meta as Record<string, any> | null;
        const preparedOutcome = preparedMeta?.outcome as VisionPlanOutcome | undefined;
        const final = preparedOutcome?.final;
        if (preparedMeta?.schemaVersion === "monitoria-prepared-analysis/1" && final) {
          const finalCost = preparedMeta.finalCost ?? estimateVisionCostBreakdown(final.model, final.usage);
          const modelChain = Array.isArray(preparedMeta.modelChain) ? preparedMeta.modelChain : [];
          await Promise.all([
            supabase.from("analysis_jobs").update({
              cached_input_tokens: final.usage.cachedInputTokens,
              reasoning_tokens: final.usage.reasoningTokens,
              analysis_plan_code: context.planCode,
              model_chain: sanitizePostgresJson(modelChain),
            }).eq("id", analysisJobId),
            supabase.from("usage_events").update({
              cached_input_tokens: final.usage.cachedInputTokens,
              reasoning_tokens: final.usage.reasoningTokens,
              analysis_plan_code: context.planCode,
              pricing: finalCost.rates,
              estimated_cost_usd: finalCost.totalCostUsd,
              metadata: sanitizePostgresJson({
                purpose: "continuous_event",
                role: preparedMeta.finalAttemptRole ?? "primary",
                response_id: final.responseId,
                latency_ms: final.latencyMs,
                plan_code: context.planCode,
                model_chain: modelChain,
                recovered_after_commit: true,
              }),
            })
              .eq("analysis_job_id", analysisJobId)
              .contains("metadata", {
                purpose: "continuous_event",
                response_id: final.responseId,
              }),
          ]);
          await persistAnalysisRoutingDecision({
            supabase, organizationId, cameraId, analysisJobId,
            eventId: String(committedEvent.id), outcome: preparedOutcome,
          }).catch((error: unknown) => console.error("Recovery do roteamento falhou:", error));
        }
      }

      const completedAt = new Date().toISOString();
      await supabase.from("event_ingestions").update({
        status: "completed", completed_at: completedAt, processing_heartbeat_at: completedAt,
        processing_lease_token: null, processing_lease_expires_at: null,
        next_retry_at: null, last_error: null, updated_at: completedAt,
      }).eq("id", ingestionId).eq("processing_lease_token", leaseToken);
      return { source, analysisJobId, eventId: committedEvent?.id ? String(committedEvent.id) : null, relevant: Boolean(committedEvent), recoveredAfterCommit: true };
    }
    let context: FrozenEventAnalysisContext;
    try {
      context = ingestion.analysis_context as FrozenEventAnalysisContext;
      if (context?.schemaVersion !== "monitoria-event-context/1") throw new Error();
      CameraProfileSchema.parse(context.cameraProfile);
    } catch {
      throw new Error("event_ingestion_context_invalid");
    }

    const cameraProfile = CameraProfileSchema.parse(context.cameraProfile);
    const allowedZones = new Set(cameraProfile.zones.map((zone: { id: string }) => zone.id));
    const planCode = context.planCode;
    const visionPlan = getVisionPlan(planCode);
    const heartbeat = new Date().toISOString();
    await Promise.all([
      supabase
        .from("event_ingestions")
        .update({
          processing_heartbeat_at: heartbeat,
          processing_lease_expires_at: new Date(Date.now() + 7 * 60_000).toISOString(),
          updated_at: heartbeat,
        })
        .eq("id", ingestionId)
        .eq("processing_lease_token", leaseToken),
      supabase
        .from("analysis_jobs")
        .update({
          status: "processing",
          processing_heartbeat_at: heartbeat,
          updated_at: heartbeat,
        })
        .eq("id", analysisJobId),
    ]);

    const startedAt = String(ingestion.started_at);
    const endedAt = String(ingestion.ended_at);
    const localMetrics = ingestion.local_metrics ?? {};
    const defaultCacheKey = promptCacheKey({
      cameraId,
      profileVersion: context.profileVersion,
      planCode,
      modelGroup: `${visionPlan.mode}:${context.promptHash.slice(0, 12)}`,
    });

    // Retenção é ancorada no acontecimento, não na hora em que um backlog
    // terminou de processá-lo. Um atraso de horas/dias não prolonga dados
    // silenciosamente além do snapshot contratado no recebimento.
    const retentionAnchor = Number.isFinite(Date.parse(endedAt))
      ? Date.parse(endedAt)
      : Date.now();
    const eventExpiresAt = new Date(
      retentionAnchor + context.retention.metadataDays * 86_400_000,
    ).toISOString();
    const keyframeExpiresAt = new Date(
      retentionAnchor + context.retention.keyframeDays * 86_400_000,
    ).toISOString();
    const temporaryExpiresAt = new Date(
      retentionAnchor + context.retention.temporaryFrameDays * 86_400_000,
    ).toISOString();

    let outcome: VisionPlanOutcome;
    let uniqueAttempts: VisionAnalysisAttempt[];
    let finalAnalysis: VisionPlanOutcome["final"];
    let finalAttemptRole: string;
    let normalizedEvent: VisionPlanOutcome["final"]["event"];
    let finalCost: ReturnType<typeof estimateVisionCostBreakdown>;
    let modelChain: Array<Record<string, unknown>>;
    let cacheKey = defaultCacheKey;
    let frameCount = Number(ingestion.expected_frame_count ?? 1);

    const preparedEvent = ingestion.prepared_analysis;
    const preparedMeta = ingestion.prepared_analysis_meta as Record<string, any> | null;

    if (preparedEvent || ingestion.ai_completed_at) {
      if (
        !preparedEvent ||
        !preparedMeta ||
        preparedMeta.schemaVersion !== "monitoria-prepared-analysis/1" ||
        !preparedMeta.outcome ||
        !preparedMeta.finalCost
      ) {
        throw new Error("event_ingestion_prepared_analysis_invalid");
      }

      outcome = preparedMeta.outcome as VisionPlanOutcome;
      normalizedEvent = preparedEvent as VisionPlanOutcome["final"]["event"];
      finalAnalysis = {
        ...(outcome.final as VisionPlanOutcome["final"]),
        event: normalizedEvent,
      };
      outcome = { ...outcome, final: finalAnalysis };
      uniqueAttempts = distinctAttempts(
        Array.isArray(preparedMeta.attempts)
          ? preparedMeta.attempts as VisionAnalysisAttempt[]
          : outcome.attempts ?? [],
      );
      finalAttemptRole = String(preparedMeta.finalAttemptRole ?? outcome.attempts?.at(-1)?.role ?? "primary");
      finalCost = preparedMeta.finalCost as ReturnType<typeof estimateVisionCostBreakdown>;
      modelChain = Array.isArray(preparedMeta.modelChain)
        ? preparedMeta.modelChain as Array<Record<string, unknown>>
        : uniqueAttempts.map((attempt) => ({
            role: attempt.role,
            model: attempt.model,
            responseId: attempt.responseId,
            latencyMs: attempt.latencyMs,
            usage: attempt.usage,
            cost: estimateVisionCostUsd(attempt.model, attempt.usage),
          }));
      cacheKey = String(preparedMeta.cacheKey ?? defaultCacheKey);
      frameCount = Number(preparedMeta.frameCount ?? frameCount);
    } else {
      const frames = await downloadFrames(
        supabase,
        ingestionId,
        Number(ingestion.expected_frame_count ?? 1),
      );
      frameCount = frames.length;

      const [recentEventsResult, recentStatesResult] = await Promise.all([
        supabase
          .from("events")
          .select("started_at,ended_at,headline,primary_event_type,summary")
          .eq("organization_id", organizationId)
          .eq("camera_id", cameraId)
          .lt("started_at", startedAt)
          .is("deleted_at", null)
          .order("started_at", { ascending: false })
          .limit(5),
        supabase
          .from("visual_entity_current_states")
          .select("entity_id,current_state,last_observed_at,confidence")
          .eq("organization_id", organizationId)
          .eq("camera_id", cameraId),
      ]);

      const visionInput: AnalyzeEventInput = {
        organizationId,
        eventId: String(ingestion.agent_event_id),
        startedAt,
        endedAt,
        profile: cameraProfile,
        frames,
        localMetrics,
        planCode,
        analysisMode: visionPlan.mode,
        promptCacheKey: cacheKey,
        recentOperationalContext: (recentEventsResult.data ?? [])
          .reverse()
          .map((event: any) => ({
            startedAt: String(event.started_at),
            endedAt: String(event.ended_at),
            headline: String(event.headline ?? ""),
            primaryEventType: String(event.primary_event_type),
            summary: String(event.summary ?? "").slice(0, 320),
          })),
        recentVisualStates: (recentStatesResult.data ?? []).map((state: any) => ({
          entityId: String(state.entity_id),
          state: String(state.current_state),
          lastObservedAt: String(state.last_observed_at),
          confidence: Number(state.confidence ?? 0),
        })),
      };

      outcome = await analyzeEventForPlan(visionInput, planCode, {
        allowVerification: async () => {
          const { data, error } = await supabase.rpc(
            "reserve_monitoria_analysis_verification",
            {
              p_analysis_job_id: analysisJobId,
              p_camera_id: cameraId,
              p_organization_id: organizationId,
              p_plan_code: planCode,
            },
          );
          if (error) {
            console.error("Falha ao reservar verificação seletiva:", error.message);
            return false;
          }
          return Boolean(data);
        },
      });

      const attempts = [...outcome.attempts];
      if (await shouldRunAbTest(supabase, cameraId)) {
        const validationModel = otherValidationModel(outcome.final.model);
        if (!attempts.some((attempt) => attempt.model === validationModel)) {
          try {
            attempts.push(
              await runVisionModel(visionInput, {
                model: validationModel,
                detail: visionPlan.detail,
                maxOutputTokens: Math.max(visionPlan.maxOutputTokens, 2400),
                role: "ab_candidate",
              }),
            );
          } catch (candidateError) {
            console.error("A chamada experimental falhou sem afetar o evento:", candidateError);
          }
        }
      }

      uniqueAttempts = distinctAttempts(attempts);
      finalAnalysis = outcome.final;
      finalAttemptRole = outcome.attempts.at(-1)?.role ?? "primary";
      normalizedEvent = sanitizePostgresJson(
        normalizeAnalyzedEventZones(
          finalAnalysis.event,
          allowedZones,
          cameraProfile.visualEntities,
        ),
      ) as typeof finalAnalysis.event;
      finalAnalysis = { ...finalAnalysis, event: normalizedEvent };
      outcome = { ...outcome, final: finalAnalysis };
      finalCost = estimateVisionCostBreakdown(finalAnalysis.model, finalAnalysis.usage);
      modelChain = uniqueAttempts.map((attempt) => ({
        role: attempt.role,
        model: attempt.model,
        responseId: attempt.responseId,
        latencyMs: attempt.latencyMs,
        usage: attempt.usage,
        cost: estimateVisionCostUsd(attempt.model, attempt.usage),
      }));

      // Checkpoint pago: depois desta gravação, qualquer falha de banco ou
      // rede retoma o MESMO resultado sem repetir OpenAI/A-B/verificação.
      const aiCompletedAt = new Date().toISOString();
      const { data: checkpoint, error: checkpointError } = await supabase
        .from("event_ingestions")
        .update({
          prepared_analysis: normalizedEvent,
          prepared_analysis_meta: sanitizePostgresJson({
            schemaVersion: "monitoria-prepared-analysis/1",
            outcome,
            attempts: uniqueAttempts,
            finalCost,
            modelChain,
            finalAttemptRole,
            cacheKey,
            frameCount,
          }),
          ai_completed_at: aiCompletedAt,
          processing_heartbeat_at: aiCompletedAt,
          processing_lease_expires_at: new Date(Date.now() + 7 * 60_000).toISOString(),
          updated_at: aiCompletedAt,
        })
        .eq("id", ingestionId)
        .eq("processing_lease_token", leaseToken)
        .select("id")
        .maybeSingle();
      if (checkpointError || !checkpoint) {
        throw new Error(
          `event_ingestion_ai_checkpoint_failed:${checkpointError?.message ?? "lease_lost"}`,
        );
      }
    }

    const { data: completed, error: completionError } = await supabase.rpc(
      "complete_agent_analysis_job",
      {
        p_job_id: analysisJobId,
        p_analyzed_event: normalizedEvent,
        p_provider: finalAnalysis.provider,
        p_model: finalAnalysis.model,
        p_response_id: finalAnalysis.responseId,
        p_input_tokens: finalAnalysis.usage.inputTokens,
        p_output_tokens: finalAnalysis.usage.outputTokens,
        p_latency_ms: finalAnalysis.latencyMs,
        p_estimated_cost_usd: finalCost.totalCostUsd,
        p_event_expires_at: eventExpiresAt,
        p_keyframe_expires_at: keyframeExpiresAt,
      },
    );
    const result = Array.isArray(completed) ? completed[0] : completed;
    if (completionError || !result) {
      throw new Error(
        completionError?.message ?? "A finalização atômica não retornou resultado.",
      );
    }

    await Promise.all([
      supabase
        .from("analysis_jobs")
        .update({
          cached_input_tokens: finalAnalysis.usage.cachedInputTokens,
          reasoning_tokens: finalAnalysis.usage.reasoningTokens,
          analysis_plan_code: planCode,
          model_chain: sanitizePostgresJson(modelChain),
        })
        .eq("id", analysisJobId),
      supabase
        .from("usage_events")
        .update({
          cached_input_tokens: finalAnalysis.usage.cachedInputTokens,
          reasoning_tokens: finalAnalysis.usage.reasoningTokens,
          analysis_plan_code: planCode,
          pricing: finalCost.rates,
          estimated_cost_usd: finalCost.totalCostUsd,
          metadata: sanitizePostgresJson({
            purpose: "continuous_event",
            role: finalAttemptRole,
            response_id: finalAnalysis.responseId,
            latency_ms: finalAnalysis.latencyMs,
            plan_code: planCode,
            analysis_mode: visionPlan.mode,
            escalated: outcome.escalated,
            prompt_cache_key: cacheKey,
            cost_breakdown: finalCost,
            model_chain: modelChain,
          }),
        })
        .eq("analysis_job_id", analysisJobId),
    ]);

    for (const attempt of uniqueAttempts) {
      if (attempt.responseId === finalAnalysis.responseId) continue;
      await recordAuxiliaryUsage(supabase, {
        organizationId,
        cameraId,
        analysisJobId,
        planCode,
        attempt,
      });
    }

    const nano = uniqueAttempts.find((attempt) => attempt.model.includes("nano"));
    const mini = uniqueAttempts.find((attempt) => attempt.model.includes("mini"));
    if (nano && mini) {
      const nanoCost = estimateVisionCostBreakdown(nano.model, nano.usage);
      const miniCost = estimateVisionCostBreakdown(mini.model, mini.usage);
      const { error: experimentError } = await supabase
        .from("vision_model_experiments")
        .upsert(
          {
            organization_id: organizationId,
            camera_id: cameraId,
            analysis_job_id: analysisJobId,
            plan_code: planCode,
            nano_model: nano.model,
            mini_model: mini.model,
            nano_payload: sanitizePostgresJson(
              normalizeAnalyzedEventZones(nano.event, allowedZones, cameraProfile.visualEntities),
            ),
            mini_payload: sanitizePostgresJson(
              normalizeAnalyzedEventZones(mini.event, allowedZones, cameraProfile.visualEntities),
            ),
            nano_usage: nano.usage,
            mini_usage: mini.usage,
            nano_latency_ms: nano.latencyMs,
            mini_latency_ms: mini.latencyMs,
            nano_cost_usd: nanoCost.totalCostUsd,
            mini_cost_usd: miniCost.totalCostUsd,
          },
          { onConflict: "analysis_job_id" },
        );
      if (experimentError) console.error("Falha ao salvar comparação A/B:", experimentError.message);
    }

    const relevant = Boolean(result.relevant);
    const eventId = result.event_id ? String(result.event_id) : null;

    const continuity =
      relevant && eventId && context.features.shortMemoryEnabled
        ? await persistEventPersonAppearanceAndContinuity({
            supabase,
            organizationId,
            eventId,
            people: normalizedEvent.people,
            sessionSignals: normalizedEvent.sessionSignals,
            zones: cameraProfile.zones.map((zone: { id: string; personRoleHint?: string }) => ({
              id: zone.id,
              personRoleHint: zone.personRoleHint ?? "none",
            })),
          })
        : null;

    const vehicleContinuity =
      relevant && eventId && context.features.vehicleMemoryEnabled
        ? await persistEventVehicleAppearanceAndContinuity({
            supabase,
            organizationId,
            eventId,
            vehicles: normalizedEvent.vehicles,
          })
        : null;

    if (relevant && eventId && agentId) {
      await createMonitoriaClipUploadRequest({
        supabase,
        organizationId,
        cameraId,
        agentId,
        analysisJobId,
        eventId,
        planCode,
        startedAt,
        endedAt,
        agentVersion: "1.0.2",
        frozenClipPolicy: {
          enabled: context.retention.clipEnabled,
          durationSeconds: context.retention.clipDurationSeconds,
          retentionDays: context.retention.clipRetentionDays,
        },
      });
    }

    await persistAnalysisRoutingDecision({
      supabase,
      organizationId,
      cameraId,
      analysisJobId,
      eventId,
      outcome,
    });

    if (!relevant) {
      await supabase
        .from("storage_assets")
        .update({ expires_at: temporaryExpiresAt })
        .eq("analysis_job_id", analysisJobId);
    }

    await supabase.from("audit_logs").insert({
      organization_id: organizationId,
      actor_user_id: null,
      action: relevant ? "camera.event_analyzed" : "camera.no_relevant_change",
      entity_type: relevant ? "event" : "analysis_job",
      entity_id: relevant ? eventId : analysisJobId,
      metadata: sanitizePostgresJson({
        camera_id: cameraId,
        agent_id: agentId,
        agent_event_id: String(ingestion.agent_event_id),
        analysis_job_id: analysisJobId,
        profile_id: context.profileId,
        profile_version: context.profileVersion,
        plan_code: planCode,
        model: finalAnalysis.model,
        model_chain: modelChain,
        response_id: finalAnalysis.responseId,
        frame_count: frameCount,
        peak_motion_percent: Number((localMetrics as any).peakMotionPercent ?? 0),
        processing_source: source,
        frozen_context: true,
      }),
    });

    const completedAt = new Date().toISOString();
    const { data: finished, error: completeIngestionError } = await supabase
      .from("event_ingestions")
      .update({
        status: "completed",
        completed_at: completedAt,
        processing_heartbeat_at: completedAt,
        processing_lease_token: null,
        processing_lease_expires_at: null,
        next_retry_at: null,
        last_error: null,
        updated_at: completedAt,
      })
      .eq("id", ingestionId)
      .eq("processing_lease_token", leaseToken)
      .select("id")
      .maybeSingle();
    if (completeIngestionError || !finished) {
      throw new Error(
        `event_ingestion_complete_failed:${completeIngestionError?.message ?? "lease_lost"}`,
      );
    }

    return {
      source,
      analysisJobId,
      eventId,
      relevant,
      continuity,
      vehicleContinuity,
    };
  } catch (error) {
    const message = sanitizePostgresText(
      error instanceof Error ? error.message : String(error),
    ).slice(0, 1600);
    const now = new Date().toISOString();
    const terminal = isTerminalEvidenceError(message);

    await Promise.all([
      supabase
        .from("event_ingestions")
        .update({
          status: terminal ? "failed_terminal" : "retry",
          last_error: message,
          next_retry_at: terminal ? null : new Date(Date.now() + processingRetryDelayMs(ingestion.attempt_count)).toISOString(),
          processing_heartbeat_at: now,
          processing_lease_token: null,
          processing_lease_expires_at: null,
          updated_at: now,
        })
        .eq("id", ingestionId)
        .eq("processing_lease_token", leaseToken),
      supabase
        .from("analysis_jobs")
        .update({
          status: "failed",
          last_error: message,
          processing_heartbeat_at: now,
          updated_at: now,
        })
        .eq("id", analysisJobId)
        .neq("status", "completed"),
    ]);
    throw error;
  }
}
