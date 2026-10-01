import "server-only";

import { createAdminClient } from "@/src/lib/supabase/admin";
import type {
  VipOnboardingCameraReadiness,
  VipOnboardingSnapshot,
  VipProjectStatus,
} from "./types";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function cameraReadiness(value: unknown): VipOnboardingCameraReadiness[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = objectValue(item);
    return {
      cameraId: row.cameraId ? String(row.cameraId) : null,
      cameraName: row.cameraName ? String(row.cameraName) : null,
      sourceKind: row.sourceKind ? String(row.sourceKind) : null,
      ready: row.ready === true,
      reasons: Array.isArray(row.reasons)
        ? row.reasons.map((reason) => String(reason))
        : [],
    };
  });
}

function snapshotFrom(value: unknown, status: VipProjectStatus): VipOnboardingSnapshot {
  const row = objectValue(value);
  return {
    checkedAt: row.checkedAt ? String(row.checkedAt) : null,
    projectStatus: (row.projectStatus ? String(row.projectStatus) : status) as VipProjectStatus,
    workspaceLinked: row.workspaceLinked === true,
    agentsTotal: Number(row.agentsTotal ?? 0),
    agentsOnline: Number(row.agentsOnline ?? 0),
    camerasTotal: Number(row.camerasTotal ?? 0),
    camerasNamed: Number(row.camerasNamed ?? 0),
    activeProfiles: Number(row.activeProfiles ?? 0),
    trialId: row.trialId ? String(row.trialId) : null,
    trialStatus: row.trialStatus ? String(row.trialStatus) : null,
    trialCameras: Number(row.trialCameras ?? 0),
    trialReadyCameras: Number(row.trialReadyCameras ?? 0),
    cameraReadiness: cameraReadiness(row.cameraReadiness),
    attentionCode: row.attentionCode ? String(row.attentionCode) : null,
  };
}

export async function refreshVipOnboarding(
  projectId: string,
  touchActivity = true,
) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("refresh_vip_onboarding_v1", {
    p_project_id: projectId,
    p_touch_activity: touchActivity,
  });

  if (error) {
    console.error("Falha ao atualizar onboarding VIP:", error.message);
    throw new Error("vip_onboarding_refresh_failed");
  }

  const result = objectValue(data);
  if (result.success !== true) {
    throw new Error("vip_onboarding_refresh_failed");
  }

  const status = String(result.status) as VipProjectStatus;
  return {
    projectId: String(result.projectId ?? projectId),
    status,
    attentionCode: result.attentionCode ? String(result.attentionCode) : null,
    snapshot: snapshotFrom(result.snapshot, status),
  };
}
