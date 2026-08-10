"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import { getCurrentOrganization } from "@/src/lib/dashboard-data";
import {
  discoveryKeyConfigured,
  sealCredentials,
} from "@/src/lib/discovery-crypto";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type DiscoveryStartState = {
  status: "idle" | "started" | "error";
  message?: string;
  runId?: string;
};

/**
 * Cria o pedido de busca que o programa da loja vai executar.
 *
 * O programa consulta o servidor de tempos em tempos; o pedido fica
 * esperando ali até a próxima consulta. Por isso a tela avisa que pode levar
 * alguns segundos para começar — não é travamento.
 */
export async function startDiscoveryAction(
  _previousState: DiscoveryStartState,
  formData: FormData,
): Promise<DiscoveryStartState> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) {
    return {
      status: "error",
      message: "Não encontramos sua conta. Entre de novo e tente mais uma vez.",
    };
  }

  if (!discoveryKeyConfigured()) {
    console.error(
      "MONITORIA_DISCOVERY_KEY ausente. Busca de câmeras pelo painel indisponível.",
    );
    return {
      status: "error",
      message:
        "A busca de câmeras está indisponível no momento. Tente de novo mais tarde.",
    };
  }

  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const cameraCount = Number(formData.get("cameraCount") ?? 4);

  if (!username) {
    return {
      status: "error",
      message: "Informe o usuário das câmeras.",
    };
  }

  if (!Number.isFinite(cameraCount) || cameraCount < 1 || cameraCount > 64) {
    return {
      status: "error",
      message: "Informe quantas câmeras você tem, de 1 a 64.",
    };
  }

  const supabase = createAdminClient();

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id,site_id")
    .eq("organization_id", organization.id)
    .neq("status", "disabled")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (agentError || !agent) {
    return {
      status: "error",
      message:
        "Nenhum computador da loja está conectado ainda. Instale o programa " +
        "do MonitorIA no computador que fica ligado e volte aqui.",
    };
  }

  const agentId = String((agent as { id: string }).id);
  const nowIso = new Date().toISOString();

  // Uma busca por vez. Encerra o que já passou do prazo antes de tentar
  // criar a nova, senão o índice único recusa o pedido novo por causa de um
  // pedido morto.
  await supabase
    .from("discovery_runs")
    .update({
      status: "expired",
      finished_at: nowIso,
      username: null,
      credentials_sealed: null,
    })
    .eq("agent_id", agentId)
    .in("status", ["pending", "running"])
    .lt("expires_at", nowIso);

  const { data: existing } = await supabase
    .from("discovery_runs")
    .select("id")
    .eq("agent_id", agentId)
    .in("status", ["pending", "running"])
    .maybeSingle();

  if (existing) {
    return {
      status: "started",
      runId: String((existing as { id: string }).id),
    };
  }

  const { data, error } = await supabase
    .from("discovery_runs")
    .insert({
      organization_id: organization.id,
      site_id: String((agent as { site_id: string }).site_id),
      agent_id: agentId,
      requested_by: user.id,
      camera_count_hint: Math.round(cameraCount),
      username,
      credentials_sealed: sealCredentials({ username, password }),
      progress_message: "Aguardando o programa da loja receber o pedido.",
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error(
      "Falha ao criar pedido de busca:",
      error?.message ?? "sem retorno",
    );
    return {
      status: "error",
      message:
        "Não conseguimos iniciar a busca agora. Tente de novo em alguns instantes.",
    };
  }

  return { status: "started", runId: String((data as { id: string }).id) };
}

/** Cancela a busca em andamento e apaga a senha guardada. */
export async function cancelDiscoveryAction(runId: string) {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (!organization) return;

  const supabase = createAdminClient();

  await supabase
    .from("discovery_runs")
    .update({
      status: "canceled",
      finished_at: new Date().toISOString(),
      username: null,
      credentials_sealed: null,
      progress_message: null,
    })
    .eq("id", runId)
    .eq("organization_id", organization.id)
    .in("status", ["pending", "running"]);
}

export type DiscoveryDevice = {
  host: string;
  name: string | null;
  vendor: string | null;
  model: string | null;
  streamCount: number;
  connected: boolean;
  failureMessage: string | null;
};

export type DiscoveryStatus = {
  status:
    | "pending"
    | "running"
    | "completed"
    | "failed"
    | "expired"
    | "canceled"
    | "unknown";
  step: string;
  percent: number;
  message: string | null;
  found: number;
  connected: number;
  alreadyConnected: number;
  cameraCountHint: number;
  devices: DiscoveryDevice[];
  failureMessage: string | null;
};

/**
 * Estado atual de uma busca, para a tela acompanhar.
 *
 * `failure_detail` existe na tabela e nunca é lido aqui de propósito: é
 * texto técnico e não pode chegar à tela do cliente.
 */
export async function getDiscoveryStatusAction(
  runId: string,
): Promise<DiscoveryStatus> {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  const unknown: DiscoveryStatus = {
    status: "unknown",
    step: "queued",
    percent: 0,
    message: null,
    found: 0,
    connected: 0,
    alreadyConnected: 0,
    cameraCountHint: 0,
    devices: [],
    failureMessage: null,
  };

  if (!organization) return unknown;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("discovery_runs")
    .select(
      "status,progress_step,progress_percent,progress_message,found_count," +
        "connected_count,already_connected_count,camera_count_hint,devices,failure_message",
    )
    .eq("id", runId)
    .eq("organization_id", organization.id)
    .maybeSingle();

  if (error || !data) return unknown;

  const row = data as unknown as Record<string, unknown>;

  const devices = Array.isArray(row.devices)
    ? (row.devices as Record<string, unknown>[]).map((item) => ({
        host: String(item.host ?? ""),
        name: typeof item.name === "string" ? item.name : null,
        vendor: typeof item.vendor === "string" ? item.vendor : null,
        model: typeof item.model === "string" ? item.model : null,
        streamCount: Number(item.streamCount ?? 0),
        connected: item.connected === true,
        failureMessage:
          typeof item.failureMessage === "string" ? item.failureMessage : null,
      }))
    : [];

  return {
    status: String(row.status ?? "unknown") as DiscoveryStatus["status"],
    step: String(row.progress_step ?? "queued"),
    percent: Number(row.progress_percent ?? 0),
    message:
      typeof row.progress_message === "string" ? row.progress_message : null,
    found: Number(row.found_count ?? 0),
    connected: Number(row.connected_count ?? 0),
    alreadyConnected: Number(row.already_connected_count ?? 0),
    cameraCountHint: Number(row.camera_count_hint ?? 0),
    devices,
    failureMessage:
      typeof row.failure_message === "string" ? row.failure_message : null,
  };
}
