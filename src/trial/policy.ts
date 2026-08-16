import type { CommercialPlanCode } from "@/src/billing/types";

export type TrialMode = "self_service" | "sales_assisted";

export type TrialPolicy = {
  mode: TrialMode;
  durationMinutes: number;
  maxCameras: number;
  defaultPlanCode: CommercialPlanCode | null;
};

export const SELF_SERVICE_TRIAL_POLICY = {
  mode: "self_service",
  durationMinutes: 24 * 60,
  maxCameras: 1,
  defaultPlanCode: null,
} as const satisfies TrialPolicy;

export const SALES_ASSISTED_TRIAL_POLICY = {
  mode: "sales_assisted",
  durationMinutes: 60,
  maxCameras: 6,
  defaultPlanCode: "intensive",
} as const satisfies TrialPolicy;

export function trialPolicyForMode(mode: TrialMode): TrialPolicy {
  return mode === "sales_assisted"
    ? SALES_ASSISTED_TRIAL_POLICY
    : SELF_SERVICE_TRIAL_POLICY;
}
