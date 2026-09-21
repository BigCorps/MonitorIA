import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RECORDING_ENVIRONMENTS = 6;
const TRIAL_RECORDING_LIMIT_SECONDS = 86_400;

const BodySchema = z.object({
  name: z.string().trim().min(2).max(160),
  siteId: z.string().uuid(),
}).strict();

function planCode(value: unknown) {
  return value === "basic" ||
    value === "standard" ||
    value === "intensive"
    ? value
    : "standard";
}

function usedSeconds(
  rows: Array<{
    status?: string | null;
    reserved_seconds?: number | null;
    processed_seconds?: number | null;
  }>,
) {
  return rows.reduce((total, row) => {
    const active = ["reserved", "processing"].includes(
      String(row.status ?? ""),
    );

    return (
      total +
      Number(
        active
          ? row.reserved_seconds ?? 0
          : row.processed_seconds ?? 0,
      )
    );
  }, 0);
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
      { ok: false, error: "invalid_recording_source" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: site } = await supabase
    .from("sites")
    .select("id")
    .eq("id", body.siteId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (!site) {
    return NextResponse.json(
      { ok: false, error: "site_not_found" },
      { status: 404 },
    );
  }

  const now = new Date().toISOString();

  const [
    environmentCountResult,
    activeTrialResult,
  ] = await Promise.all([
    supabase
      .from("cameras")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organization.id)
      .eq("source_kind", "local_recording"),
    supabase
      .from("trial_runs")
      .select(
        "id,camera_id,status,capture_started_at,capture_ends_at,selected_plan_code",
      )
      .eq("organization_id", organization.id)
      .eq("status", "running")
      .lte("capture_started_at", now)
      .gt("capture_ends_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (environmentCountResult.error) {
    return NextResponse.json(
      { ok: false, error: "recording_source_count_unavailable" },
      { status: 500 },
    );
  }

  if ((environmentCountResult.count ?? 0) >= MAX_RECORDING_ENVIRONMENTS) {
    return NextResponse.json(
      {
        ok: false,
        error: "recording_environment_limit_reached",
        message:
          "Você pode criar até 6 ambientes para testar gravações.",
      },
      { status: 409 },
    );
  }

  let activeRecordingTrial:
    | {
        id: string;
        camera_id: string;
        capture_started_at: string;
        capture_ends_at: string;
        selected_plan_code: string;
      }
    | null = null;

  const candidate = activeTrialResult.data;

  if (candidate?.camera_id) {
    const { data: origin } = await supabase
      .from("cameras")
      .select("id,source_kind")
      .eq("id", candidate.camera_id)
      .eq("organization_id", organization.id)
      .maybeSingle();

    if (origin?.source_kind === "local_recording") {
      activeRecordingTrial = {
        id: String(candidate.id),
        camera_id: String(candidate.camera_id),
        capture_started_at: String(candidate.capture_started_at),
        capture_ends_at: String(candidate.capture_ends_at),
        selected_plan_code: planCode(
          candidate.selected_plan_code,
        ),
      };
    }
  }

  let trialUsedSeconds = 0;

  if (activeRecordingTrial) {
    const { data: sessions, error: sessionError } = await supabase
      .from("recording_sessions")
      .select("status,reserved_seconds,processed_seconds")
      .eq("trial_run_id", activeRecordingTrial.id);

    if (sessionError) {
      return NextResponse.json(
        { ok: false, error: "recording_quota_unavailable" },
        { status: 500 },
      );
    }

    trialUsedSeconds = usedSeconds(sessions ?? []);
  }

  const effectivePlan = activeRecordingTrial
    ? planCode(activeRecordingTrial.selected_plan_code)
    : "basic";

  const { data: camera, error } = await supabase
    .from("cameras")
    .insert({
      organization_id: organization.id,
      site_id: body.siteId,
      name: body.name,
      description:
        "Fonte do MonitorIA alimentada por gravações selecionadas no dispositivo.",
      source_kind: "local_recording",
      status: "pending",
      analysis_plan_code: effectivePlan,
      pairing_status: "unpaired",
      setup_named_at: now,
      health_intelligence_enabled: false,
      last_seen_at: null,
    })
    .select(
      "id,name,site_id,analysis_plan_code,status,source_kind",
    )
    .single();

  if (error || !camera) {
    const message = error?.message ?? "";

    if (message.includes("recording_environment_limit_reached")) {
      return NextResponse.json(
        {
          ok: false,
          error: "recording_environment_limit_reached",
          message:
            "Você pode criar até 6 ambientes para testar gravações.",
        },
        { status: 409 },
      );
    }

    console.error(
      "Falha ao criar ambiente de gravações:",
      message,
    );

    return NextResponse.json(
      { ok: false, error: "recording_source_create_failed" },
      { status: 500 },
    );
  }

  await supabase.from("audit_logs").insert({
    organization_id: organization.id,
    actor_user_id: user.id,
    action: "recording.source_created",
    entity_type: "camera",
    entity_id: String(camera.id),
    metadata: {
      source_kind: "local_recording",
      site_id: body.siteId,
    },
  });

  const remaining = activeRecordingTrial
    ? Math.max(
        TRIAL_RECORDING_LIMIT_SECONDS - trialUsedSeconds,
        0,
      )
    : 0;

  return NextResponse.json(
    {
      ok: true,
      source: {
        id: String(camera.id),
        name: String(camera.name),
        siteId: String(camera.site_id),
        planCode: effectivePlan,
        profileReady: false,
        entitlement: activeRecordingTrial
          ? {
              accessSource: "trial",
              monitoringAllowed: true,
              periodStartsAt:
                activeRecordingTrial.capture_started_at,
              periodEndsAt:
                activeRecordingTrial.capture_ends_at,
              reason: "active_trial",
              clipEnabled: false,
            }
          : {
              accessSource: "blocked",
              monitoringAllowed: false,
              periodStartsAt: null,
              periodEndsAt: null,
              reason: "plan_not_selected",
              clipEnabled: false,
            },
        quota: activeRecordingTrial
          ? {
              limitSeconds: TRIAL_RECORDING_LIMIT_SECONDS,
              usedSeconds: trialUsedSeconds,
              remainingSeconds: remaining,
            }
          : {
              limitSeconds: 0,
              usedSeconds: 0,
              remainingSeconds: 0,
            },
      },
    },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
