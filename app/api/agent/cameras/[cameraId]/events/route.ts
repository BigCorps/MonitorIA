import { Buffer } from "node:buffer";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CameraProfileSchema } from "@/src/contracts/camera-profile";
import { authenticateAgentCamera } from "@/src/lib/agent-camera";
import { normalizeAnalyzedEventZones } from "@/src/lib/event-analysis";
import { createVisionProvider } from "@/src/vision/create-provider";
import { estimateVisionCostUsd } from "@/src/vision/cost";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

const EventSubmissionSchema = z
  .object({
    eventId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    startedAt: IsoDateSchema,
    endedAt: IsoDateSchema,
    localMetrics: z
      .object({
        peakMotionPercent: z.number().min(0).max(100),
        meanMotionPercent: z.number().min(0).max(100),
        durationSeconds: z.number().min(0).max(900),
        framesObserved: z.number().int().min(1).max(10000),
        motionStartThreshold: z.number().min(0).max(100),
        motionContinueThreshold: z.number().min(0).max(100),
        closeReason: z.string().trim().min(1).max(80),
      })
      .strict(),
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

  const expected = normalized.replace(/=+$/, "");
  const actual = buffer.toString("base64").replace(/=+$/, "");

  if (expected !== actual) {
    throw new Error("invalid_base64");
  }

  return buffer;
}

function boundedDays(value: unknown, fallback: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(number)));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
    console.error(
      "Falha ao consultar idempotência do evento:",
      existingError.message,
    );
    return NextResponse.json(
      { ok: false, error: "event_idempotency_unavailable" },
      { status: 500 },
    );
  }

  if (existingJob?.status === "completed") {
    const { data: existingEvent } = await supabase
      .from("events")
      .select(
        "id,summary,primary_event_type,confidence,requires_review",
      )
      .eq("analysis_job_id", existingJob.id)
      .maybeSingle();

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
        {
          status: 202,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
  }

  const [
    profileResult,
    siteResult,
    retentionResult,
  ] = await Promise.all([
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
    .select("id,name,zone_type,polygon,description")
    .eq("organization_id", authenticated.camera.organizationId)
    .eq("camera_profile_id", profile.id)
    .order("sort_order", { ascending: true });

  if (zonesError) {
    console.error("Falha ao carregar zonas ativas:", zonesError.message);
    return NextResponse.json(
      { ok: false, error: "active_zones_unavailable" },
      { status: 500 },
    );
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
      timezone: String(siteResult.data.timezone),
      zones: (zoneRows ?? []).map((zone: any) => ({
        id: String(zone.id),
        name: String(zone.name),
        type: String(zone.zone_type),
        polygon: zone.polygon,
        description: String(zone.description ?? ""),
      })),
    });
  } catch (profileError) {
    console.error("Perfil ativo inválido:", profileError);
    return NextResponse.json(
      { ok: false, error: "invalid_active_camera_profile" },
      { status: 500 },
    );
  }

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
        local_metrics: input.localMetrics,
        source_agent_id: authenticated.agent.id,
        attempt_count: Number(existingJob.attempt_count ?? 0) + 1,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingJob.id);

    if (retryError) {
      console.error("Falha ao reabrir análise:", retryError.message);
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
        local_metrics: input.localMetrics,
        source_agent_id: authenticated.agent.id,
        agent_event_id: input.eventId,
        attempt_count: 1,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error(
        "Falha ao criar análise do evento:",
        jobError?.message,
      );
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
    365,
    3650,
  );
  const metadataDays = boundedDays(
    retention?.metadata_days,
    365,
    3650,
  );

  const temporaryExpiresAt = new Date(
    Date.now() + temporaryDays * 24 * 60 * 60 * 1000,
  );
  const keyframeExpiresAt = new Date(
    Date.now() + keyframeDays * 24 * 60 * 60 * 1000,
  );
  const eventExpiresAt = new Date(
    Date.now() + metadataDays * 24 * 60 * 60 * 1000,
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

    const provider = createVisionProvider();
    const analysis = await provider.analyzeEvent({
      organizationId: authenticated.camera.organizationId,
      eventId: input.eventId,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      profile: cameraProfile,
      frames: eventFrames,
      localMetrics: {
        peakMotionPercent: input.localMetrics.peakMotionPercent,
        meanMotionPercent: input.localMetrics.meanMotionPercent,
        durationSeconds: input.localMetrics.durationSeconds,
      },
    });

    const allowedZones = new Set(
      cameraProfile.zones.map((zone) => zone.id),
    );
    const normalizedEvent = normalizeAnalyzedEventZones(
      analysis.event,
      allowedZones,
    );

    const estimatedCostUsd = estimateVisionCostUsd(
      analysis.model,
      analysis.usage,
    );

    const { data: completed, error: completionError } =
      await supabase.rpc("complete_agent_analysis_job", {
        p_job_id: analysisJobId,
        p_analyzed_event: normalizedEvent,
        p_provider: analysis.provider,
        p_model: analysis.model,
        p_response_id: analysis.responseId,
        p_input_tokens: analysis.usage.inputTokens,
        p_output_tokens: analysis.usage.outputTokens,
        p_latency_ms: analysis.latencyMs,
        p_estimated_cost_usd: estimatedCostUsd,
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

    const relevant = Boolean(result.relevant);
    const eventId = result.event_id ? String(result.event_id) : null;

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
        provider: analysis.provider,
        model: analysis.model,
        response_id: analysis.responseId,
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
