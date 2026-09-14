import { createAdminClient } from "@/src/lib/supabase/admin";
import { getReleaseGateOverview } from "@/src/lib/launch-readiness-data";

export type AdminOverviewSnapshot = {
  generatedAt: string;
  summary: {
    organizations: number;
    organizations30d: number;
    cameras: number;
    camerasRecent: number;
    agentsOnline: number;
    agentsStale: number;
    activeSubscriptions: number;
    runningTrials: number;
    convertedTrials30d: number;
    revenueMonthCents: number;
    pendingPix: number;
    openHealthIncidents: number;
    openAiAlerts: number;
  };
  organizations: Array<{
    id: string;
    name: string;
    planCode: string;
    cameras: number;
    activeSubscriptions: number;
    lastCameraSeenAt: string | null;
    status: "online" | "attention" | "inactive";
  }>;
  attention: Array<{
    id: string;
    category: "camera" | "agent" | "billing" | "ai" | "trial";
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
    occurredAt: string | null;
    href: string;
  }>;
  activity: Array<{
    id: string;
    type: "organization" | "payment" | "trial";
    title: string;
    detail: string;
    occurredAt: string;
    amountCents: number | null;
  }>;
  release: Awaited<ReturnType<typeof getReleaseGateOverview>>;
};

const RECENT_CAMERA_MS = 15 * 60 * 1000;
const RECENT_AGENT_MS = 5 * 60 * 1000;

function nowMinus(ms: number) {
  return new Date(Date.now() - ms).toISOString();
}

function monthStartIso() {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0),
  ).toISOString();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getAdminOverviewData(): Promise<AdminOverviewSnapshot> {
  const admin = createAdminClient();
  const cameraRecentSince = nowMinus(RECENT_CAMERA_MS);
  const agentRecentSince = nowMinus(RECENT_AGENT_MS);
  const last30d = daysAgoIso(30);
  const monthStart = monthStartIso();

  const [
    organizationsResult,
    camerasResult,
    agentsResult,
    subscriptionsResult,
    trialsResult,
    invoicesResult,
    pixResult,
    healthResult,
    aiAlertsResult,
    release,
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id,name,plan_code,created_at,updated_at")
      .order("created_at", { ascending: false }),
    admin
      .from("cameras")
      .select("id,organization_id,name,status,last_seen_at,health_status,created_at")
      .order("last_seen_at", { ascending: false, nullsFirst: false }),
    admin
      .from("agents")
      .select("id,organization_id,name,status,version,last_heartbeat_at,created_at")
      .order("last_heartbeat_at", { ascending: false, nullsFirst: false }),
    admin
      .from("camera_subscriptions")
      .select("organization_id,camera_id,status,plan_code,activated_at,created_at"),
    admin
      .from("trial_runs")
      .select("id,organization_id,status,trial_mode,capture_started_at,converted_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("billing_invoices")
      .select("id,organization_id,status,total_cents,paid_at,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("billing_pix_payments")
      .select("id,organization_id,status,amount_cents,confirmed_at,error_code,error_message,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("camera_health_incidents")
      .select("id,organization_id,camera_id,status,severity,title,summary,last_observed_at")
      .in("status", ["observing", "open"])
      .order("last_observed_at", { ascending: false })
      .limit(100),
    admin
      .from("ai_cost_alerts")
      .select("id,organization_id,camera_id,status,severity,alert_type,last_seen_at")
      .neq("status", "resolved")
      .order("last_seen_at", { ascending: false })
      .limit(100),
    getReleaseGateOverview(),
  ]);

  const firstError = [
    organizationsResult.error,
    camerasResult.error,
    agentsResult.error,
    subscriptionsResult.error,
    trialsResult.error,
    invoicesResult.error,
    pixResult.error,
    healthResult.error,
    aiAlertsResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(`admin_overview_unavailable:${firstError.message}`);
  }

  const organizations = organizationsResult.data ?? [];
  const cameras = camerasResult.data ?? [];
  const agents = agentsResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];
  const trials = trialsResult.data ?? [];
  const invoices = invoicesResult.data ?? [];
  const pix = pixResult.data ?? [];
  const health = healthResult.data ?? [];
  const aiAlerts = aiAlertsResult.data ?? [];

  const activeSubscriptions = subscriptions.filter((row: any) =>
    ["active", "trialing", "grace"].includes(String(row.status)),
  );

  const revenueMonthCents = invoices
    .filter(
      (row: any) =>
        row.paid_at &&
        String(row.paid_at) >= monthStart &&
        String(row.status) === "paid",
    )
    .reduce((total: number, row: any) => total + numberValue(row.total_cents), 0);

  const pendingPixRows = pix.filter((row: any) =>
    ["pending", "created", "waiting", "processing"].includes(String(row.status)),
  );

  const camerasByOrg = new Map<string, any[]>();
  for (const camera of cameras) {
    const id = String((camera as any).organization_id);
    const current = camerasByOrg.get(id) ?? [];
    current.push(camera);
    camerasByOrg.set(id, current);
  }

  const subsByOrg = new Map<string, number>();
  for (const sub of activeSubscriptions) {
    const id = String((sub as any).organization_id);
    subsByOrg.set(id, (subsByOrg.get(id) ?? 0) + 1);
  }

  const organizationCards = organizations.map((org: any) => {
    const orgCameras = camerasByOrg.get(String(org.id)) ?? [];
    const recentCameras = orgCameras.filter(
      (camera: any) =>
        camera.last_seen_at && String(camera.last_seen_at) >= cameraRecentSince,
    );
    const attentionCamera = orgCameras.some((camera: any) =>
      ["critical", "offline", "degraded"].includes(String(camera.health_status)),
    );
    const lastCameraSeenAt =
      orgCameras
        .map((camera: any) => camera.last_seen_at)
        .filter(Boolean)
        .map(String)
        .sort()
        .at(-1) ?? null;

    return {
      id: String(org.id),
      name: String(org.name ?? "Organização"),
      planCode: String(org.plan_code ?? "basic"),
      cameras: orgCameras.length,
      activeSubscriptions: subsByOrg.get(String(org.id)) ?? 0,
      lastCameraSeenAt,
      status: recentCameras.length
        ? attentionCamera
          ? ("attention" as const)
          : ("online" as const)
        : ("inactive" as const),
    };
  });

  const attention: AdminOverviewSnapshot["attention"] = [];

  for (const row of health.slice(0, 12) as any[]) {
    attention.push({
      id: `health-${row.id}`,
      category: "camera",
      severity:
        String(row.severity) === "critical" || String(row.severity) === "high"
          ? "high"
          : String(row.severity) === "medium"
            ? "medium"
            : "low",
      title: String(row.title ?? "Câmera requer atenção"),
      detail: String(row.summary ?? "Verifique a saúde da câmera."),
      occurredAt: row.last_observed_at ? String(row.last_observed_at) : null,
      href: "/dashboard/camera-health",
    });
  }

  for (const row of aiAlerts.slice(0, 8) as any[]) {
    attention.push({
      id: `ai-${row.id}`,
      category: "ai",
      severity: String(row.severity) === "critical" ? "high" : "medium",
      title: "Alerta de IA e margem",
      detail: String(row.alert_type ?? "Consumo fora do esperado."),
      occurredAt: row.last_seen_at ? String(row.last_seen_at) : null,
      href: "/dashboard/operations/ai",
    });
  }

  for (const row of pendingPixRows.slice(0, 8) as any[]) {
    const hasError = Boolean(row.error_code || row.error_message);
    attention.push({
      id: `pix-${row.id}`,
      category: "billing",
      severity: hasError ? "high" : "medium",
      title: hasError ? "Pagamento Pix com erro" : "Pix aguardando confirmação",
      detail: hasError
        ? String(row.error_message ?? row.error_code ?? "Falha no provedor.")
        : `Cobrança de ${(numberValue(row.amount_cents) / 100).toLocaleString(
            "pt-BR",
            { style: "currency", currency: "BRL" },
          )} ainda pendente.`,
      occurredAt: row.updated_at ? String(row.updated_at) : String(row.created_at),
      href: "/dashboard/admin/finance",
    });
  }

  const staleAgents = agents.filter(
    (row: any) =>
      String(row.status) === "online" &&
      (!row.last_heartbeat_at || String(row.last_heartbeat_at) < agentRecentSince),
  );

  for (const row of staleAgents.slice(0, 8) as any[]) {
    attention.push({
      id: `agent-${row.id}`,
      category: "agent",
      severity: "high",
      title: "Agent sem heartbeat recente",
      detail: `${String(row.name ?? "Agent")} · versão ${String(row.version ?? "—")}`,
      occurredAt: row.last_heartbeat_at ? String(row.last_heartbeat_at) : null,
      href: "/dashboard/installer",
    });
  }

  attention.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    if (order[a.severity] !== order[b.severity]) {
      return order[a.severity] - order[b.severity];
    }
    return String(b.occurredAt ?? "").localeCompare(String(a.occurredAt ?? ""));
  });

  const orgNameById = new Map(
    organizations.map((row: any) => [String(row.id), String(row.name ?? "Organização")]),
  );

  const activity: AdminOverviewSnapshot["activity"] = [];

  for (const row of organizations.slice(0, 8) as any[]) {
    activity.push({
      id: `org-${row.id}`,
      type: "organization",
      title: "Nova organização",
      detail: String(row.name ?? "Organização"),
      occurredAt: String(row.created_at),
      amountCents: null,
    });
  }

  for (const row of invoices
    .filter((invoice: any) => invoice.status === "paid" && invoice.paid_at)
    .slice(0, 8) as any[]) {
    activity.push({
      id: `invoice-${row.id}`,
      type: "payment",
      title: "Pagamento confirmado",
      detail: orgNameById.get(String(row.organization_id)) ?? "Organização",
      occurredAt: String(row.paid_at),
      amountCents: numberValue(row.total_cents),
    });
  }

  for (const row of trials
    .filter((trial: any) => trial.converted_at)
    .slice(0, 8) as any[]) {
    activity.push({
      id: `trial-${row.id}`,
      type: "trial",
      title: "Trial convertido",
      detail: orgNameById.get(String(row.organization_id)) ?? "Organização",
      occurredAt: String(row.converted_at),
      amountCents: null,
    });
  }

  activity.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      organizations: organizations.length,
      organizations30d: organizations.filter(
        (row: any) => String(row.created_at) >= last30d,
      ).length,
      cameras: cameras.length,
      camerasRecent: cameras.filter(
        (row: any) =>
          row.last_seen_at && String(row.last_seen_at) >= cameraRecentSince,
      ).length,
      agentsOnline: agents.filter(
        (row: any) =>
          String(row.status) === "online" &&
          row.last_heartbeat_at &&
          String(row.last_heartbeat_at) >= agentRecentSince,
      ).length,
      agentsStale: staleAgents.length,
      activeSubscriptions: activeSubscriptions.length,
      runningTrials: trials.filter((row: any) => String(row.status) === "running").length,
      convertedTrials30d: trials.filter(
        (row: any) => row.converted_at && String(row.converted_at) >= last30d,
      ).length,
      revenueMonthCents,
      pendingPix: pendingPixRows.length,
      openHealthIncidents: health.length,
      openAiAlerts: aiAlerts.length,
    },
    organizations: organizationCards,
    attention: attention.slice(0, 16),
    activity: activity.slice(0, 16),
    release,
  };
}
