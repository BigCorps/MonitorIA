import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STEPS = new Set([
  "queued",
  "starting",
  "scanning",
  "testing",
  "saving",
  "done",
]);

/**
 * Progresso parcial de uma busca em andamento.
 *
 * O Agent chama isto várias vezes durante a mesma busca. Só o dono do pedido
 * pode escrever, e só enquanto o pedido está em execução: um relatório
 * atrasado não ressuscita uma busca já encerrada.
 */
export async function POST(request: NextRequest) {
  const agent = await authenticateAgent(request);
  if (!agent) {
    return NextResponse.json(
      { ok: false, error: "invalid_agent_token" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const runId = typeof body.runId === "string" ? body.runId : "";
  const step = typeof body.step === "string" ? body.step : "";

  if (!runId || !STEPS.has(step)) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const percentRaw = Number(body.percent);
  const percent = Number.isFinite(percentRaw)
    ? Math.min(100, Math.max(0, Math.round(percentRaw)))
    : 0;

  const nowIso = new Date().toISOString();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("discovery_runs")
    .update({
      progress_step: step,
      progress_percent: percent,
      progress_message:
        typeof body.message === "string" && body.message.trim()
          ? body.message.trim().slice(0, 400)
          : null,
      progress_updated_at: nowIso,
      found_count: Number.isFinite(Number(body.found))
        ? Math.max(0, Math.round(Number(body.found)))
        : 0,
      // Enquanto a busca corre, cada sinal de vida renova o prazo. Uma busca
      // lenta que continua reportando não é uma busca travada.
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .eq("id", runId)
    .eq("agent_id", agent.id)
    .eq("status", "running")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Falha ao gravar progresso da busca:", error.message);
    return NextResponse.json(
      { ok: false, error: "progress_unavailable" },
      { status: 500 },
    );
  }

  if (!data) {
    // Pedido cancelado, expirado ou de outro Agent. O Agent usa isto como
    // sinal para parar de trabalhar em vão.
    return NextResponse.json(
      { ok: false, error: "run_not_active" },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
