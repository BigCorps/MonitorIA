import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function monthOnly(value: Date) {
  return `${value.toISOString().slice(0, 7)}-01`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - 10);
  const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const { data: rollup, error: rollupError } = await supabase.rpc(
    "refresh_monitoria_ai_usage_rollups",
    { p_from: dateOnly(from), p_to: dateOnly(now) },
  );

  if (rollupError) {
    console.error("Falha no rollup de IA:", rollupError.message);
    return NextResponse.json(
      { ok: false, error: "ai_usage_rollup_failed" },
      { status: 500 },
    );
  }

  const alertResults = await Promise.all([
    supabase.rpc("refresh_monitoria_ai_cost_alerts", {
      p_month: monthOnly(now),
    }),
    supabase.rpc("refresh_monitoria_ai_cost_alerts", {
      p_month: monthOnly(previousMonth),
    }),
  ]);

  const alertError = alertResults.find((result) => result.error)?.error;
  if (alertError) {
    console.error("Falha ao atualizar alertas de IA:", alertError.message);
    return NextResponse.json(
      { ok: false, error: "ai_cost_alert_refresh_failed", rollup },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      rollup,
      currentMonthAlerts: alertResults[0].data,
      previousMonthAlerts: alertResults[1].data,
      executedAt: now.toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
