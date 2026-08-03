import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type RoutineCronMode = "evaluate" | "full";

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
  return value === "full" ? "full" : "evaluate";
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
  const referenceDate = dateOnly(url.searchParams.get("date"));
  const supabase = createAdminClient();

  const rpcName =
    mode === "full"
      ? "refresh_all_routine_intelligence_v1"
      : "evaluate_all_routine_deviations_v1";

  const rpcArguments =
    mode === "full"
      ? {
          p_reference_date: referenceDate,
          p_limit: limit,
          p_offset: offset,
        }
      : {
          p_observed_at: new Date().toISOString(),
          p_limit: limit,
          p_offset: offset,
        };

  const { data, error } = await supabase.rpc(rpcName, rpcArguments);

  if (error) {
    console.error(`Falha no cron de rotinas (${mode}):`, error.message);
    return NextResponse.json(
      { ok: false, error: "routine_refresh_failed", mode },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      result: data,
      batch: { limit, offset, referenceDate },
      executedAt: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
