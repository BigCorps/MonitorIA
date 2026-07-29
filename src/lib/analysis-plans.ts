export const CAMERA_ANALYSIS_PLANS = {
  basic: {
    code: "basic",
    label: "Econômico",
    description: "Menor custo, um quadro principal e resposta compacta.",
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
    label: "Equilibrado",
    description: "Três quadros e equilíbrio entre contexto, precisão e custo.",
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
    label: "Detalhado",
    description: "Até quatro quadros para acontecimentos rápidos ou críticos.",
    captureIntervalSeconds: 1,
    consolidationIntervalSeconds: 1,
    motionStartThreshold: 1,
    motionContinueThreshold: 0.5,
    eventCloseAfterSeconds: 8,
    motionStartConsecutiveFrames: 2,
    motionEndConsecutiveFrames: 5,
    motionCooldownSeconds: 5,
  },
} as const;

export type AnalysisPlanCode = keyof typeof CAMERA_ANALYSIS_PLANS;

export function normalizeAnalysisPlan(value: unknown): AnalysisPlanCode {
  const candidate = String(value ?? "standard");
  return candidate in CAMERA_ANALYSIS_PLANS
    ? (candidate as AnalysisPlanCode)
    : "standard";
}
