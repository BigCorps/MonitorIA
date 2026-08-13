import { NextResponse, type NextRequest } from "next/server";
import { deployedCommitSha, releaseManifest } from "@/src/lib/release";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(secret && secret.length >= 16 && request.headers.get("authorization") === `Bearer ${secret}`);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: run, error: runError } = await supabase
    .from("operational_refresh_runs")
    .insert({ status: "running", metadata: { source: "vercel_cron" } })
    .select("id")
    .single();
  if (runError) {
    return NextResponse.json({ ok: false, error: "operation_run_unavailable" }, { status: 500 });
  }

  const finishFailed = async (errorCode: string) => {
    await supabase.from("operational_refresh_runs").update({
      status: "failed",
      error_code: errorCode,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id);
  };

  const alertResult = await supabase.rpc("refresh_operational_alerts_v1", {
    p_recommended_agent_version: process.env.AGENT_RECOMMENDED_VERSION?.trim() || "0.15.1",
  });
  if (alertResult.error) {
    console.error("Falha ao atualizar alertas operacionais:", alertResult.error.message);
    await finishFailed("operational_alert_refresh_failed");
    return NextResponse.json({ ok: false, error: "operational_alert_refresh_failed" }, { status: 500 });
  }

  const intelligentAlertResult = await supabase.rpc("refresh_intelligent_alerts_v1");
  if (intelligentAlertResult.error) {
    console.error("Falha ao atualizar alertas inteligentes:", intelligentAlertResult.error.message);
    await finishFailed("intelligent_alert_refresh_failed");
    return NextResponse.json({ ok: false, error: "intelligent_alert_refresh_failed" }, { status: 500 });
  }

  const journeyResult = await supabase.rpc("refresh_cross_camera_journeys_v1", {
    p_from: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    p_to: new Date().toISOString(),
  });
  if (journeyResult.error) {
    console.error("Falha ao atualizar passagens entre câmeras:", journeyResult.error.message);
    await finishFailed("cross_camera_refresh_failed");
    return NextResponse.json({ ok: false, error: "cross_camera_refresh_failed" }, { status: 500 });
  }

  const alerts = objectValue(alertResult.data);
  const intelligentAlerts = objectValue(intelligentAlertResult.data);
  const journeys = objectValue(journeyResult.data);
  const journeyCount = Number(journeys.people ?? 0) + Number(journeys.vehicles ?? 0);
  const finishedAt = new Date().toISOString();
  const { error: finishError } = await supabase.from("operational_refresh_runs").update({
    status: "completed",
    alerts_opened: Number(alerts.opened ?? 0) + Number(intelligentAlerts.opened ?? 0),
    alerts_resolved: Number(alerts.resolved ?? 0) + Number(intelligentAlerts.resolved ?? 0),
    journeys_created: journeyCount,
    finished_at: finishedAt,
    metadata: {
      operationalAlertsActive: Number(alerts.active ?? 0),
      intelligentAlertsActive: Number(intelligentAlerts.active ?? 0),
      additionalModelCalls: releaseManifest.additionalAlertModelCalls,
    },
  }).eq("id", run.id);

  if (finishError) {
    return NextResponse.json({ ok: false, error: "operation_run_finalize_failed" }, { status: 500 });
  }

  const gateResult = await supabase.rpc("evaluate_release_gate_v1", {
    p_commit_sha: deployedCommitSha(),
    p_build_ok: true,
    p_tests_ok: releaseManifest.automatedTestsApproved,
  });
  if (gateResult.error) {
    console.error("Falha ao avaliar gate de lançamento:", gateResult.error.message);
  }

  return NextResponse.json(
    {
      ok: true,
      alerts,
      intelligentAlerts,
      journeys,
      releaseGate: gateResult.error ? null : gateResult.data,
      finishedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
