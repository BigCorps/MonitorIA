import { createClient } from "@/src/lib/supabase/server";
import { appConfig } from "@/src/lib/app-config";

export async function buildSupportDiagnostics(input: {
  organizationId: string;
  organizationName: string;
}) {
  const supabase = await createClient();
  const now = new Date();
  const expiredBefore = now.toISOString();
  const recentFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [agents, cameras, alerts, intelligentAlerts, analysisFailures, clipFailures, expiredAssets] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id,name,status,version,platform,architecture,last_heartbeat_at,site:sites(name,timezone)")
        .eq("organization_id", input.organizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("cameras")
        .select("id,name,status,pairing_status,last_seen_at,health_status,health_last_observed_at,site:sites(name)")
        .eq("organization_id", input.organizationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("operational_alerts")
        .select("alert_code,severity,status,last_observed_at,condition")
        .eq("organization_id", input.organizationId)
        .in("status", ["open", "acknowledged"])
        .order("last_observed_at", { ascending: false })
        .limit(100),
      supabase
        .from("intelligent_alerts")
        .select("alert_code,severity,status,last_observed_at,confidence,reason,threshold")
        .eq("organization_id", input.organizationId)
        .in("status", ["open", "acknowledged"])
        .order("last_observed_at", { ascending: false })
        .limit(100),
      supabase
        .from("analysis_jobs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .eq("status", "failed")
        .gte("created_at", recentFrom),
      supabase
        .from("clip_generation_requests")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .eq("status", "failed")
        .gte("updated_at", recentFrom),
      supabase
        .from("storage_assets")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", input.organizationId)
        .lt("expires_at", expiredBefore)
        .is("deleted_at", null),
    ]);

  const queryErrors = [agents, cameras, alerts, intelligentAlerts, analysisFailures, clipFailures, expiredAssets]
    .map((result) => result.error?.code)
    .filter(Boolean);

  return {
    schemaVersion: "monitoria-support-diagnostics/1",
    generatedAt: now.toISOString(),
    privacy: {
      excluded: [
        "credenciais e URLs RTSP",
        "endereços IP",
        "tokens e segredos",
        "imagens, vídeos e descrições de acontecimentos",
        "payloads de pagamento",
      ],
    },
    application: {
      version: appConfig.version,
      recommendedAgentVersion: process.env.AGENT_RECOMMENDED_VERSION ?? "0.15.1",
    },
    organization: {
      id: input.organizationId,
      name: input.organizationName,
    },
    agents: (agents.data ?? []).map((agent: any) => ({
      id: agent.id,
      name: agent.name,
      site: Array.isArray(agent.site) ? agent.site[0] ?? null : agent.site,
      status: agent.status,
      version: agent.version,
      platform: agent.platform,
      architecture: agent.architecture,
      lastHeartbeatAt: agent.last_heartbeat_at,
    })),
    cameras: (cameras.data ?? []).map((camera: any) => ({
      id: camera.id,
      name: camera.name,
      site: Array.isArray(camera.site) ? camera.site[0] ?? null : camera.site,
      status: camera.status,
      pairingStatus: camera.pairing_status,
      lastSeenAt: camera.last_seen_at,
      healthStatus: camera.health_status,
      healthLastObservedAt: camera.health_last_observed_at,
    })),
    activeAlerts: alerts.data ?? [],
    activeIntelligentAlerts: intelligentAlerts.data ?? [],
    last24Hours: {
      failedAnalyses: analysisFailures.count ?? null,
      failedClips: clipFailures.count ?? null,
      expiredAssetsAwaitingPurge: expiredAssets.count ?? null,
    },
    diagnostics: {
      complete: queryErrors.length === 0,
      queryErrorCodes: queryErrors,
    },
  };
}
