import type {
  VipBillingCycle,
  VipPlanCatalogEntry,
  VipPlanCode,
} from "./types";

export const VIP_TECHNICAL_PLAN_CODE = "intensive" as const;
export const VIP_TRIAL_DURATION_MINUTES = 60 as const;
export const VIP_TRIAL_MAX_CAMERAS = 6 as const;
export const VIP_MINIMUM_PACKAGE_CAMERAS = 10 as const;

export type VipQuote = {
  planCode: VipPlanCode;
  billingCycle: VipBillingCycle;
  requestedCameras: number;
  includedCameras: number;
  excessCameras: number;
  baseContractCents: number;
  baseMonthlyCents: number;
  excessCameraMonthlyCents: number;
  excessMonthlyTotalCents: number;
  monthlyOperatingTotalCents: number;
};

function assertCameraCount(cameraCount: number) {
  if (!Number.isInteger(cameraCount) || cameraCount < 1) {
    throw new Error("invalid_vip_camera_count");
  }
}

export function quoteVipPlan(
  plan: VipPlanCatalogEntry,
  cameraCount: number,
  billingCycle: VipBillingCycle,
): VipQuote {
  assertCameraCount(cameraCount);

  const excessCameras = Math.max(0, cameraCount - plan.includedCameras);
  const excessMonthlyTotalCents =
    excessCameras * plan.excessCameraMonthlyCents;

  return {
    planCode: plan.code,
    billingCycle,
    requestedCameras: cameraCount,
    includedCameras: plan.includedCameras,
    excessCameras,
    baseContractCents:
      billingCycle === "annual"
        ? plan.annualAmountCents
        : plan.monthlyAmountCents,
    baseMonthlyCents: plan.monthlyAmountCents,
    excessCameraMonthlyCents: plan.excessCameraMonthlyCents,
    excessMonthlyTotalCents,
    monthlyOperatingTotalCents:
      plan.monthlyAmountCents + excessMonthlyTotalCents,
  };
}

/**
 * Compara o custo mensal operacional dos pacotes, incluindo excedentes.
 * O anual continua tendo sua base anual separada e o excedente é mensal.
 */
export function cheapestVipPlanForMonthlyCameraCount(
  plans: VipPlanCatalogEntry[],
  cameraCount: number,
): VipPlanCatalogEntry | null {
  assertCameraCount(cameraCount);

  const active = plans.filter((plan) => plan.isActive);
  if (!active.length) return null;

  return [...active].sort((left, right) => {
    const leftQuote = quoteVipPlan(left, cameraCount, "monthly");
    const rightQuote = quoteVipPlan(right, cameraCount, "monthly");

    if (
      leftQuote.monthlyOperatingTotalCents !==
      rightQuote.monthlyOperatingTotalCents
    ) {
      return (
        leftQuote.monthlyOperatingTotalCents -
        rightQuote.monthlyOperatingTotalCents
      );
    }

    return left.includedCameras - right.includedCameras;
  })[0] ?? null;
}

export function vipPlanUpgradeIsCheaper(
  currentPlan: VipPlanCatalogEntry,
  candidatePlan: VipPlanCatalogEntry,
  cameraCount: number,
) {
  return (
    quoteVipPlan(candidatePlan, cameraCount, "monthly")
      .monthlyOperatingTotalCents <
    quoteVipPlan(currentPlan, cameraCount, "monthly")
      .monthlyOperatingTotalCents
  );
}
