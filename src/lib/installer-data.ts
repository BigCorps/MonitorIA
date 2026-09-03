import { createClient } from "@/src/lib/supabase/server";

export type InstallerAgent = {
  id: string;
  name: string;
  siteName: string;
  siteTimezone: string;
  status: string;
  version: string | null;
  platform: string | null;
  architecture: string | null;
  lastHeartbeatAt: string | null;
  cpuPercent: number | null;
  memoryBytes: number | null;
  diskFreeBytes: number | null;
  queuedEvents: number;
};

export type InstallerPlatform = "windows" | "linux-x64" | "linux-arm64";

export type InstallerDownload = {
  platform: InstallerPlatform;
  label: string;
  available: boolean;
};

export type StoreDistribution = {
  label: string;
  available: boolean;
  url: string | null;
};

export type InstallerWorkspace = {
  agents: InstallerAgent[];
  pairedCameras: number;
  totalCameras: number;
  recommendedVersion: string;
  downloads: InstallerDownload[];
  storeDistribution: StoreDistribution;
  downloadAvailable: boolean;
};

/**
 * Os instaladores diretos sempre seguem a release marcada como Latest no
 * GitHub. Isso evita que uma variável antiga da Vercel mantenha clientes em
 * uma versão anterior.
 *
 * A Microsoft Store continua independente e usa a distribuição já certificada.
 */
export const DEFAULT_INSTALLER_URLS: Record<InstallerPlatform, string> = {
  windows:
    "https://github.com/BigCorps/MonitorIA/releases/latest/download/MonitorIA-Setup.exe",
  "linux-x64":
    "https://github.com/BigCorps/MonitorIA/releases/latest/download/monitoria-agent-linux-x64.tar.gz",
  "linux-arm64":
    "https://github.com/BigCorps/MonitorIA/releases/latest/download/monitoria-agent-linux-arm64.tar.gz",
};

export const STORE_INSTALLER_FILENAME = "MonitorIA-Store-Setup.exe";

export function storeInstallerUrlFor(version: string): string {
  const limpa = version.trim().replace(/^v/i, "");

  if (!/^\d+\.\d+\.\d+$/.test(limpa)) {
    throw new Error(
      `Versão inválida para a URL da Microsoft Store: "${version}". ` +
        `Use o formato X.Y.Z, sem "latest" e sem prefixo.`,
    );
  }

  return (
    "https://github.com/BigCorps/MonitorIA/releases/download/" +
    `agent-v${limpa}/${STORE_INSTALLER_FILENAME}`
  );
}

const PLATFORM_LABELS: Record<InstallerPlatform, string> = {
  windows: "Windows 10/11 · 64 bits",
  "linux-x64": "Linux · x86_64",
  "linux-arm64": "Linux · ARM64",
};

export function installerUrlFor(platform: InstallerPlatform) {
  return DEFAULT_INSTALLER_URLS[platform];
}

export function publicStoreUrl() {
  const configured = process.env.MONITORIA_STORE_PUBLIC_URL?.trim();

  if (!configured) return null;

  try {
    const parsed = new URL(configured);

    if (
      parsed.protocol !== "https:" ||
      parsed.hostname.toLowerCase() !== "apps.microsoft.com"
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function isInstallerPlatform(value: string): value is InstallerPlatform {
  return value === "windows" || value === "linux-x64" || value === "linux-arm64";
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export async function getInstallerWorkspace(
  organizationId: string,
): Promise<InstallerWorkspace> {
  const supabase = await createClient();

  const [agentResult, cameraResult] = await Promise.all([
    supabase
      .from("agents")
      .select(`
        id,
        name,
        status,
        version,
        platform,
        architecture,
        last_heartbeat_at,
        site:sites(name,timezone)
      `)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("cameras")
      .select("id,pairing_status")
      .eq("organization_id", organizationId),
  ]);

  if (agentResult.error) {
    console.error(
      "Falha ao carregar instaladores:",
      agentResult.error.message,
    );
  }

  const agentRows = agentResult.data ?? [];
  const agentIds = agentRows.map((agent: any) => String(agent.id));
  const healthByAgent = new Map<string, any>();

  if (agentIds.length) {
    const { data: healthRows, error } = await supabase
      .from("agent_health")
      .select(
        "agent_id,recorded_at,cpu_percent,memory_bytes,disk_free_bytes,queued_events",
      )
      .eq("organization_id", organizationId)
      .in("agent_id", agentIds)
      .order("recorded_at", { ascending: false })
      .limit(Math.min(1000, Math.max(100, agentIds.length * 25)));

    if (error) {
      console.error("Falha ao carregar saúde do Agent:", error.message);
    }

    for (const health of healthRows ?? []) {
      const agentId = String((health as any).agent_id);
      if (!healthByAgent.has(agentId)) {
        healthByAgent.set(agentId, health);
      }
    }
  }

  const agents: InstallerAgent[] = agentRows.map((agent: any) => {
    const site = relationOne(agent.site);
    const health = healthByAgent.get(String(agent.id));
    return {
      id: String(agent.id),
      name: String(agent.name),
      siteName: String((site as any)?.name ?? "Local"),
      siteTimezone: String(
        (site as any)?.timezone ?? "America/Sao_Paulo",
      ),
      status: String(agent.status),
      version: agent.version ? String(agent.version) : null,
      platform: agent.platform ? String(agent.platform) : null,
      architecture: agent.architecture
        ? String(agent.architecture)
        : null,
      lastHeartbeatAt: agent.last_heartbeat_at
        ? String(agent.last_heartbeat_at)
        : null,
      cpuPercent:
        health?.cpu_percent === null || health?.cpu_percent === undefined
          ? null
          : Number(health.cpu_percent),
      memoryBytes:
        health?.memory_bytes === null ||
        health?.memory_bytes === undefined
          ? null
          : Number(health.memory_bytes),
      diskFreeBytes:
        health?.disk_free_bytes === null || health?.disk_free_bytes === undefined
          ? null
          : Number(health.disk_free_bytes),
      queuedEvents: Number(health?.queued_events ?? 0),
    };
  });

  const cameras = cameraResult.data ?? [];

  const downloads: InstallerDownload[] = (
    ["windows", "linux-x64", "linux-arm64"] as const
  ).map((platform) => ({
    platform,
    label: PLATFORM_LABELS[platform],
    available: Boolean(installerUrlFor(platform)),
  }));

  const storeUrl = publicStoreUrl();

  return {
    agents,
    totalCameras: cameras.length,
    pairedCameras: cameras.filter(
      (camera: any) => camera.pairing_status === "paired",
    ).length,
    recommendedVersion:
      process.env.AGENT_RECOMMENDED_VERSION?.trim() || "1.0.3",
    downloads,
    storeDistribution: {
      label: "Microsoft Store",
      available: Boolean(storeUrl),
      url: storeUrl,
    },
    downloadAvailable:
      downloads.some((download) => download.available) || Boolean(storeUrl),
  };
}
