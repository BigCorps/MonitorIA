"use server";

import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  buildDiscoveryReview,
  type DiscoveryCameraMapping,
  type DiscoveryInventoryCamera,
  type DiscoveryReview,
} from "@/src/camera/discovery-review";
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

export type DiscoveryAgentOption = {
  id: string;
  name: string;
  status: string;
  siteId: string;
  siteName: string;
  lastHeartbeatAt: string | null;
};

/**
 * A busca precisa ser enviada ao Agent do local correto.
 *
 * Antes a action pegava o primeiro Agent não desabilitado da organização.
 * Em empresas com várias filiais isso fazia uma busca do Local B chegar ao
 * computador do Local A. Agora o painel pode enviar agent_id explicitamente.
 *
 * Chamadas antigas/onboarding sem agent_id continuam funcionando quando há
 * um único Agent online: escolhemos o mais recente pelo heartbeat.
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
  const requestedAgentId = String(formData.get("agent_id") ?? "").trim();

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

  let agentQuery = supabase
    .from("agents")
    .select("id,site_id,status,last_heartbeat_at")
    .eq("organization_id", organization.id)
    .neq("status", "disabled");

  if (requestedAgentId) {
    agentQuery = agentQuery.eq("id", requestedAgentId);
  } else {
    // Compatibilidade com o onboarding antigo: quando não há seletor,
    // escolha o Agent online que falou mais recentemente.
    agentQuery = agentQuery
      .eq("status", "online")
      .order("last_heartbeat_at", {
        ascending: false,
        nullsFirst: false,
      })
      .limit(1);
  }

  const { data: agent, error: agentError } = await agentQuery.maybeSingle();

  if (agentError || !agent) {
    return {
      status: "error",
      message: requestedAgentId
        ? "O computador selecionado não está disponível nesta empresa."
        : "Nenhum computador online está conectado. Confirme o Agent deste local.",
    };
  }

  if (String((agent as { status: string }).status) !== "online") {
    return {
      status: "error",
      message:
        "O computador selecionado está offline. Ligue o Agent deste local e tente novamente.",
    };
  }

  const agentId = String((agent as { id: string }).id);
  const siteId = String((agent as { site_id: string }).site_id);
  const nowIso = new Date().toISOString();

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
      site_id: siteId,
      agent_id: agentId,
      requested_by: user.id,
      camera_count_hint: Math.round(cameraCount),
      username,
      credentials_sealed: sealCredentials({ username, password }),
      progress_message: "Aguardando o Agent deste local receber o pedido.",
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

  return {
    status: "started",
    runId: String((data as { id: string }).id),
  };
}

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
  review: DiscoveryReview | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function relationValue(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length ? objectValue(value[0]) : null;
  }
  const object = objectValue(value);
  return Object.keys(object).length ? object : null;
}

async function loadDiscoveryReview(input: {
  organizationId: string;
  runAgentId: string;
  runSiteId: string;
  startedAt: string | null;
  finishedAt: string | null;
  alreadyConnected: number;
  devices: DiscoveryDevice[];
}) {
  const supabase = createAdminClient();
  const [cameraResult, agentResult] = await Promise.all([
    supabase
      .from("cameras")
      .select(
        "id,site_id,name,description,status,pairing_status,source_kind,created_at,last_seen_at,setup_named_at,site:sites(id,name)",
      )
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("agents")
      .select("id,site_id,name,status")
      .eq("organization_id", input.organizationId),
  ]);

  if (cameraResult.error || agentResult.error) {
    console.warn(
      "Não foi possível montar revisão da descoberta:",
      cameraResult.error?.message ?? agentResult.error?.message,
    );
    return null;
  }

  const cameraRows = cameraResult.data ?? [];
  const cameraIds = cameraRows.map((row) => String(row.id));
  const mappingResult = cameraIds.length
    ? await supabase
        .from("agent_cameras")
        .select("agent_id,camera_id,enabled,created_at,updated_at")
        .in("camera_id", cameraIds)
    : { data: [], error: null };

  if (mappingResult.error) {
    console.warn(
      "Não foi possível ler vínculos para revisão da descoberta:",
      mappingResult.error.message,
    );
    return null;
  }

  const agentsById = new Map(
    (agentResult.data ?? []).map((row) => [String(row.id), row]),
  );
  const mappingsByCamera = new Map<string, DiscoveryCameraMapping[]>();

  for (const row of mappingResult.data ?? []) {
    const cameraId = String(row.camera_id);
    const mappedAgent = agentsById.get(String(row.agent_id));
    const list = mappingsByCamera.get(cameraId) ?? [];
    list.push({
      agentId: String(row.agent_id),
      agentSiteId: mappedAgent?.site_id ? String(mappedAgent.site_id) : null,
      agentName: mappedAgent?.name ? String(mappedAgent.name) : null,
      agentStatus: mappedAgent?.status ? String(mappedAgent.status) : null,
      enabled: row.enabled === true,
      createdAt: row.created_at ? String(row.created_at) : null,
      updatedAt: row.updated_at ? String(row.updated_at) : null,
    });
    mappingsByCamera.set(cameraId, list);
  }

  const cameras: DiscoveryInventoryCamera[] = cameraRows.map((row) => {
    const site = relationValue(row.site);
    return {
      id: String(row.id),
      siteId: String(row.site_id),
      siteName: String(site?.name ?? "Local"),
      name: String(row.name ?? "Câmera"),
      description: row.description ? String(row.description) : null,
      status: row.status ? String(row.status) : null,
      pairingStatus: row.pairing_status ? String(row.pairing_status) : null,
      sourceKind: row.source_kind ? String(row.source_kind) : null,
      createdAt: row.created_at ? String(row.created_at) : null,
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
      setupNamedAt: row.setup_named_at ? String(row.setup_named_at) : null,
      mappings: mappingsByCamera.get(String(row.id)) ?? [],
    };
  });

  return buildDiscoveryReview({
    runAgentId: input.runAgentId,
    runSiteId: input.runSiteId,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    alreadyConnected: input.alreadyConnected,
    cameras,
    devices: input.devices,
  });
}

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
    review: null,
  };

  if (!organization) return unknown;

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("discovery_runs")
    .select(
      "status,site_id,agent_id,started_at,finished_at," +
        "progress_step,progress_percent,progress_message,found_count," +
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
          typeof item.failureMessage === "string"
            ? item.failureMessage
            : null,
      }))
    : [];

  const status = String(row.status ?? "unknown") as DiscoveryStatus["status"];
  const alreadyConnected = Number(row.already_connected_count ?? 0);
  const finished = ["completed", "failed", "expired", "canceled"].includes(status);

  const review =
    finished && row.agent_id && row.site_id
      ? await loadDiscoveryReview({
          organizationId: organization.id,
          runAgentId: String(row.agent_id),
          runSiteId: String(row.site_id),
          startedAt: row.started_at ? String(row.started_at) : null,
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          alreadyConnected,
          devices,
        })
      : null;

  return {
    status,
    step: String(row.progress_step ?? "queued"),
    percent: Number(row.progress_percent ?? 0),
    message:
      typeof row.progress_message === "string"
        ? row.progress_message
        : null,
    found: Number(row.found_count ?? 0),
    connected: Number(row.connected_count ?? 0),
    alreadyConnected,
    cameraCountHint: Number(row.camera_count_hint ?? 0),
    devices,
    failureMessage:
      typeof row.failure_message === "string"
        ? row.failure_message
        : null,
    review,
  };
}
