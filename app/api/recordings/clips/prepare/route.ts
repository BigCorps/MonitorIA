import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MONITORIA_CLIP_PRE_ROLL_SECONDS,
  clipDurationForEvent,
} from "@/src/clips/policy";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  eventId: z.string().uuid(),
}).strict();

function dateParts(value: Date) {
  return {
    year: String(value.getUTCFullYear()),
    month: String(value.getUTCMonth() + 1).padStart(2, "0"),
    day: String(value.getUTCDate()).padStart(2, "0"),
  };
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "authentication_required" },
      { status: 401 },
    );
  }

  const organization = await getCurrentOrganization(user.id);
  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    return NextResponse.json(
      { ok: false, error: "not_authorized" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_clip_request" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: session } = await admin
    .from("recording_sessions")
    .select("id,camera_id,source_started_at,duration_seconds")
    .eq("id", body.sessionId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!session) {
    return NextResponse.json(
      { ok: false, error: "recording_session_not_found" },
      { status: 404 },
    );
  }

  const [{ data: event }, { data: entitlement }] = await Promise.all([
    admin
      .from("events")
      .select("id,camera_id,analysis_job_id,started_at,ended_at")
      .eq("id", body.eventId)
      .eq("recording_session_id", body.sessionId)
      .eq("organization_id", organization.id)
      .maybeSingle(),
    admin
      .from("camera_entitlements")
      .select("plan_code,clip_enabled,clip_duration_seconds,clip_retention_days")
      .eq("camera_id", session.camera_id)
      .eq("organization_id", organization.id)
      .maybeSingle(),
  ]);

  if (!event) {
    return NextResponse.json(
      { ok: false, error: "recording_event_not_found" },
      { status: 404 },
    );
  }

  if (
    entitlement?.plan_code !== "intensive" ||
    entitlement?.clip_enabled !== true
  ) {
    return NextResponse.json(
      { ok: false, error: "clip_not_in_plan" },
      { status: 403 },
    );
  }

  const { data: existing } = await admin
    .from("storage_assets")
    .select("id,status")
    .eq("event_id", event.id)
    .eq("kind", "preserved_clip")
    .is("deleted_at", null)
    .maybeSingle();

  if (existing?.status === "ready") {
    return NextResponse.json(
      { ok: true, ready: true, assetId: String(existing.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const durationSeconds = clipDurationForEvent({
    startedAt: String(event.started_at),
    endedAt: String(event.ended_at),
    maxAllowedSeconds: Number(
      entitlement.clip_duration_seconds ?? 310,
    ),
  });

  const sourceStartMs = Date.parse(String(session.source_started_at));
  const eventStartMs = Date.parse(String(event.started_at));
  const sourceOffsetSeconds = Math.max(
    0,
    (eventStartMs - sourceStartMs) / 1000 -
      MONITORIA_CLIP_PRE_ROLL_SECONDS,
  );

  const remaining = Math.max(
    1,
    Number(session.duration_seconds) - sourceOffsetSeconds,
  );
  const boundedDuration = Math.min(durationSeconds, remaining);

  const parts = dateParts(new Date(event.started_at));
  const storagePath = [
    organization.id,
    String(session.camera_id),
    parts.year,
    parts.month,
    parts.day,
    String(event.id),
    "clip.mp4",
  ].join("/");

  const retentionDays = Math.max(
    1,
    Math.min(365, Number(entitlement.clip_retention_days ?? 30)),
  );
  const expiresAt = new Date(
    Date.now() + retentionDays * 86_400_000,
  ).toISOString();

  const { data: asset, error: assetError } = existing
    ? await admin
        .from("storage_assets")
        .update({
          status: "pending",
          expires_at: expiresAt,
        })
        .eq("id", existing.id)
        .select("id")
        .single()
    : await admin
        .from("storage_assets")
        .insert({
          organization_id: organization.id,
          camera_id: session.camera_id,
          analysis_job_id: event.analysis_job_id,
          event_id: event.id,
          kind: "preserved_clip",
          status: "pending",
          bucket: "event-clips",
          storage_path: storagePath,
          mime_type: "video/mp4",
          captured_at: event.started_at,
          expires_at: expiresAt,
          deleted_at: null,
          frame_label: "clip",
          retention_class: "clip",
        })
        .select("id")
        .single();

  if (assetError || !asset) {
    return NextResponse.json(
      { ok: false, error: "clip_asset_create_failed" },
      { status: 500 },
    );
  }

  const { data: signed, error: signedError } = await admin.storage
    .from("event-clips")
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signedError || !signed?.signedUrl) {
    await admin
      .from("storage_assets")
      .update({ status: "failed" })
      .eq("id", asset.id);

    return NextResponse.json(
      { ok: false, error: "clip_upload_url_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      ready: false,
      assetId: String(asset.id),
      signedUrl: String(signed.signedUrl),
      offsetSeconds: sourceOffsetSeconds,
      durationSeconds: boundedDuration,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
