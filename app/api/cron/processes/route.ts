import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode") ?? "queue";
  const configuredLimit = Number(process.env.PROCESS_CRON_BATCH_SIZE ?? "100");
  const defaultLimit = Number.isFinite(configuredLimit) ? configuredLimit : 100;
  const parsedLimit = Number(request.nextUrl.searchParams.get("limit") ?? defaultLimit);
  const limit = Math.max(1, Math.min(Number.isFinite(parsedLimit) ? parsedLimit : defaultLimit, 500));
  const supabase = createAdminClient();
  const startedAt = new Date().toISOString();

  const result = mode === "full"
    ? await supabase.rpc("refresh_all_operational_processes_v1", {
        p_organization_id: null,
        p_camera_id: null,
        p_limit: limit,
      })
    : await supabase.rpc("process_operational_process_refresh_queue_v1", {
        p_limit: limit,
      });

  if (result.error) {
    console.error("Falha no processamento de processos:", result.error.message);
    return NextResponse.json(
      { ok: false, error: "process_intelligence_failed", details: result.error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      mode,
      startedAt,
      completedAt: new Date().toISOString(),
      result: result.data,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
