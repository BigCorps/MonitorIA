import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RoutineCronMode = "auto" | "evaluate" | "full";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

function boundedInteger(
  value: string | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(minimum, Math.min(maximum, Math.floor(parsed)))
    : fallback;
}

function dateOnly(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function cronMode(value: string | null): RoutineCronMode {
  if (value === "full") return "full";
  if (value === "evaluate") return "evaluate";
  return "auto";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const mode = cronMode(url.searchParams.get("mode"));
  const limit = boundedInteger(
    url.searchParams.get("limit") ?? process.env.ROUTINE_CRON_BATCH_SIZE,
    100,
    1,
    500,
  );
  const offset = boundedInteger(url.searchParams.get("offset"), 0, 0, 100000);
  const fullBatch = boundedInteger(
    process.env.ROUTINE_FULL_BATCH_SIZE,
    20,
    1,
    100,
  );
  const referenceDate = dateOnly(url.searchParams.get("date"));
  const observedAt = new Date().toISOString();
  const supabase = createAdminClient();

  if (mode === "full") {
    const refresh = await supabase.rpc("refresh_all_routine_intelligence_v2", {
      p_reference_date: referenceDate,
      p_limit: limit,
      p_offset: offset,
    });

    if (refresh.error) {
      console.error("Falha no cron completo de rotinas:", refresh.error.message);
      return NextResponse.json(
        { ok: false, error: "routine_refresh_failed", mode },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        mode,
        result: refresh.data,
        batch: { limit, offset, referenceDate },
        executedAt: observedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let bootstrap: unknown = null;

  if (mode === "auto") {
    const pending = await supabase.rpc("refresh_pending_routine_intelligence_v2", {
      p_limit: fullBatch,
    });

    if (pending.error) {
      console.error("Falha no bootstrap diário de rotinas:", pending.error.message);
    } else {
      bootstrap = pending.data;
    }
  }

  const evaluation = await supabase.rpc("evaluate_all_routine_deviations_v2", {
    p_observed_at: observedAt,
    p_limit: limit,
    p_offset: offset,
  });

  if (evaluation.error) {
    console.error(`Falha no cron de rotinas (${mode}):`, evaluation.error.message);
    return NextResponse.json(
      { ok: false, error: "routine_evaluation_failed", mode },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      bootstrap,
      result: evaluation.data,
      batch: { limit, offset, fullBatch },
      executedAt: observedAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
