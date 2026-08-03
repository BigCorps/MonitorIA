import type {
  CommercialPlan,
  CommercialPlanCode,
} from "@/src/billing/types";
import type { CameraSummary } from "@/src/lib/dashboard-data";

export type TrialStatus =
  | "draft"
  | "ready"
  | "running"
  | "capture_completed"
  | "exploration"
  | "converted"
  | "expired"
  | "purged";

export type TrialReadinessReason =
  | "camera_not_found"
  | "camera_offline"
  | "camera_not_paired"
  | "active_profile_required"
  | "agent_camera_not_enabled"
  | "agent_offline"
  | "agent_heartbeat_stale"
  | string;

export type TrialReadiness = {
  ready: boolean;
  cameraFound: boolean;
  cameraId: string | null;
  cameraName: string | null;
  cameraOnline: boolean;
  cameraPaired: boolean;
  activeProfile: boolean;
  activeProfileId: string | null;
  agentCameraEnabled: boolean;
  agentId: string | null;
  agentName: string | null;
  agentOnline: boolean;
  agentHeartbeatRecent: boolean;
  lastHeartbeatAt: string | null;
  reasons: TrialReadinessReason[];
  checkedAt: string | null;
};

export type TrialRun = {
  id: string;
  organizationId: string;
  cameraId: string | null;
  selectedPlanCode: CommercialPlanCode | null;
  agentId: string | null;
  status: TrialStatus;
  readyAt: string | null;
  captureStartedAt: string | null;
  captureEndsAt: string | null;
  captureCompletedAt: string | null;
  explorationEndsAt: string | null;
  purgeAfter: string | null;
  convertedAt: string | null;
  expiredAt: string | null;
  purgedAt: string | null;
  interactionsUsed: number;
  interactionLimit: number;
  statusReason: string | null;
  readiness: TrialReadiness | null;
};

export type TrialAllowance = {
  id: string;
  includedInteractions: number;
  usedInteractions: number;
  remainingInteractions: number;
  periodStart: string;
  periodEnd: string;
};

export type TrialEntitlement = {
  accessSource: string;
  monitoringAllowed: boolean;
  planCode: CommercialPlanCode | null;
  captureEndsAt: string | null;
  explorationEndsAt: string | null;
  purgeAfter: string | null;
  assistantAccessAllowed: boolean;
  enforcementEnabled: boolean;
  reason: string;
};

export type TrialCamera = CameraSummary & {
  readiness: TrialReadiness;
  entitlement: TrialEntitlement | null;
};

export type TrialDashboardData = {
  trial: TrialRun | null;
  plans: CommercialPlan[];
  cameras: TrialCamera[];
  allowance: TrialAllowance | null;
  eventCount: number;
  canManage: boolean;
};
