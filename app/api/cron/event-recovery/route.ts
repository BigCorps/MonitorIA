import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { processMonitoriaEventCore } from "@/src/lib/event-processor-v2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function boundedEnv(name: string, fallback: number, maximum: number) {
  const parsed = Number(process.env[name] ?? "");
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(parsed)));
}

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  return Boolean(
    secret &&
      secret.length >= 16 &&
      request.headers.get("authorization") === `Bearer ${secret}`,
  );
}

/**
 * Recovery é independente de estado em memória.
 *
 * O caminho normal é ACK -> `after()` -> processador durável. Este cron pega
 * recibos cujo disparo foi interrompido ou cuja lease expirou. Timeout/redeploy
 * vira atraso observável, nunca perda permanente.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();
  const batchSize = boundedEnv("MONITORIA_RECOVERY_BATCH", 200, 1000);
  const configuredConcurrency = boundedEnv("MONITORIA_RECOVERY_CONCURRENCY", 8, 32);
  const stale = new Date(now.getTime() - 2 * 60_000).toISOString();

  const { data: rows, error } = await supabase
    .from("event_ingestions")
    .select("id,status,processing_heartbeat_at,processing_lease_expires_at,next_retry_at,updated_at")
    .not("evidence_ready_at", "is", null)
    .or(
      `and(status.eq.queued,updated_at.lte.${stale}),and(status.eq.retry,next_retry_at.lte.${now.toISOString()}),and(status.eq.processing,processing_lease_expires_at.lte.${now.toISOString()})`,
    )
    .order("created_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    console.error("Falha ao localizar ingestões para recovery:", error.message);
    return NextResponse.json({ ok: false, error: "recovery_query_failed" }, { status: 500 });
  }

  const candidates = rows ?? [];
  let completed = 0;
  let skipped = 0;
  const failures: Array<{ id: string; error: string }> = [];
  let cursor = 0;
  const concurrency = Math.min(configuredConcurrency, Math.max(1, candidates.length));

  async function worker() {
    while (cursor < candidates.length) {
      const index = cursor++;
      const row = candidates[index];
      if (!row) continue;
      try {
        const result = await processMonitoriaEventCore(String(row.id), "recovery");
        if (result && "skipped" in result && result.skipped) skipped += 1;
        else completed += 1;
      } catch (processError) {
        const message = processError instanceof Error ? processError.message : String(processError);
        failures.push({ id: String(row.id), error: message.slice(0, 300) });
        console.error(`Recovery falhou para ${row.id}:`, processError);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  if (now.getUTCMinutes() < 2) {
    const boundary = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
    const [healthRollup, processingRollup] = await Promise.all([
      supabase.rpc("rollup_monitoria_agent_health_v2", { p_before: boundary }),
      supabase.rpc("rollup_monitoria_processing_v2", { p_before: boundary }),
    ]);
    if (healthRollup.error) console.error("Falha no rollup de health:", healthRollup.error.message);
    if (processingRollup.error) console.error("Falha no rollup de processamento:", processingRollup.error.message);
  }

  const { count: backlogCount } = await supabase
    .from("event_ingestions")
    .select("id", { count: "exact", head: true })
    .in("status", ["queued", "processing", "retry"]);
  const { data: oldestBacklog } = await supabase
    .from("event_ingestions")
    .select("created_at")
    .in("status", ["queued", "processing", "retry"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    batchSize,
    concurrency,
    backlogCount: backlogCount ?? 0,
    backlogAgeSeconds: oldestBacklog?.created_at
      ? Math.max(0, Math.round((Date.now() - Date.parse(String(oldestBacklog.created_at))) / 1000))
      : 0,
    completed,
    skipped,
    failures,
    executedAt: now.toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
}
