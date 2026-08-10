import { NextResponse, type NextRequest } from "next/server";
import { authenticateAgent } from "@/src/lib/agent-auth";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resultado final de uma busca.
 *
 * Aqui é onde `credentials_sealed` e `username` são zerados. Vale para
 * sucesso e para falha: nenhum desfecho deixa a senha da câmera parada no
 * banco. Se este ponto deixar de zerar, a promessa feita ao cliente se
 * desfaz em silêncio.
 */

type DeviceSummary = {
  host: string;
  name: string | null;
  vendor: string | null;
  model: string | null;
  onvifSupported: boolean;
  streamCount: number;
  connected: boolean;
  failureMessage: string | null;
};

/**
 * Reduz o que o Agent mandou ao que pode ser guardado e mostrado.
 *
 * Fica de fora tudo que identifica caminho de stream ou credencial. O IP
 * local permanece porque é o que permite ao cliente reconhecer o aparelho —
 * é endereço de rede interna, não localiza ninguém.
 */
function summarize(value: unknown): DeviceSummary[] {
  if (!Array.isArray(value)) return [];

  return value.slice(0, 64).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;

    const host = typeof item.host === "string" ? item.host : "";
    if (!host) return [];

    const failure =
      item.failure && typeof item.failure === "object"
        ? (item.failure as Record<string, unknown>)
        : null;

    return [
      {
        host,
        name: typeof item.name === "string" ? item.name : null,
        vendor: typeof item.vendor === "string" ? item.vendor : null,
        model: typeof item.model === "string" ? item.model : null,
        onvifSupported: item.onvifSupported === true,
        streamCount: Array.isArray(item.streams) ? item.streams.length : 0,
        connected: item.connected === true,
        failureMessage:
          failure && typeof failure.message === "string"
            ? failure.message.slice(0, 400)
            : null,
      },
    ];
  });
}

function wholeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

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
  const succeeded = body.status !== "failed";

  if (!runId) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const failure =
    body.failure && typeof body.failure === "object"
      ? (body.failure as Record<string, unknown>)
      : null;

  const nowIso = new Date().toISOString();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("discovery_runs")
    .update({
      status: succeeded ? "completed" : "failed",
      finished_at: nowIso,
      progress_step: "done",
      progress_percent: 100,
      progress_updated_at: nowIso,
      progress_message: null,

      found_count: wholeNumber(body.found),
      connected_count: wholeNumber(body.connected),
      already_connected_count: wholeNumber(body.alreadyConnected),
      devices: summarize(body.devices),

      failure_code:
        !succeeded && typeof failure?.code === "string"
          ? failure.code.slice(0, 80)
          : null,
      failure_message:
        !succeeded && typeof failure?.message === "string"
          ? failure.message.slice(0, 400)
          : !succeeded
            ? "A busca não terminou. Tente de novo em alguns instantes."
            : null,
      failure_detail:
        !succeeded && typeof failure?.detail === "string"
          ? failure.detail.slice(0, 2000)
          : null,

      // O ponto que sustenta a promessa: a senha sai do banco aqui.
      username: null,
      credentials_sealed: null,
    })
    .eq("id", runId)
    .eq("agent_id", agent.id)
    .in("status", ["running", "pending"])
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("Falha ao encerrar a busca de câmeras:", error.message);
    return NextResponse.json(
      { ok: false, error: "completion_unavailable" },
      { status: 500 },
    );
  }

  if (!data) {
    // A busca já tinha sido encerrada por expiração ou cancelamento. Garante
    // que a credencial não fique para trás nesse caminho.
    await supabase
      .from("discovery_runs")
      .update({ username: null, credentials_sealed: null })
      .eq("id", runId)
      .eq("agent_id", agent.id);

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
