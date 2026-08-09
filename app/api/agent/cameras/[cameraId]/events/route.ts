import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CameraProfileSchema } from "@/src/contracts/camera-profile";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";
import { normalizeAnalyzedEventZones } from "@/src/lib/event-analysis";
import { persistAnalysisRoutingDecision } from "@/src/lib/analysis-routing";
import { persistEventVehicleAppearanceAndContinuity } from "@/src/lib/event-vehicle-continuity";
import { persistEventPersonAppearanceAndContinuity } from "@/src/lib/event-continuity";
import { normalizeAnalysisPlan } from "@/src/lib/analysis-plans";
import { createMonitoriaClipUploadRequest } from "@/src/lib/clip-generation";
import {
  estimateVisionCostBreakdown,
  estimateVisionCostUsd,
} from "@/src/vision/cost";
import {
  analyzeEventForPlan,
  runVisionModel,
} from "@/src/vision/plan-runner";
import {
  getVisionPlan,
  otherValidationModel,
} from "@/src/vision/plans";
import {
  buildVisionPromptHash,
  VISION_PROMPT_VERSION,
} from "@/src/vision/prompt";
import type {
  AnalyzeEventInput,
  VisionAnalysisAttempt,
} from "@/src/vision/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_REQUEST_BYTES = 4_400_000;
const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_FRAME_BYTES = 3 * 1024 * 1024;

type RouteContext = {
  params: Promise<{ cameraId: string }>;
};

const IsoDateSchema = z
  .string()
  .min(20)
  .max(50)
  .refine((value) => !Number.isNaN(new Date(value).getTime()));

const FrameSchema = z
  .object({
    label: z.enum(["start", "peak", "end", "extra"]),
    capturedAt: IsoDateSchema,
    imageBase64: z.string().min(1000).max(2_900_000),
    width: z.number().int().positive().max(7680).nullable(),
    height: z.number().int().positive().max(4320).nullable(),
    byteSize: z.number().int().positive().max(MAX_FRAME_BYTES),
  })
  .strict();

const LocalMetricsSchema = z
  .object({
    planCode: z.enum(["basic", "standard", "intensive"]).optional(),
    peakMotionPercent: z.number().min(0).max(100),
    meanMotionPercent: z.number().min(0).max(100),
    rawPeakMotionPercent: z.number().min(0).max(100).optional(),
    durationSeconds: z.number().min(0).max(900),
    framesObserved: z.number().int().min(1).max(10000),
    motionStartThreshold: z.number().min(0).max(100).optional(),
    motionContinueThreshold: z.number().min(0).max(100).optional(),
    configuredStartThreshold: z.number().min(0).max(100).optional(),
    configuredContinueThreshold: z.number().min(0).max(100).optional(),
    effectiveStartThreshold: z.number().min(0).max(100).optional(),
    effectiveContinueThreshold: z.number().min(0).max(100).optional(),
    noiseP50Percent: z.number().min(0).max(100).optional(),
    noiseP90Percent: z.number().min(0).max(100).optional(),
    noiseP95Percent: z.number().min(0).max(100).optional(),
    ignoredPixelPercent: z.number().min(0).max(100).optional(),
    autoIgnoredCellCount: z.number().int().min(0).max(144).optional(),
    startConsecutiveFrames: z.number().int().min(1).max(60).optional(),
    endConsecutiveFrames: z.number().int().min(1).max(120).optional(),
    cooldownSeconds: z.number().min(0).max(3600).optional(),
    closeReason: z.string().trim().min(1).max(80),
  })
  .passthrough();

const EventSubmissionSchema = z
  .object({
    eventId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    startedAt: IsoDateSchema,
    endedAt: IsoDateSchema,
    localMetrics: LocalMetricsSchema,
    frames: z.array(FrameSchema).min(1).max(4),
  })
  .strict();

function isJpeg(buffer: Buffer) {
  return (
    buffer.length >= 4 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[buffer.length - 2] === 0xff &&
    buffer[buffer.length - 1] === 0xd9
  );
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

function boundedDays(value: unknown, fallback: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(number)));
}

function boundedInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.floor(parsed)
    : fallback;
}

function envBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function promptCacheKey(input: {
  cameraId: string;
  profileVersion: number;
  planCode: string;
  modelGroup: string;
}) {
  const digest = createHash("sha256")
    .update(
      [
        input.cameraId,
        input.profileVersion,
        input.planCode,
        input.modelGroup,
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 48);

  return `mtr_${digest}`;
}

function distinctAttempts(attempts: VisionAnalysisAttempt[]) {
  const seen = new Set<string>();

  return attempts.filter((attempt) => {
    if (seen.has(attempt.responseId)) return false;
    seen.add(attempt.responseId);
    return true;
  });
}

async function shouldRunAbTest(
  supabase: any,
  cameraId: string,
) {
  if (!envBoolean(process.env.VISION_AB_TEST_ENABLED)) {
    return false;
  }

  const samplePercent = Math.max(
    0,
    Math.min(
      100,
      boundedInteger(
        process.env.VISION_AB_TEST_SAMPLE_PERCENT,
        100,
      ),
    ),
  );

  if (Math.random() * 100 >= samplePercent) {
    return false;
  }

  const maximum = Math.max(
    1,
    boundedInteger(
      process.env.VISION_AB_TEST_MAX_PER_CAMERA,
      50,
    ),
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
  const cost = estimateVisionCostBreakdown(
    input.attempt.model,
    input.attempt.usage,
  );

  const { error } = await supabase.from("usage_events").insert({
    organization_id: input.organizationId,
    camera_id: input.cameraId,
    analysis_job_id: input.analysisJobId,
    provider: input.attempt.provider,
    model: input.attempt.model,
    input_tokens: input.attempt.usage.inputTokens,
    cached_input_tokens:
      input.attempt.usage.cachedInputTokens,
    output_tokens: input.attempt.usage.outputTokens,
    reasoning_tokens: input.attempt.usage.reasoningTokens,
    analysis_plan_code: input.planCode,
    estimated_cost_usd: cost.totalCostUsd,
    pricing: cost.rates,
    metadata: {
      purpose:
        input.attempt.role === "ab_candidate"
          ? "vision_ab_candidate"
          : "vision_escalation_primary",
      role: input.attempt.role,
      response_id: input.attempt.responseId,
      latency_ms: input.attempt.latencyMs,
      cost_breakdown: cost,
    },
  });

  if (error) {
    console.error(
      "Falha ao registrar chamada auxiliar:",
      error.message,
    );
  }
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

  if (declaredLength > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { ok: false, error: "event_payload_too_large" },
      { status: 413 },
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = EventSubmissionSchema.safeParse(rawBody);
  if (!parsed.success) {
    console.error(
      "Evento local rejeitado:",
      parsed.error.issues.map((issue) => issue.message).join("; "),
    );
    return NextResponse.json(
      { ok: false, error: "invalid_event_payload" },
      { status: 400 },
    );
  }

  const input = parsed.data;
  const planCode = normalizeAnalysisPlan(
    authenticated.camera.analysisPlanCode,
  );
  const visionPlan = getVisionPlan(planCode);

  if (input.frames.length > visionPlan.maximumFrames) {
    return NextResponse.json(
      { ok: false, error: "too_many_frames_for_plan" },
      { status: 400 },
    );
  }

  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);

  if (
    endedAt.getTime() < startedAt.getTime() ||
    endedAt.getTime() - startedAt.getTime() > 15 * 60 * 1000
  ) {
    return NextResponse.json(
      { ok: false, error: "invalid_event_window" },
      { status: 400 },
    );
  }

  const uniqueLabels = new Set(input.frames.map((frame) => frame.label));
  if (uniqueLabels.size !== input.frames.length) {
    return NextResponse.json(
      { ok: false, error: "duplicate_frame_labels" },
      { status: 400 },
    );
  }

  let totalBytes = 0;
  const decodedFrames: Array<{
    label: (typeof input.frames)[number]["label"];
    capturedAt: string;
    width: number | null;
    height: number | null;
    buffer: Buffer;
  }> = [];

  try {
    for (const frame of input.frames) {
      const buffer = decodeBase64(frame.imageBase64);

      if (
        buffer.length < 1024 ||
        buffer.length > MAX_FRAME_BYTES ||
        buffer.length !== frame.byteSize ||
        !isJpeg(buffer)
      ) {
        throw new Error("invalid_jpeg");
      }

      totalBytes += buffer.length;
      decodedFrames.push({
        label: frame.label,
        capturedAt: new Date(frame.capturedAt).toISOString(),
        width: frame.width,
        height: frame.height,
        buffer,
      });
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_event_frame" },
      { status: 400 },
    );
  }

  if (totalBytes > MAX_TOTAL_FRAME_BYTES) {
    return NextResponse.json(
      { ok: false, error: "event_frames_too_large" },
      { status: 413 },
    );
  }

  const supabase = authenticated.supabase;

  if (input.sessionId) {
    const { data: session, error: sessionError } = await supabase
      .from("capture_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("agent_id", authenticated.agent.id)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json(
        { ok: false, error: "invalid_capture_session" },
        { status: 400 },
      );
    }
  }

  const { data: existingJob, error: existingError } = await supabase
    .from("analysis_jobs")
    .select("id,status,attempt_count,updated_at")
    .eq("camera_id", cameraId)
    .eq("agent_event_id", input.eventId)
    .maybeSingle();

  if (existingError) {
    return NextResponse.json(
      { ok: false, error: "event_idempotency_unavailable" },
      { status: 500 },
    );
  }

  if (existingJob?.status === "completed") {
    const { data: existingEvent } = await supabase
      .from("events")
      .select("id,summary,primary_event_type,confidence,requires_review,started_at,ended_at")
      .eq("analysis_job_id", existingJob.id)
      .maybeSingle();

    const duplicateClipRequest = existingEvent
      ? await createMonitoriaClipUploadRequest({
          supabase,
          organizationId: authenticated.camera.organizationId,
          cameraId,
          agentId: authenticated.agent.id,
          analysisJobId: String(existingJob.id),
          eventId: String(existingEvent.id),
          planCode,
          startedAt: String(existingEvent.started_at),
          endedAt: String(existingEvent.ended_at),
        })
      : null;

    return NextResponse.json(
      {
        ok: true,
        duplicate: true,
        pending: false,
        analysisJobId: String(existingJob.id),
        relevant: Boolean(existingEvent),
        eventId: existingEvent ? String(existingEvent.id) : null,
        summary: existingEvent ? String(existingEvent.summary) : null,
        type: existingEvent
          ? String(existingEvent.primary_event_type)
          : "no_relevant_change",
        confidence: existingEvent
          ? Number(existingEvent.confidence)
          : null,
        requiresReview: existingEvent
          ? Boolean(existingEvent.requires_review)
          : false,
        clipRequest: duplicateClipRequest,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (existingJob?.status === "processing") {
    const updatedAt = new Date(String(existingJob.updated_at)).getTime();

    if (Date.now() - updatedAt < 3 * 60 * 1000) {
      return NextResponse.json(
        {
          ok: true,
          duplicate: true,
          pending: true,
          analysisJobId: String(existingJob.id),
          relevant: null,
          eventId: null,
          summary: null,
          type: null,
          confidence: null,
          requiresReview: false,
        },
        { status: 202, headers: { "Cache-Control": "no-store" } },
      );
    }
  }

  const [profileResult, siteResult, retentionResult] =
    await Promise.all([
      supabase
        .from("camera_profiles")
        .select(
          "id,version,environment_description,monitoring_goals,ignore_instructions",
        )
        .eq("organization_id", authenticated.camera.organizationId)
        .eq("camera_id", cameraId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("sites")
        .select("timezone")
        .eq("id", authenticated.camera.siteId)
        .eq("organization_id", authenticated.camera.organizationId)
        .maybeSingle(),
      supabase
        .from("retention_policies")
        .select("temporary_frame_days,keyframe_days,metadata_days")
        .eq("organization_id", authenticated.camera.organizationId)
        .maybeSingle(),
    ]);

  const profile = profileResult.data;

  if (profileResult.error || !profile) {
    return NextResponse.json(
      { ok: false, error: "active_camera_profile_required" },
      { status: 409 },
    );
  }

  if (siteResult.error || !siteResult.data) {
    return NextResponse.json(
      { ok: false, error: "camera_site_unavailable" },
      { status: 500 },
    );
  }

  const { data: zoneRows, error: zonesError } = await supabase
    .from("camera_zones")
    .select("id,name,zone_type,person_role_hint,polygon,description")
    .eq("organization_id", authenticated.camera.organizationId)
    .eq("camera_profile_id", profile.id)
    .order("sort_order", { ascending: true });

  if (zonesError) {
    return NextResponse.json(
      { ok: false, error: "active_zones_unavailable" },
      { status: 500 },
    );
  }

  let visualEntityRows: Array<Record<string, unknown>> = [];

  if (authenticated.camera.visualStateEnabled) {
    const {
      data: configuredVisualEntities,
      error: visualEntitiesError,
    } = await supabase
      .from("camera_visual_entities")
      .select(
        "id,name,entity_type,polygon,state_definitions,primary_operational_marker,min_confidence,reliability",
      )
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("camera_profile_id", profile.id)
      .eq("enabled", true)
      .order("sort_order", { ascending: true });

    if (visualEntitiesError) {
      return NextResponse.json(
        { ok: false, error: "visual_entities_unavailable" },
        { status: 500 },
      );
    }

    visualEntityRows = configuredVisualEntities ?? [];
  }

  let staffProfileRows: Array<Record<string, unknown>> = [];

  if (authenticated.camera.shortMemoryEnabled) {
    const {
      data: configuredStaffProfiles,
      error: staffProfilesError,
    } = await supabase
      .from("camera_staff_profiles")
      .select(
        "id,label,description,appearance_signature,zone_ids,min_similarity",
      )
      .eq("organization_id", authenticated.camera.organizationId)
      .eq("camera_id", cameraId)
      .eq("enabled", true)
      .order("sort_order", { ascending: true });

    if (staffProfilesError) {
      return NextResponse.json(
        { ok: false, error: "staff_profiles_unavailable" },
        { status: 500 },
      );
    }

    staffProfileRows = configuredStaffProfiles ?? [];
  }

  let cameraProfile;

  try {
    cameraProfile = CameraProfileSchema.parse({
      cameraId,
      profileVersion: Number(profile.version),
      environmentDescription: String(profile.environment_description),
      monitoringGoals: Array.isArray(profile.monitoring_goals)
        ? profile.monitoring_goals.map((goal: unknown) => String(goal))
        : [],
      ignoreInstructions: Array.isArray(profile.ignore_instructions)
        ? profile.ignore_instructions.map((item: unknown) => String(item))
        : [],
      intelligence: {
        mode: authenticated.camera.intelligenceMode,
        sceneDensity: authenticated.camera.sceneDensity,
        multiEntityEnabled: authenticated.camera.multiEntityEnabled,
        vehicleMemoryEnabled: authenticated.camera.vehicleMemoryEnabled,
        complexityRoutingEnabled:
          authenticated.camera.complexityRoutingEnabled,
        verificationEnabled: authenticated.camera.verificationEnabled,
        strongThreshold:
          authenticated.camera.complexityStrongThreshold,
        verificationThreshold:
          authenticated.camera.verificationThreshold,
        vehicleMemoryWindowMinutes:
          authenticated.camera.vehicleMemoryWindowMinutes,
        vehicleSimilarityThreshold:
          authenticated.camera.vehicleSimilarityThreshold,
      },
      timezone: String(siteResult.data.timezone),
      zones: (zoneRows ?? []).map((zone: any) => ({
        id: String(zone.id),
        name: String(zone.name),
        type: String(zone.zone_type),
        personRoleHint: String(
          zone.person_role_hint ?? "none",
        ),
        polygon: zone.polygon,
        description: String(zone.description ?? ""),
      })),
      staffProfiles: (staffProfileRows ?? []).map(
        (staffProfile: any) => ({
          id: String(staffProfile.id),
          label: String(staffProfile.label),
          description: String(staffProfile.description),
          appearanceSignature:
            staffProfile.appearance_signature ?? {},
          zoneIds: Array.isArray(staffProfile.zone_ids)
            ? staffProfile.zone_ids.map((id: unknown) => String(id))
            : [],
          minSimilarity: Number(
            staffProfile.min_similarity ?? 0.74,
          ),
        }),
      ),
      visualEntities: (visualEntityRows ?? []).map(
        (entity: any) => ({
          id: String(entity.id),
          name: String(entity.name),
          type: String(entity.entity_type),
          polygon: entity.polygon,
          stateDefinitions: entity.state_definitions,
          primaryOperationalMarker: Boolean(
            entity.primary_operational_marker,
          ),
          minConfidence: Number(
            entity.min_confidence ?? 0.82,
          ),
          reliability: String(
            entity.reliability ?? "medium",
          ),
        }),
      ),
    });
  } catch (profileError) {
    console.error("Perfil ativo inválido:", profileError);
    return NextResponse.json(
      { ok: false, error: "invalid_active_camera_profile" },
      { status: 500 },
    );
  }

  const localMetrics = {
    ...input.localMetrics,
    planCode,
  };

  const promptHash = buildVisionPromptHash(
    cameraProfile,
    visionPlan.mode,
  );

  let analysisJobId = existingJob ? String(existingJob.id) : null;

  if (existingJob) {
    const { error: retryError } = await supabase
      .from("analysis_jobs")
      .update({
        status: "processing",
        capture_session_id: input.sessionId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        profile_id: profile.id,
        profile_version: Number(profile.version),
        prompt_version: VISION_PROMPT_VERSION,
        prompt_hash: promptHash,
        local_metrics: localMetrics,
        analysis_plan_code: planCode,
        source_agent_id: authenticated.agent.id,
        attempt_count: Number(existingJob.attempt_count ?? 0) + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJob.id);

    if (retryError) {
      return NextResponse.json(
        { ok: false, error: "analysis_job_retry_failed" },
        { status: 500 },
      );
    }
  } else {
    const { data: job, error: jobError } = await supabase
      .from("analysis_jobs")
      .insert({
        organization_id: authenticated.camera.organizationId,
        camera_id: cameraId,
        capture_session_id: input.sessionId,
        status: "processing",
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        profile_id: profile.id,
        profile_version: Number(profile.version),
        prompt_version: VISION_PROMPT_VERSION,
        prompt_hash: promptHash,
        local_metrics: localMetrics,
        analysis_plan_code: planCode,
        source_agent_id: authenticated.agent.id,
        agent_event_id: input.eventId,
        attempt_count: 1,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { ok: false, error: "analysis_job_create_failed" },
        { status: 500 },
      );
    }

    analysisJobId = String(job.id);
  }

  if (!analysisJobId) {
    return NextResponse.json(
      { ok: false, error: "analysis_job_missing" },
      { status: 500 },
    );
  }

  const retention = retentionResult.data;
  const temporaryDays = boundedDays(
    retention?.temporary_frame_days,
    3,
    30,
  );
  const keyframeDays = boundedDays(
    retention?.keyframe_days,
    90,
    3650,
  );
  const metadataDays = boundedDays(
    retention?.metadata_days,
    90,
    3650,
  );

  const temporaryExpiresAt = new Date(
    Date.now() + temporaryDays * 86400000,
  );
  const keyframeExpiresAt = new Date(
    Date.now() + keyframeDays * 86400000,
  );
  const eventExpiresAt = new Date(
    Date.now() + metadataDays * 86400000,
  );

  const year = startedAt.getUTCFullYear();
  const month = String(startedAt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(startedAt.getUTCDate()).padStart(2, "0");

  try {
    const eventFrames = [];

    for (const frame of decodedFrames) {
      const storagePath = [
        authenticated.camera.organizationId,
        cameraId,
        String(year),
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

      if (uploadError) {
        throw new Error(
          `Falha no upload do quadro ${frame.label}: ${uploadError.message}`,
        );
      }

      const { error: assetError } = await supabase
        .from("storage_assets")
        .upsert(
          {
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
            expires_at: temporaryExpiresAt.toISOString(),
            deleted_at: null,
          },
          { onConflict: "bucket,storage_path" },
        );

      if (assetError) {
        throw new Error(
          `Falha ao registrar quadro ${frame.label}: ${assetError.message}`,
        );
      }

      eventFrames.push({
        label: frame.label,
        capturedAt: frame.capturedAt,
        imageUrl: `data:image/jpeg;base64,${frame.buffer.toString("base64")}`,
      });
    }

    const cacheKey = promptCacheKey({
      cameraId,
      profileVersion: Number(profile.version),
      planCode,
      modelGroup: `${visionPlan.mode}:${promptHash.slice(0, 12)}`,
    });

    const [recentEventsResult, recentStatesResult] = await Promise.all([
      supabase
        .from("events")
        .select("started_at,ended_at,headline,primary_event_type,summary")
        .eq("organization_id", authenticated.camera.organizationId)
        .eq("camera_id", cameraId)
        .lt("started_at", startedAt.toISOString())
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("visual_entity_current_states")
        .select("entity_id,current_state,last_observed_at,confidence")
        .eq("organization_id", authenticated.camera.organizationId)
        .eq("camera_id", cameraId),
    ]);

    const visionInput: AnalyzeEventInput = {
      organizationId: authenticated.camera.organizationId,
      eventId: input.eventId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      profile: cameraProfile,
      frames: eventFrames,
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
      recentVisualStates: (recentStatesResult.data ?? []).map(
        (state: any) => ({
          entityId: String(state.entity_id),
          state: String(state.current_state),
          lastObservedAt: String(state.last_observed_at),
          confidence: Number(state.confidence ?? 0),
        }),
      ),
    };

    const outcome = await analyzeEventForPlan(
      visionInput,
      planCode,
      {
        allowVerification: async () => {
          const { data, error } = await supabase.rpc(
            "reserve_monitoria_analysis_verification",
            {
              p_analysis_job_id: analysisJobId,
              p_camera_id: cameraId,
              p_organization_id:
                authenticated.camera.organizationId,
              p_plan_code: planCode,
            },
          );

          if (error) {
            console.error(
              "Falha ao reservar verificação seletiva:",
              error.message,
            );
            return false;
          }

          return Boolean(data);
        },
      },
    );

    const attempts = [...outcome.attempts];
    const runAb = await shouldRunAbTest(supabase, cameraId);

    if (runAb) {
      const validationModel = otherValidationModel(
        outcome.final.model,
      );

      if (!attempts.some((attempt) => attempt.model === validationModel)) {
        try {
          attempts.push(
            await runVisionModel(visionInput, {
              model: validationModel,
              detail: visionPlan.detail,
              maxOutputTokens: Math.max(
                visionPlan.maxOutputTokens,
                2400,
              ),
              role: "ab_candidate",
            }),
          );
        } catch (candidateError) {
          console.error(
            "A chamada experimental falhou sem afetar o evento:",
            candidateError,
          );
        }
      }
    }

    const uniqueAttempts = distinctAttempts(attempts);
    const finalAnalysis = outcome.final;
    const finalAttemptRole =
      outcome.attempts.at(-1)?.role ?? "primary";
    const allowedZones = new Set(
      cameraProfile.zones.map((zone) => zone.id),
    );

    const normalizedEvent = normalizeAnalyzedEventZones(
      finalAnalysis.event,
      allowedZones,
      cameraProfile.visualEntities,
    );

    const finalCost = estimateVisionCostBreakdown(
      finalAnalysis.model,
      finalAnalysis.usage,
    );

    const { data: completed, error: completionError } =
      await supabase.rpc("complete_agent_analysis_job", {
        p_job_id: analysisJobId,
        p_analyzed_event: normalizedEvent,
        p_provider: finalAnalysis.provider,
        p_model: finalAnalysis.model,
        p_response_id: finalAnalysis.responseId,
        p_input_tokens: finalAnalysis.usage.inputTokens,
        p_output_tokens: finalAnalysis.usage.outputTokens,
        p_latency_ms: finalAnalysis.latencyMs,
        p_estimated_cost_usd: finalCost.totalCostUsd,
        p_event_expires_at: eventExpiresAt.toISOString(),
        p_keyframe_expires_at: keyframeExpiresAt.toISOString(),
      });

    const result = Array.isArray(completed) ? completed[0] : completed;

    if (completionError || !result) {
      throw new Error(
        completionError?.message ??
          "A finalização atômica não retornou resultado.",
      );
    }

    const modelChain = uniqueAttempts.map((attempt) => ({
      role: attempt.role,
      model: attempt.model,
      responseId: attempt.responseId,
      latencyMs: attempt.latencyMs,
      usage: attempt.usage,
      cost: estimateVisionCostUsd(
        attempt.model,
        attempt.usage,
      ),
    }));

    await supabase
      .from("analysis_jobs")
      .update({
        cached_input_tokens:
          finalAnalysis.usage.cachedInputTokens,
        reasoning_tokens:
          finalAnalysis.usage.reasoningTokens,
        analysis_plan_code: planCode,
        model_chain: modelChain,
      })
      .eq("id", analysisJobId);

    await supabase
      .from("usage_events")
      .update({
        cached_input_tokens:
          finalAnalysis.usage.cachedInputTokens,
        reasoning_tokens:
          finalAnalysis.usage.reasoningTokens,
        analysis_plan_code: planCode,
        pricing: finalCost.rates,
        estimated_cost_usd: finalCost.totalCostUsd,
        metadata: {
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
        },
      })
      .eq("analysis_job_id", analysisJobId);

    for (const attempt of uniqueAttempts) {
      if (attempt.responseId === finalAnalysis.responseId) continue;

      await recordAuxiliaryUsage(supabase, {
        organizationId: authenticated.camera.organizationId,
        cameraId,
        analysisJobId,
        planCode,
        attempt,
      });
    }

    const nano = uniqueAttempts.find((attempt) =>
      attempt.model.includes("nano"),
    );
    const mini = uniqueAttempts.find((attempt) =>
      attempt.model.includes("mini"),
    );

    if (nano && mini) {
      const nanoCost = estimateVisionCostBreakdown(
        nano.model,
        nano.usage,
      );
      const miniCost = estimateVisionCostBreakdown(
        mini.model,
        mini.usage,
      );

      const { error: experimentError } = await supabase
        .from("vision_model_experiments")
        .upsert(
          {
            organization_id:
              authenticated.camera.organizationId,
            camera_id: cameraId,
            analysis_job_id: analysisJobId,
            plan_code: planCode,
            nano_model: nano.model,
            mini_model: mini.model,
            nano_payload: normalizeAnalyzedEventZones(
              nano.event,
              allowedZones,
              cameraProfile.visualEntities,
            ),
            mini_payload: normalizeAnalyzedEventZones(
              mini.event,
              allowedZones,
              cameraProfile.visualEntities,
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

      if (experimentError) {
        console.error(
          "Falha ao salvar comparação A/B:",
          experimentError.message,
        );
      }
    }

    const relevant = Boolean(result.relevant);
    const eventId = result.event_id
      ? String(result.event_id)
      : null;

    const continuity =
      relevant &&
      eventId &&
      authenticated.camera.shortMemoryEnabled
        ? await persistEventPersonAppearanceAndContinuity({
            supabase,
            organizationId:
              authenticated.camera.organizationId,
            eventId,
            people: normalizedEvent.people,
            sessionSignals: normalizedEvent.sessionSignals,
            zones: cameraProfile.zones.map((zone) => ({
              id: zone.id,
              personRoleHint: zone.personRoleHint,
            })),
          })
        : null;

    const vehicleContinuity =
      relevant &&
      eventId &&
      authenticated.camera.vehicleMemoryEnabled
        ? await persistEventVehicleAppearanceAndContinuity({
            supabase,
            organizationId:
              authenticated.camera.organizationId,
            eventId,
            vehicles: normalizedEvent.vehicles,
          })
        : null;

    const clipRequest =
      relevant && eventId
        ? await createMonitoriaClipUploadRequest({
            supabase,
            organizationId:
              authenticated.camera.organizationId,
            cameraId,
            agentId: authenticated.agent.id,
            analysisJobId,
            eventId,
            planCode,
            startedAt: startedAt.toISOString(),
            endedAt: endedAt.toISOString(),
          })
        : null;

    await persistAnalysisRoutingDecision({
      supabase,
      organizationId: authenticated.camera.organizationId,
      cameraId,
      analysisJobId,
      eventId,
      outcome,
    });

    if (!relevant) {
      await supabase
        .from("storage_assets")
        .update({ expires_at: temporaryExpiresAt.toISOString() })
        .eq("analysis_job_id", analysisJobId);
    }

    await supabase.from("audit_logs").insert({
      organization_id: authenticated.camera.organizationId,
      actor_user_id: null,
      action: relevant
        ? "camera.event_analyzed"
        : "camera.no_relevant_change",
      entity_type: relevant ? "event" : "analysis_job",
      entity_id: relevant ? eventId : analysisJobId,
      metadata: {
        camera_id: cameraId,
        agent_id: authenticated.agent.id,
        agent_event_id: input.eventId,
        analysis_job_id: analysisJobId,
        profile_id: String(profile.id),
        profile_version: Number(profile.version),
        plan_code: planCode,
        model: finalAnalysis.model,
        model_chain: modelChain,
        response_id: finalAnalysis.responseId,
        frame_count: decodedFrames.length,
        peak_motion_percent:
          input.localMetrics.peakMotionPercent,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        duplicate: false,
        pending: false,
        analysisJobId,
        relevant,
        eventId,
        summary: relevant ? normalizedEvent.summary : null,
        type: normalizedEvent.primaryEventType,
        confidence: normalizedEvent.confidence,
        requiresReview: normalizedEvent.requiresReview,
        continuity,
        vehicleContinuity,
        routing: outcome.routing,
        clipRequest,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (analysisError) {
    const message = errorMessage(analysisError).slice(0, 1800);

    console.error(
      `Falha na análise contínua ${analysisJobId}:`,
      analysisError,
    );

    await supabase
      .from("analysis_jobs")
      .update({
        status: "failed",
        last_error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", analysisJobId);

    return NextResponse.json(
      { ok: false, error: "continuous_analysis_failed" },
      { status: 500 },
    );
  }
}
