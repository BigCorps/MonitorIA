import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ sessionId: string }> };

const PatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("processing_started"),
  }).strict(),
  z.object({
    action: z.literal("submission_complete"),
    candidateCount: z.number().int().min(0).max(10000),
    eventCount: z.number().int().min(0).max(10000),
    mappingMs: z.number().int().min(0).max(86_400_000),
  }).strict(),
  z.object({
    action: z.literal("failed"),
    errorCode: z.string().trim().max(120),
    errorMessage: z.string().trim().max(1200),
  }).strict(),
  z.object({
    action: z.literal("cancelled"),
  }).strict(),
]);

async function authorizeSession(sessionId: string) {
  const user = await getAuthenticatedUser();
  if (!user) return { error: "authentication_required", status: 401 } as const;

  const organization = await getCurrentOrganization(user.id);
  if (!organization) {
    return { error: "organization_not_found", status: 404 } as const;
  }

  const admin = createAdminClient();
  const { data: session, error } = await admin
    .from("recording_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error || !session) {
    return { error: "recording_session_not_found", status: 404 } as const;
  }

  return { user, organization, admin, session } as const;
}

export async function PATCH(request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return NextResponse.json({ ok: false, error: "invalid_session_id" }, { status: 400 });
  }

  const authorized = await authorizeSession(sessionId);
  if ("error" in authorized) {
    return NextResponse.json(
      { ok: false, error: authorized.error },
      { status: authorized.status },
    );
  }

  if (!["owner", "admin"].includes(authorized.organization.role)) {
    return NextResponse.json(
      { ok: false, error: "not_authorized" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_recording_session_update" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { updated_at: now };

  if (body.action === "processing_started") {
    update.status = "processing";
    update.started_processing_at =
      authorized.session.started_processing_at ?? now;
  } else if (body.action === "submission_complete") {
    update.status = body.eventCount === 0 ? "completed" : "processing";
    update.candidate_count = body.candidateCount;
    update.event_count = body.eventCount;
    update.mapping_ms = body.mappingMs;
    if (body.eventCount === 0) update.completed_at = now;
  } else if (body.action === "failed") {
    update.status = "failed";
    update.error_code = body.errorCode;
    update.error_message = body.errorMessage;
    update.failed_at = now;
  } else {
    update.status = "cancelled";
    update.completed_at = now;
  }

  const { error } = await authorized.admin
    .from("recording_sessions")
    .update(update)
    .eq("id", sessionId)
    .eq("organization_id", authorized.organization.id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "recording_session_update_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(_request: Request, context: RouteContext) {
  const { sessionId } = await context.params;
  if (!z.string().uuid().safeParse(sessionId).success) {
    return NextResponse.json({ ok: false, error: "invalid_session_id" }, { status: 400 });
  }

  const authorized = await authorizeSession(sessionId);
  if ("error" in authorized) {
    return NextResponse.json(
      { ok: false, error: authorized.error },
      { status: authorized.status },
    );
  }

  const [jobsResult, eventsResult] = await Promise.all([
    authorized.admin
      .from("analysis_jobs")
      .select("id,status,last_error,created_at,updated_at")
      .eq("recording_session_id", sessionId)
      .order("created_at", { ascending: true }),
    authorized.admin
      .from("events")
      .select(
        "id,headline,summary,confidence,requires_review,started_at,ended_at,primary_event_type,created_at",
      )
      .eq("recording_session_id", sessionId)
      .is("deleted_at", null)
      .order("started_at", { ascending: true }),
  ]);

  if (jobsResult.error || eventsResult.error) {
    return NextResponse.json(
      { ok: false, error: "recording_results_unavailable" },
      { status: 500 },
    );
  }

  const jobs = jobsResult.data ?? [];
  const events = eventsResult.data ?? [];
  const eventIds = events.map((event: any) => String(event.id));
  const assets =
    eventIds.length > 0
      ? await authorized.admin
          .from("storage_assets")
          .select("id,event_id,kind,frame_label,status")
          .in("event_id", eventIds)
          .eq("status", "ready")
          .is("deleted_at", null)
      : { data: [], error: null };

  const assetsByEvent = new Map<string, any[]>();
  for (const asset of assets.data ?? []) {
    const eventId = String((asset as any).event_id ?? "");
    const list = assetsByEvent.get(eventId) ?? [];
    list.push(asset);
    assetsByEvent.set(eventId, list);
  }

  const terminal = new Set(["completed", "failed"]);
  const failedJobs = jobs.filter((job: any) => job.status === "failed");
  const terminalCount = jobs.filter((job: any) => terminal.has(String(job.status))).length;
  const expected = Number(authorized.session.event_count ?? 0);

  let sessionStatus = String(authorized.session.status);
  if (
    expected > 0 &&
    jobs.length >= expected &&
    terminalCount >= expected &&
    ["reserved", "processing"].includes(sessionStatus)
  ) {
    sessionStatus = failedJobs.length ? "completed_with_errors" : "completed";
    await authorized.admin
      .from("recording_sessions")
      .update({
        status: sessionStatus,
        completed_event_count: events.length,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessionId);
  }

  return NextResponse.json(
    {
      ok: true,
      session: {
        id: sessionId,
        cameraId: String(authorized.session.camera_id),
        status: sessionStatus,
        durationSeconds: Number(authorized.session.duration_seconds),
        sourceStartedAt: String(authorized.session.source_started_at),
        sourceFilename: String(authorized.session.source_filename),
        candidateCount: Number(authorized.session.candidate_count ?? 0),
        eventCount: expected,
        completedEventCount: events.length,
        quotaSource: String(authorized.session.quota_source),
        quotaLimitSeconds: Number(authorized.session.quota_limit_seconds),
        mappingMs:
          authorized.session.mapping_ms === null
            ? null
            : Number(authorized.session.mapping_ms),
      },
      jobs: jobs.map((job: any) => ({
        id: String(job.id),
        status: String(job.status),
        error: job.last_error ? String(job.last_error) : null,
      })),
      events: events.map((event: any) => {
        const media = assetsByEvent.get(String(event.id)) ?? [];
        const images = media.filter(
          (asset) => String(asset.kind) === "event_keyframe",
        );
        const clip = media.find(
          (asset) => String(asset.kind) === "preserved_clip",
        );

        return {
          id: String(event.id),
          headline: String(event.headline ?? ""),
          summary: String(event.summary ?? ""),
          confidence: Number(event.confidence ?? 0),
          requiresReview: Boolean(event.requires_review),
          startedAt: String(event.started_at),
          endedAt: String(event.ended_at),
          type: String(event.primary_event_type),
          thumbnailAssetId: images[0] ? String(images[0].id) : null,
          clipAssetId: clip ? String(clip.id) : null,
        };
      }),
      pending: expected > 0 && terminalCount < expected,
      failedJobs: failedJobs.length,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
