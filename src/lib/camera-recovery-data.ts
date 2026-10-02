import "server-only";

import {
  deriveCameraRecoveryDiagnostic,
  type CameraRecoveryDiagnostic,
  type CameraRecoveryTelemetry,
} from "@/src/camera/recovery-diagnosis";
import type {
  CameraProductExperience,
  CameraProductState,
} from "@/src/camera/product-state";
import {
  getOrganizationCameraProductHealth,
  type OrganizationCameraProductHealth,
} from "@/src/lib/camera-product-state-data";
import { createAdminClient } from "@/src/lib/supabase/admin";

export type CameraRecoveryCamera = CameraProductState &
  CameraRecoveryTelemetry & {
    diagnosis: CameraRecoveryDiagnostic;
  };

export type OrganizationCameraRecoveryHealth = Omit<
  OrganizationCameraProductHealth,
  "cameras"
> & {
  cameras: CameraRecoveryCamera[];
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dateMs(value: unknown) {
  const parsed = value ? Date.parse(String(value)) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function newestBy(
  rows: Array<Record<string, unknown>>,
  keyName: string,
  dateName: string,
) {
  const result = new Map<string, Record<string, unknown>>();

  for (const row of rows) {
    const key = String(row[keyName] ?? "");
    if (!key) continue;
    const current = result.get(key);
    if (!current || dateMs(row[dateName]) > dateMs(current[dateName])) {
      result.set(key, row);
    }
  }

  return result;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function defaultTelemetry(): CameraRecoveryTelemetry {
  return {
    cameraLastSeenAt: null,
    agentLastHeartbeatAt: null,
    monitorStartedAt: null,
    latestGapAt: null,
    latestCameraErrorCode: null,
    latestCameraErrorAt: null,
    agentQueuePending: null,
    agentDiskFreeBytes: null,
    agentVersion: null,
    mappedAgentName: null,
    mappedAgentStatus: null,
    enabledMappingCount: 0,
  };
}

export async function getOrganizationCameraRecoveryHealth(
  organizationId: string,
  options: {
    vipOnly?: boolean;
    experience?: CameraProductExperience;
  } = {},
): Promise<OrganizationCameraRecoveryHealth> {
  const base = await getOrganizationCameraProductHealth(organizationId, options);
  const cameraIds = base.cameras.map((camera) => camera.id);
  const experience = options.experience ?? (options.vipOnly ? "vip" : "standard");

  if (!cameraIds.length) {
    return { ...base, cameras: [] };
  }

  const admin = createAdminClient();
  const [
    cameraResult,
    mappingResult,
    agentResult,
    agentHealthResult,
    sessionResult,
    errorResult,
    gapResult,
  ] = await Promise.all([
    admin
      .from("cameras")
      .select("id,last_seen_at")
      .eq("organization_id", organizationId)
      .in("id", cameraIds),
    admin
      .from("agent_cameras")
      .select("camera_id,agent_id,enabled,created_at,updated_at")
      .in("camera_id", cameraIds),
    admin
      .from("agents")
      .select("id,name,status,version,last_heartbeat_at,updated_at")
      .eq("organization_id", organizationId),
    admin
      .from("agent_health")
      .select("agent_id,recorded_at,queued_events,disk_free_bytes")
      .eq("organization_id", organizationId)
      .order("recorded_at", { ascending: false })
      .limit(Math.min(2000, Math.max(100, cameraIds.length * 30))),
    admin
      .from("capture_sessions")
      .select("camera_id,agent_id,started_at,created_at")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .is("ended_at", null),
    admin
      .from("audit_logs")
      .select("entity_id,created_at,metadata")
      .eq("organization_id", organizationId)
      .eq("entity_type", "camera")
      .eq("action", "camera.error")
      .in("entity_id", cameraIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, Math.max(100, cameraIds.length * 12))),
    admin
      .from("camera_evidence_gaps")
      .select("camera_id,created_at,resolved_at,reason")
      .eq("organization_id", organizationId)
      .in("camera_id", cameraIds)
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(1000, Math.max(100, cameraIds.length * 12))),
  ]);

  const optionalErrors = [
    ["cameras", cameraResult.error],
    ["agent_cameras", mappingResult.error],
    ["agents", agentResult.error],
    ["agent_health", agentHealthResult.error],
    ["capture_sessions", sessionResult.error],
    ["audit_logs", errorResult.error],
    ["camera_evidence_gaps", gapResult.error],
  ] as const;

  for (const [source, error] of optionalErrors) {
    if (error) {
      // Diagnóstico é uma camada de robustez: falha de telemetria opcional não
      // pode derrubar a página que o cliente usa justamente para se recuperar.
      console.error(`camera_recovery_${source}:${error.message}`);
    }
  }

  const cameraById = new Map(
    (cameraResult.data ?? []).map((row) => [String(row.id), objectValue(row)]),
  );
  const agentById = new Map(
    (agentResult.data ?? []).map((row) => [String(row.id), objectValue(row)]),
  );
  const latestHealthByAgent = newestBy(
    (agentHealthResult.data ?? []).map(objectValue),
    "agent_id",
    "recorded_at",
  );
  const latestSessionByCamera = newestBy(
    (sessionResult.data ?? []).map(objectValue),
    "camera_id",
    "started_at",
  );
  const latestErrorByCamera = newestBy(
    (errorResult.data ?? []).map(objectValue),
    "entity_id",
    "created_at",
  );
  const latestGapByCamera = newestBy(
    (gapResult.data ?? []).map(objectValue),
    "camera_id",
    "created_at",
  );

  const mappingsByCamera = new Map<string, Array<Record<string, unknown>>>();
  for (const raw of mappingResult.data ?? []) {
    const row = objectValue(raw);
    const cameraId = String(row.camera_id ?? "");
    if (!cameraId) continue;
    const list = mappingsByCamera.get(cameraId) ?? [];
    list.push(row);
    mappingsByCamera.set(cameraId, list);
  }

  const cameras = base.cameras.map((camera) => {
    const rawCamera = cameraById.get(camera.id) ?? {};
    const mappings = mappingsByCamera.get(camera.id) ?? [];
    const enabledMappings = mappings.filter((mapping) => mapping.enabled === true);
    const preferredMapping =
      enabledMappings
        .slice()
        .sort((left, right) => dateMs(right.updated_at) - dateMs(left.updated_at))[0] ??
      mappings
        .slice()
        .sort((left, right) => dateMs(right.updated_at) - dateMs(left.updated_at))[0] ??
      null;
    const agent = preferredMapping
      ? agentById.get(String(preferredMapping.agent_id)) ?? null
      : null;
    const latestAgentHealth = agent
      ? latestHealthByAgent.get(String(agent.id)) ?? null
      : null;
    const session = latestSessionByCamera.get(camera.id) ?? null;
    const gap = latestGapByCamera.get(camera.id) ?? null;
    const latestError = latestErrorByCamera.get(camera.id) ?? null;
    const errorMetadata = objectValue(latestError?.metadata);

    const cameraLastSeenAt = nullableString(rawCamera.last_seen_at);
    const errorAt = nullableString(latestError?.created_at);
    const lastHealthySignal = Math.max(
      dateMs(cameraLastSeenAt),
      dateMs(camera.latestImageAt),
    );
    const errorStillRelevant = dateMs(errorAt) > lastHealthySignal;

    const telemetry: CameraRecoveryTelemetry = {
      ...defaultTelemetry(),
      cameraLastSeenAt,
      agentLastHeartbeatAt: nullableString(agent?.last_heartbeat_at),
      monitorStartedAt: nullableString(session?.started_at),
      latestGapAt: nullableString(gap?.created_at),
      latestCameraErrorCode: errorStillRelevant
        ? nullableString(errorMetadata.error_code)
        : null,
      latestCameraErrorAt: errorStillRelevant ? errorAt : null,
      agentQueuePending: nonNegativeNumber(latestAgentHealth?.queued_events),
      agentDiskFreeBytes: nonNegativeNumber(latestAgentHealth?.disk_free_bytes),
      agentVersion: nullableString(agent?.version),
      mappedAgentName: nullableString(agent?.name),
      mappedAgentStatus: nullableString(agent?.status),
      enabledMappingCount: enabledMappings.length,
    };

    return {
      ...camera,
      ...telemetry,
      diagnosis: deriveCameraRecoveryDiagnostic(camera, telemetry, {
        experience,
      }),
    };
  });

  return {
    ...base,
    cameras,
  };
}
