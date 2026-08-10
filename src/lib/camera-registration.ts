import { CAMERA_ANALYSIS_PLANS } from "@/src/lib/analysis-plans";

type PendingCameraInput = {
  organizationId: string;
  siteId: string;
  name: string;
  description?: string;
  monitoringGoals?: string[];
};

/**
 * Mantém o cadastro criado no onboarding idêntico ao cadastro feito na tela
 * de câmeras. O plano comercial só é escolhido depois do primeiro acesso.
 */
export function pendingCameraValues(input: PendingCameraInput) {
  const settings = CAMERA_ANALYSIS_PLANS.basic;

  return {
    organization_id: input.organizationId,
    site_id: input.siteId,
    name: input.name.trim().slice(0, 160),
    description: (input.description ?? "").trim().slice(0, 500),
    analysis_plan_code: "basic",
    monitoring_goals: (input.monitoringGoals ?? []).slice(0, 12),
    capture_interval_seconds: settings.captureIntervalSeconds,
    consolidation_interval_seconds: settings.consolidationIntervalSeconds,
    motion_start_threshold: settings.motionStartThreshold,
    motion_continue_threshold: settings.motionContinueThreshold,
    event_close_after_seconds: settings.eventCloseAfterSeconds,
    motion_start_consecutive_frames: settings.motionStartConsecutiveFrames,
    motion_end_consecutive_frames: settings.motionEndConsecutiveFrames,
    motion_cooldown_seconds: settings.motionCooldownSeconds,
    motion_adaptive_enabled: true,
    motion_overlay_mask: "auto",
    monitoring_schedule: { mode: "always" },
    status: "pending",
    pairing_status: "unpaired",
  };
}

export function monitoringGoalsFrom(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((goal) => goal.trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((goal) => goal.slice(0, 180));
}
