import type { CameraHealthIncidentType, CameraHealthStatus } from "@/src/contracts/camera-health";

const statusLabels: Record<CameraHealthStatus, string> = {
  unknown: "Sem leitura",
  learning: "Aprendendo",
  healthy: "Saudável",
  degraded: "Qualidade reduzida",
  critical: "Crítica",
  offline: "Sem observação",
};

const issueLabels: Record<CameraHealthIncidentType, string> = {
  baseline_required: "Referência visual pendente",
  no_recent_observation: "Sem observação recente",
  possible_frame_freeze: "Possível imagem congelada",
  lens_obstructed: "Possível obstrução da lente",
  low_light: "Pouca iluminação",
  overexposed: "Superexposição",
  blurry: "Possível desfoque",
  frame_shifted: "Enquadramento alterado",
  profile_drift: "Drift persistente",
  image_degraded: "Imagem degradada",
};

export function cameraHealthStatusLabel(value: string) {
  return statusLabels[value as CameraHealthStatus] ?? value;
}

export function cameraHealthIssueLabel(value: string) {
  return issueLabels[value as CameraHealthIncidentType] ?? value;
}

export function cameraHealthMetric(value: number | null, suffix = "") {
  return value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(2)}${suffix}`;
}

export function cameraHealthPercent(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : `${Math.round(value * 100)}%`;
}
