import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  generateAgentToken,
  hashAgentToken,
  hashPairingCode,
} from "@/src/lib/agent-security";
import { createAdminClient } from "@/src/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PairBodySchema = z.object({
  code: z.string().min(8).max(40),
  agentName: z.string().trim().min(2).max(160).default("MonitorIA Agent"),
  platform: z.string().trim().max(80).optional(),
  architecture: z.string().trim().max(80).optional(),
  version: z.string().trim().max(80).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof PairBodySchema>;

  try {
    body = PairBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_request" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const pairingHash = hashPairingCode(body.code);
    const agentToken = generateAgentToken();
    const tokenHash = hashAgentToken(agentToken);
    const supabase = createAdminClient();

    const { data, error } = await supabase.rpc("consume_agent_pairing_code", {
      p_code_hash: pairingHash,
      p_agent_name: body.agentName,
      p_agent_token_hash: tokenHash,
      p_platform: body.platform ?? null,
      p_architecture: body.architecture ?? null,
      p_version: body.version ?? null,
      p_metadata: body.metadata ?? {},
    });

    const result = Array.isArray(data) ? data[0] : data;

    if (error || !result) {
      console.error("Falha ao consumir código de pareamento:", error?.message);
      return NextResponse.json(
        { ok: false, error: "invalid_or_expired_pairing_code" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        agent: {
          id: String(result.agent_id),
          token: agentToken,
        },
        // Nulo no pareamento por local: o computador conecta ao painel e as
        // câmeras entram depois, pela busca.
        camera: result.camera_id
          ? {
              id: String(result.camera_id),
              name: String(result.camera_name),
              organizationId: String(result.organization_id),
              siteId: String(result.site_id),
              plan: String(result.analysis_plan_code),
              captureIntervalSeconds: Number(result.capture_interval_seconds),
              consolidationIntervalSeconds: Number(
                result.consolidation_interval_seconds,
              ),
              motionStartThreshold: Number(result.motion_start_threshold),
              motionContinueThreshold: Number(result.motion_continue_threshold),
              eventCloseAfterSeconds: Number(result.event_close_after_seconds),
              monitoringGoals: Array.isArray(result.monitoring_goals)
                ? result.monitoring_goals
                : [],
            }
          : null,
        site: {
          organizationId: String(result.organization_id),
          siteId: String(result.site_id),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Erro no endpoint de pareamento:", error);
    return NextResponse.json(
      { ok: false, error: "pairing_service_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
