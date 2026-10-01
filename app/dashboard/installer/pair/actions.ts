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
  siteId?: string;
  siteName?: string;
};

export type RepairPairingStatus = {
  connected: boolean;
  agentId: string | null;
  status: string | null;
  version: string | null;
  lastHeartbeatAt: string | null;
};

function safeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: value,
    }).format(new Date());
    return value;
  } catch {
    return "America/Sao_Paulo";
  }
}

async function baseContext() {
  const user = await requireAuthenticatedUser();
  const organization = await getCurrentOrganization(user.id);

  if (
    !organization ||
    !["owner", "admin"].includes(organization.role)
  ) {
    return null;
  }

  return { user, organization };
}

async function resolveRequestedSite(
  formData: FormData,
) {
  const context = await baseContext();
  if (!context) return null;

  const requestedSiteId = String(
    formData.get("site_id") ?? "",
  ).trim();

  const supabase = createAdminClient();

  if (
    requestedSiteId &&
    requestedSiteId !== "__new__"
  ) {
    const sites = await getOrganizationSites(
      context.organization.id,
    );
    const site = sites.find(
      (item) => item.id === requestedSiteId,
    );

    if (!site) return null;

    return {
      ...context,
      site,
      created: false,
    };
  }

  const name = String(
    formData.get("new_site_name") ?? "",
  )
    .trim()
    .slice(0, 160);

  if (name.length < 2) {
    throw new Error(
      "Informe o nome do novo local.",
    );
  }

  const timezone = safeTimezone(
    String(
      formData.get("new_site_timezone") ??
        "America/Sao_Paulo",
    ),
  );

  const { data, error } = await supabase
    .from("sites")
    .insert({
      organization_id:
        context.organization.id,
      name,
      timezone,
    })
    .select("id,name,timezone")
    .single();

  if (error || !data) {
    console.error(
      "Falha ao criar novo local para o Agent:",
      error?.message,
    );
    throw new Error(
      "Não foi possível criar o novo local.",
    );
  }

  return {
    ...context,
    site: {
      id: String(data.id),
      name: String(data.name),
      timezone: String(data.timezone),
    },
    created: true,
  };
}

async function repairContext(
  siteId: string,
) {
  const context = await baseContext();
  if (!context) return null;

  const sites = await getOrganizationSites(
    context.organization.id,
  );
  const site = sites.find(
    (item) => item.id === siteId,
  );

  if (!site) return null;

  return {
    ...context,
    site,
  };
}

export async function createRepairPairingCodeAction(
  _previousState: RepairPairingState,
  formData: FormData,
): Promise<RepairPairingState> {
  let context:
    | Awaited<
        ReturnType<typeof resolveRequestedSite>
      >
    | null = null;

  try {
    context =
      await resolveRequestedSite(formData);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível preparar o local.",
    };
  }

  if (!context) {
    return {
      status: "error",
      message:
        "Não foi possível autorizar este local.",
    };
  }

  const supabase = createAdminClient();

  const {
    data: previousAgent,
    error: previousAgentError,
  } = await supabase
    .from("agents")
    .select("id")
    .eq(
      "organization_id",
      context.organization.id,
    )
    .eq("site_id", context.site.id)
    .neq("status", "disabled")
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (previousAgentError) {
    console.error(
      "Falha ao identificar Agent anterior no local:",
      previousAgentError.message,
    );
    return {
      status: "error",
      message:
        "Não conseguimos preparar a conexão agora. Tente novamente.",
      siteId: context.site.id,
      siteName: context.site.name,
    };
  }

  const startedAt = new Date(
    Date.now() - 1_000,
  ).toISOString();
  const code =
    generatePairingCode();

  const { data, error } =
    await supabase.rpc(
      "create_site_pairing_code",
      {
        p_site_id: context.site.id,
        p_code_hash:
          hashPairingCode(code),
        p_created_by: context.user.id,
      },
    );

  const result = Array.isArray(data)
    ? data[0]
    : data;

  if (error || !result) {
    console.error(
      "Falha ao gerar código de conexão do local:",
      error?.message ?? "sem retorno",
    );
    return {
      status: "error",
      message:
        "O local foi selecionado, mas não conseguimos gerar o código agora.",
      siteId: context.site.id,
      siteName: context.site.name,
    };
  }

  return {
    status: "success",
    code,
    expiresAt:
      String(result.expires_at),
    previousAgentId: previousAgent
      ? String(
          (
            previousAgent as {
              id: string;
            }
          ).id,
        )
      : null,
    startedAt,
    siteId: context.site.id,
    siteName: context.site.name,
  };
}

export async function getRepairPairingStatusAction(
  siteId: string,
  previousAgentId: string | null,
  startedAt: string,
): Promise<RepairPairingStatus> {
  const context =
    await repairContext(siteId);

  const waiting: RepairPairingStatus = {
    connected: false,
    agentId: null,
    status: null,
    version: null,
    lastHeartbeatAt: null,
  };

  if (!context) return waiting;

  const started =
    new Date(startedAt);
  if (
    !Number.isFinite(
      started.getTime(),
    )
  ) {
    return waiting;
  }

  const supabase =
    createAdminClient();
  const { data: agent, error } =
    await supabase
      .from("agents")
      .select(
        "id,status,version,last_heartbeat_at,created_at",
      )
      .eq(
        "organization_id",
        context.organization.id,
      )
      .eq(
        "site_id",
        context.site.id,
      )
      .neq("status", "disabled")
      .gte(
        "created_at",
        started.toISOString(),
      )
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    console.error(
      "Falha ao acompanhar conexão do Agent:",
      error.message,
    );
    return waiting;
  }

  if (!agent) return waiting;

  const row = agent as {
    id: string;
    status: string | null;
    version: string | null;
    last_heartbeat_at: string | null;
  };

  if (
    previousAgentId &&
    String(row.id) ===
      previousAgentId
  ) {
    return waiting;
  }

  const lastHeartbeatAt =
    row.last_heartbeat_at
      ? String(row.last_heartbeat_at)
      : null;

  return {
    connected:
      Boolean(lastHeartbeatAt),
    agentId: String(row.id),
    status: row.status
      ? String(row.status)
      : null,
    version: row.version
      ? String(row.version)
      : null,
    lastHeartbeatAt,
  };
}
