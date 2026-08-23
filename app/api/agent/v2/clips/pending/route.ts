import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function retryDelayMs(attemptCount: unknown) {
  const attempt = Math.max(1, Number(attemptCount ?? 1));
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(6, attempt - 1));
}

export async function GET(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json({ ok: false, error: "invalid_agent_token" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("claim_monitoria_clip_request", {
    p_agent_id: agent.id,
    p_organization_id: agent.organizationId,
    p_lease_seconds: 900,
  });

  if (error) {
    console.error("Falha ao reservar clipe:", error.message);
    return NextResponse.json({ ok: false, error: "clip_claim_failed" }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.request_id) {
    return NextResponse.json({ ok: true, request: null }, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const storagePath = String(row.storage_path);
  const { data: signed, error: signedError } = await supabase.storage
    .from("event-clips")
    .createSignedUploadUrl(storagePath, { upsert: true });

  if (signedError || !signed?.signedUrl) {
    await supabase.from("clip_generation_requests").update({
      status: "pending",
      claim_token: null,
      claim_expires_at: null,
      error_code: "signed_upload_unavailable",
      error_message: signedError?.message ?? "URL de upload indisponível.",
      next_attempt_at: new Date(Date.now() + retryDelayMs(row.attempt_count)).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", row.request_id).eq("claim_token", row.claim_token);

    return NextResponse.json({ ok: false, error: "signed_upload_unavailable" }, { status: 503 });
  }

  const uploadExpiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  await supabase.from("clip_generation_requests").update({
    upload_expires_at: uploadExpiresAt,
    updated_at: new Date().toISOString(),
  }).eq("id", row.request_id).eq("claim_token", row.claim_token);

  return NextResponse.json({
    ok: true,
    request: {
      requestId: String(row.request_id),
      assetId: String(row.asset_id),
      eventId: String(row.event_id),
      cameraId: String(row.camera_id),
      agentEventId: row.agent_event_id ? String(row.agent_event_id) : null,
      storagePath,
      clipStartsAt: String(row.clip_starts_at),
      clipEndsAt: String(row.clip_ends_at),
      durationSeconds: Number(row.duration_seconds),
      attemptCount: Number(row.attempt_count ?? 1),
      claimToken: String(row.claim_token),
      signedUrl: String(signed.signedUrl),
      uploadExpiresAt,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
