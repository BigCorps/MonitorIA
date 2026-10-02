import "server-only";

import {
  deriveCameraProductState,
  type CameraProductExperience,
  type CameraProductState,
  type CameraProductStatus,
} from "@/src/camera/product-state";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type CameraProductSiteSummary = {
  id: string;
  name: string;
  cameras: number;
  monitoring: number;
  needsConfiguration: number;
  attention: number;
  offline: number;
  agentsTotal: number;
  agentsOnline: number;
};

export type OrganizationCameraProductHealth = {
  cameras: CameraProductState[];
  sites: CameraProductSiteSummary[];
  agents: {
    total: number;
    online: number;
  };
  summary: Record<CameraProductStatus, number> & {
    total: number;
  };
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

function recent(value: unknown, maximumMinutes: number, now: number) {
  if (!value) return false;
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) && now - timestamp <= maximumMinutes * 60_000;
}

function dateMs(value: unknown) {
  const timestamp = value ? Date.parse(String(value)) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function newestByCamera(
  rows: Array<Record<string, unknown>>,
  dateKey: string,
) {
  const result = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const cameraId = String(row.camera_id ?? "");
    if (!cameraId) continue;
    const current = result.get(cameraId);
    if (!current || dateMs(row[dateKey]) > dateMs(current[dateKey])) {
      result.set(cameraId, row);
    }
  }

  return result;
}

export async function getOrganizationCameraProductHealth(
  organizationId: string,
  options: {
    vipOnly?: boolean;
    experience?: CameraProductExperience;
  } = {},
): Promise<OrganizationCameraProductHealth> {
  const admin = createAdminClient();
  const now = Date.now();

  let vipCameraIds: Set<string> | null = null;
  let vipSiteIds: Set<string> | null = null;

  if (options.vipOnly) {
    const [cameraLinks, siteLinks] = await Promise.all([
      admin
        .from("vip_project_cameras")
        .select("camera_id,site_id")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      admin
        .from("vip_project_sites")
        .select("site_id")
        .eq("organization_id", organizationId)
        .eq("status", "active"),
    ]);

    const linkError = cameraLinks.error ?? siteLinks.error;
    if (linkError) {
      throw new Error(`camera_product_health_vip_scope:${linkError.message}`);
    }

    vipCameraIds = new Set(
      (cameraLinks.data ?? []).map((row) => String(row.camera_id)),
    );
    vipSiteIds = new Set(
      (siteLinks.data ?? []).map((row) => String(row.site_id)),
    );
    for (const row of cameraLinks.data ?? []) {
      if (row.site_id) vipSiteIds.add(String(row.site_id));
    }
  }

  const [cameraResult, siteResult, agentResult] = await Promise.all([
    admin
      .from("cameras")
      .select(
        "id,site_id,name,status,source_kind,pairing_status,last_seen_at,analysis_plan_code,health_status,health_last_observed_at,site:sites(id,name)",
      )
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    admin
      .from("sites")
      .select("id,name")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true }),
    admin
      .from("agents")
      .select("id,site_id,name,status,last_heartbeat_at")
      .eq("organization_id", organizationId)
      .neq("status", "disabled"),
  ]);

  if (cameraResult.error) {
    throw new Error(`camera_product_health_cameras:${cameraResult.error.message}`);
  }
  if (siteResult.error) {
    throw new Error(`camera_product_health_sites:${siteResult.error.message}`);
  }
  if (agentResult.error) {
    throw new Error(`camera_product_health_agents:${agentResult.error.message}`);
  }

  const cameraRows = (cameraResult.data ?? [])
    .map(objectValue)
    .filter((row) => !vipCameraIds || vipCameraIds.has(String(row.id)));

  const relevantSiteIds = new Set(
    cameraRows.map((row) => String(row.site_id)).filter(Boolean),
  );
  for (const siteId of vipSiteIds ?? []) relevantSiteIds.add(siteId);

  const siteRows = (siteResult.data ?? []).filter(
    (row) => !vipSiteIds || relevantSiteIds.has(String(row.id)),
  );
  const agentRows = (agentResult.data ?? [])
    .map(objectValue)
    .filter(
      (row) =>
        !vipSiteIds ||
        relevantSiteIds.has(String(row.site_id)),
    );

  const cameraIds = cameraRows.map((row) => String(row.id)).filter(Boolean);
  const agentIds = agentRows.map((row) => String(row.id)).filter(Boolean);

  if (!cameraIds.length) {
    return {
      cameras: [],
      sites: siteRows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        cameras: 0,
        monitoring: 0,
        needsConfiguration: 0,
        attention: 0,
        offline: 0,
        agentsTotal: agentRows.filter(
          (agent) => String(agent.site_id) === String(row.id),
        ).length,
        agentsOnline: agentRows.filter(
          (agent) =>
            String(agent.site_id) === String(row.id) &&
            String(agent.status) === "online" &&
            recent(agent.last_heartbeat_at, 10, now),
        ).length,
      })),
      agents: {
        total: agentRows.length,
        online: agentRows.filter(
          (row) =>
            String(row.status) === "online" &&
            recent(row.last_heartbeat_at, 10, now),
        ).length,
      },
      summary: {
        total: 0,
        connecting: 0,
        needs_configuration: 0,
        ready_to_monitor: 0,
        monitoring: 0,
        attention_required: 0,
        offline: 0,
      },
    };
  }

  const [
    entitlementResult,
    profileResult,
    mappingResult,
    assetResult,
    sessionResult,
    ingestionResult,
    gapResult,
  ] = await Promise.all([
    admin
      .from("camera_entitlements")
      .select("camera_id,monitoring_allowed,plan_code,access_source")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds),
    admin
      .from("camera_profiles")
      .select("camera_id,id,version,is_active,reviewed_at,created_at")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .eq("is_active", true),
    agentIds.length
      ? admin
          .from("agent_cameras")
          .select("camera_id,agent_id,enabled,updated_at")
          .in("camera_id", cameraIds)
          .in("agent_id", agentIds)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("storage_assets")
      .select("camera_id,captured_at,kind")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .eq("status", "ready")
      .is("deleted_at", null)
      .in("kind", ["analysis_frame", "event_keyframe"])
      .order("captured_at", { ascending: false })
      .limit(Math.min(2000, cameraIds.length * 20)),
    admin
      .from("capture_sessions")
      .select(
        "camera_id,agent_id,started_at,frames_observed,events_created,metadata",
      )
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .is("ended_at", null),
    admin
      .from("event_ingestions")
      .select("camera_id,completed_at,created_at,status")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(Math.min(2000, cameraIds.length * 20)),
    admin
      .from("camera_evidence_gaps")
      .select("camera_id,created_at,status,resolved_at,reason")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, cameraIds.length * 10)),
  ]);

  const queryErrors = [
    entitlementResult.error,
    profileResult.error,
    mappingResult.error,
    assetResult.error,
    sessionResult.error,
    ingestionResult.error,
    gapResult.error,
  ].filter(Boolean);

  if (queryErrors.length) {
    throw new Error(
      `camera_product_health_dependencies:${queryErrors
        .map((error) => error?.message ?? "unknown")
        .join(" | ")}`,
    );
  }

  const entitlementByCamera = new Map(
    (entitlementResult.data ?? []).map((row) => [String(row.camera_id), row]),
  );
  const profileByCamera = newestByCamera(
    (profileResult.data ?? []).map(objectValue),
    "created_at",
  );
  const assetByCamera = newestByCamera(
    (assetResult.data ?? []).map(objectValue),
    "captured_at",
  );
  const ingestionByCamera = newestByCamera(
    (ingestionResult.data ?? []).map(objectValue),
    "completed_at",
  );
  const gapByCamera = newestByCamera(
    (gapResult.data ?? []).map(objectValue),
    "created_at",
  );
  const sessionByCamera = new Map(
    (sessionResult.data ?? []).map((row) => [String(row.camera_id), objectValue(row)]),
  );
  const agentById = new Map(agentRows.map((row) => [String(row.id), row]));

  const mappingByCamera = new Map<string, Record<string, unknown>>();
  for (const raw of mappingResult.data ?? []) {
    const row = objectValue(raw);
    const cameraId = String(row.camera_id ?? "");
    const current = mappingByCamera.get(cameraId);
    if (!current || (row.enabled === true && current.enabled !== true)) {
      mappingByCamera.set(cameraId, row);
    }
  }

  const cameras = cameraRows.map((row) => {
    const id = String(row.id);
    const site = relationValue(row.site);
    const sourceKind =
      row.source_kind === "local_recording" ? "local_recording" : "live_camera";
    const mapping = mappingByCamera.get(id) ?? null;
    const agent = mapping ? agentById.get(String(mapping.agent_id)) ?? null : null;
    const entitlement = entitlementByCamera.get(id) ?? null;
    const asset = assetByCamera.get(id) ?? null;
    const profile = profileByCamera.get(id) ?? null;
    const session = sessionByCamera.get(id) ?? null;
    const latestIngestion = ingestionByCamera.get(id) ?? null;
    const latestGap = gapByCamera.get(id) ?? null;

    const gapCreatedAt = dateMs(latestGap?.created_at);
    const latestSuccessAt = dateMs(latestIngestion?.completed_at);
    const recentUnresolvedGap =
      gapCreatedAt > 0 &&
      now - gapCreatedAt <= 60 * 60_000 &&
      latestSuccessAt <= gapCreatedAt;
    const visualHealthStatus = row.health_status
      ? String(row.health_status)
      : null;
    const visualHealthIssue =
      ["degraded", "critical"].includes(visualHealthStatus ?? "") &&
      recent(row.health_last_observed_at, 20, now);

    // "Imagem recebida" só fica verde com evidência visual real armazenada.
    // last_seen_at prova contato com a câmera, não prova que um frame chegou.
    const imageReceived = Boolean(asset);
    const agentOnline = agent ? String(agent.status) === "online" : false;
    const agentHeartbeatRecent = agent
      ? recent(agent.last_heartbeat_at, 10, now)
      : false;

    return deriveCameraProductState({
      id,
      name: String(row.name ?? "Câmera"),
      siteId: String(row.site_id ?? ""),
      siteName: String(site?.name ?? "Local"),
      sourceKind,
      cameraOnline:
        sourceKind === "local_recording" || String(row.status) === "online",
      cameraPaired:
        sourceKind === "local_recording" || String(row.pairing_status) === "paired",
      imageReceived,
      planReady: entitlement?.monitoring_allowed === true,
      planCode: entitlement?.plan_code ? String(entitlement.plan_code) : null,
      profileReady: Boolean(profile),
      agentMapped: sourceKind === "local_recording" || Boolean(mapping),
      agentEnabled: sourceKind === "local_recording" || mapping?.enabled === true,
      agentOnline: sourceKind === "local_recording" || agentOnline,
      agentHeartbeatRecent: sourceKind === "local_recording" || agentHeartbeatRecent,
      monitorActive: sourceKind === "local_recording" || Boolean(session),
      pipelineIssue:
        sourceKind === "live_camera" &&
        Boolean(session) &&
        (recentUnresolvedGap || visualHealthIssue),
      visualHealthStatus,
      latestAnalysisAt: latestIngestion?.completed_at
        ? String(latestIngestion.completed_at)
        : null,
      latestImageAt: asset?.captured_at ? String(asset.captured_at) : null,
    }, {
      experience:
        options.experience ?? (options.vipOnly ? "vip" : "standard"),
    });
  });

  const summary = {
    total: cameras.length,
    connecting: 0,
    needs_configuration: 0,
    ready_to_monitor: 0,
    monitoring: 0,
    attention_required: 0,
    offline: 0,
  } satisfies OrganizationCameraProductHealth["summary"];

  for (const camera of cameras) {
    summary[camera.status] += 1;
  }

  const sites = siteRows.map((row) => {
    const siteCameras = cameras.filter((camera) => camera.siteId === String(row.id));
    return {
      id: String(row.id),
      name: String(row.name),
      cameras: siteCameras.length,
      monitoring: siteCameras.filter((camera) => camera.status === "monitoring").length,
      needsConfiguration: siteCameras.filter(
        (camera) =>
          camera.status === "needs_configuration" ||
          camera.status === "connecting" ||
          camera.status === "ready_to_monitor",
      ).length,
      attention: siteCameras.filter(
        (camera) => camera.status === "attention_required",
      ).length,
      offline: siteCameras.filter((camera) => camera.status === "offline").length,
      agentsTotal: agentRows.filter(
        (agent) => String(agent.site_id) === String(row.id),
      ).length,
      agentsOnline: agentRows.filter(
        (agent) =>
          String(agent.site_id) === String(row.id) &&
          String(agent.status) === "online" &&
          recent(agent.last_heartbeat_at, 10, now),
      ).length,
    };
  });

  return {
    cameras,
    sites,
    agents: {
      total: agentRows.length,
      online: agentRows.filter(
        (row) =>
          String(row.status) === "online" &&
          recent(row.last_heartbeat_at, 10, now),
      ).length,
    },
    summary,
  };
}
