"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  getCurrentOrganization,
  getOrganizationSites,
} from "@/src/lib/dashboard-data";
import {
  generatePairingCode,
  hashPairingCode,
} from "@/src/lib/agent-security";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type RepairPairingState = {
  status: "idle" | "success" | "error";
  message?: string;
  code?: string;
  expiresAt?: string;
  previousAgentId?: string | null;
  startedAt?: string;
};

export type RepairPairingStatus = {
  connected: boolean;
  agentId: string | null;
  status: string | null;
  version: string | null;
  lastHeartbeatAt: string | null;
};

async function repairContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization || !["owner", "admin"].includes(organization.role)) {
    return null;
  }

  const sites = await getOrganizationSites(organization.id);
  const site = sites[0];

  if (!site) return null;

  return { user, organization, site };
}

export async function createRepairPairingCodeAction(
  _previousState: RepairPairingState,
  _formData: FormData,
): Promise<RepairPairingState> {
  const context = await repairContext();

  if (!context) {
    return {
      status: "error",
      message: "Não foi possível autorizar o reparo deste computador.",
    };
  }

  const supabase = createAdminClient();
  const { data: previousAgent, error: previousAgentError } = await supabase
    .from("agents")
    .select("id")
    .eq("organization_id", context.organization.id)
    .eq("site_id", context.site.id)
    .neq("status", "disabled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousAgentError) {
    console.error(
      "Falha ao identificar Agent anterior no reparo:",
      previousAgentError.message,
    );
    return {
      status: "error",
      message: "Não conseguimos preparar a troca agora. Tente novamente.",
    };
  }

  const startedAt = new Date(Date.now() - 1_000).toISOString();
  const code = generatePairingCode();

  const { data, error } = await supabase.rpc("create_site_pairing_code", {
    p_site_id: context.site.id,
    p_code_hash: hashPairingCode(code),
    p_created_by: context.user.id,
  });

  const result = Array.isArray(data) ? data[0] : data;

  if (error || !result) {
    console.error(
      "Falha ao gerar código de reparo do local:",
      error?.message ?? "sem retorno",
    );
    return {
      status: "error",
      message: "Não conseguimos gerar o código agora. Tente novamente.",
    };
  }

  return {
    status: "success",
    code,
    expiresAt: String(result.expires_at),
    previousAgentId: previousAgent
      ? String((previousAgent as { id: string }).id)
      : null,
    startedAt,
  };
}

export async function getRepairPairingStatusAction(
  previousAgentId: string | null,
  startedAt: string,
): Promise<RepairPairingStatus> {
  const context = await repairContext();

  const waiting: RepairPairingStatus = {
    connected: false,
    agentId: null,
    status: null,
    version: null,
    lastHeartbeatAt: null,
  };

  if (!context) return waiting;

  const started = new Date(startedAt);
  if (!Number.isFinite(started.getTime())) return waiting;

  const supabase = createAdminClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id,status,version,last_heartbeat_at,created_at")
    .eq("organization_id", context.organization.id)
    .eq("site_id", context.site.id)
    .neq("status", "disabled")
    .gte("created_at", started.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Falha ao acompanhar reparo do Agent:", error.message);
    return waiting;
  }

  if (!agent) return waiting;

  const row = agent as {
    id: string;
    status: string | null;
    version: string | null;
    last_heartbeat_at: string | null;
  };

  if (previousAgentId && String(row.id) === previousAgentId) {
    return waiting;
  }

  const lastHeartbeatAt = row.last_heartbeat_at
    ? String(row.last_heartbeat_at)
    : null;

  return {
    connected: Boolean(lastHeartbeatAt),
    agentId: String(row.id),
    status: row.status ? String(row.status) : null,
    version: row.version ? String(row.version) : null,
    lastHeartbeatAt,
  };
}
