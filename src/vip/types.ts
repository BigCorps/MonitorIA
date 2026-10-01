export const VIP_PLAN_CODES = ["vip10", "vip50", "vip150"] as const;
export type VipPlanCode = (typeof VIP_PLAN_CODES)[number];

export const VIP_BILLING_CYCLES = ["monthly", "annual"] as const;
export type VipBillingCycle = (typeof VIP_BILLING_CYCLES)[number];

export const VIP_PROJECT_KINDS = [
  "enterprise",
  "large_monitoring",
  "scientific",
  "other",
] as const;
export type VipProjectKind = (typeof VIP_PROJECT_KINDS)[number];

export const VIP_PROJECT_STATUSES = [
  "lead",
  "invited",
  "project_setup",
  "installing",
  "calibrating",
  "ready_for_trial",
  "trial_running",
  "trial_completed",
  "proposal",
  "payment_pending",
  "active",
  "cancelled",
] as const;
export type VipProjectStatus = (typeof VIP_PROJECT_STATUSES)[number];

export type VipPlanCatalogEntry = {
  code: VipPlanCode;
  displayName: string;
  shortDescription: string;
  includedCameras: number;
  monthlyAmountCents: number;
  annualAmountCents: number;
  excessCameraMonthlyCents: number;
  technicalPlanCode: "intensive";
  trialDurationMinutes: 60;
  trialMaxCameras: 6;
  sortOrder: number;
  isActive: boolean;
};

export type VipOnboardingCameraReadiness = {
  cameraId: string | null;
  cameraName: string | null;
  sourceKind: string | null;
  ready: boolean;
  reasons: string[];
};

export type VipOnboardingSnapshot = {
  checkedAt: string | null;
  projectStatus: VipProjectStatus;
  workspaceLinked: boolean;
  agentsTotal: number;
  agentsOnline: number;
  camerasTotal: number;
  camerasNamed: number;
  activeProfiles: number;
  trialId: string | null;
  trialStatus: string | null;
  trialCameras: number;
  trialReadyCameras: number;
  cameraReadiness: VipOnboardingCameraReadiness[];
  attentionCode: string | null;
};

export type VipProject = {
  id: string;
  organizationId: string | null;
  salesOperatorId: string;
  name: string;
  companyName: string;
  leadName: string;
  leadEmail: string;
  projectKind: VipProjectKind;
  status: VipProjectStatus;
  selectedPlanCode: VipPlanCode;
  billingCycle: VipBillingCycle | null;
  expectedCameraCount: number;
  technicalPlanCode: "intensive";
  trialDurationMinutes: 60;
  trialMaxCameras: 6;
  objective: string | null;
  onboardingLastActivityAt: string | null;
  onboardingAttentionCode: string | null;
  onboardingSnapshot: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
