export const CAMERA_ANALYSIS_PLANS = {
  basic: {
    code: "basic",
    label: "Essencial",
    description:
      "Um quadro principal e análise compacta para áreas de menor movimento.",
    captureIntervalSeconds: 3,
    consolidationIntervalSeconds: 60,
    motionStartThreshold: 1.5,
    motionContinueThreshold: 0.75,
    eventCloseAfterSeconds: 45,
    motionStartConsecutiveFrames: 3,
    motionEndConsecutiveFrames: 4,
    motionCooldownSeconds: 15,
  },
  standard: {
    code: "standard",
    label: "Atenta",
    description:
      "Até três quadros e equilíbrio entre contexto, precisão e custo.",
    captureIntervalSeconds: 1,
    consolidationIntervalSeconds: 10,
    motionStartThreshold: 1.25,
    motionContinueThreshold: 0.6,
    eventCloseAfterSeconds: 15,
    motionStartConsecutiveFrames: 3,
    motionEndConsecutiveFrames: 6,
    motionCooldownSeconds: 10,
  },
  intensive: {
    code: "intensive",
    label: "Detalhada",
    description:
      "Até quatro quadros para reconstruir acontecimentos rápidos ou críticos.",
    captureIntervalSeconds: 1,
    consolidationIntervalSeconds: 5,
    motionStartThreshold: 1,
    motionContinueThreshold: 0.5,
    eventCloseAfterSeconds: 15,
    motionStartConsecutiveFrames: 3,
    motionEndConsecutiveFrames: 8,
    motionCooldownSeconds: 15,
  },
} as const;

export type AnalysisPlanCode = keyof typeof CAMERA_ANALYSIS_PLANS;

export function normalizeAnalysisPlan(value: unknown): AnalysisPlanCode {
  const candidate = String(value ?? "standard");
  return candidate in CAMERA_ANALYSIS_PLANS
    ? (candidate as AnalysisPlanCode)
    : "standard";
}
