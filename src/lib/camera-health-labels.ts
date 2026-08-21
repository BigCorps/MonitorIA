import type {
  CameraHealthIncidentType,
  CameraHealthStatus,
} from "@/src/contracts/camera-health";

const statusLabels: Record<CameraHealthStatus, string> = {
  unknown: "Aguardando primeira verificação",
  learning: "Aprendendo a referência",
  healthy: "Funcionando normalmente",
  degraded: "Precisa de atenção",
  critical: "Problema grave",
  offline: "Sem verificação recente",
};

const issueLabels: Record<CameraHealthIncidentType, string> = {
  baseline_required: "Referência visual pendente",
  no_recent_observation: "Sem verificação recente",
  possible_frame_freeze: "Possível imagem congelada",
  lens_obstructed: "Lente possivelmente obstruída",
  low_light: "Imagem escura",
  overexposed: "Imagem clara demais",
  blurry: "Imagem desfocada",
  frame_shifted: "Enquadramento alterado",
  profile_drift: "Enquadramento mudou de forma persistente",
  image_degraded: "Qualidade da imagem reduzida",
};

const issueRecommendations: Record<CameraHealthIncidentType, string> = {
  baseline_required:
    "Confirme qual é a posição normal desta câmera para que o MonitorIA consiga comparar as próximas imagens.",
  no_recent_observation:
    "Verifique se a câmera e o computador com o MonitorIA Agent estão conectados.",
  possible_frame_freeze:
    "Confira a imagem da câmera. Se ela estiver parada, verifique a conexão ou reinicie o equipamento.",
  lens_obstructed:
    "Verifique se há algum objeto cobrindo a lente ou se ela precisa ser limpa.",
  low_light:
    "Verifique a iluminação do ambiente ou se a lente da câmera está coberta ou suja.",
  overexposed:
    "Verifique se há luz forte, reflexo ou iluminação direta afetando a câmera.",
  blurry:
    "Verifique a limpeza da lente, o foco e se a câmera sofreu alguma movimentação.",
  frame_shifted:
    "Confira se a câmera foi movimentada. Se o reposicionamento foi intencional, atualize a referência visual.",
  profile_drift:
    "A imagem mudou de forma persistente. Confirme se a câmera foi reposicionada ou se algo alterou o enquadramento.",
  image_degraded:
    "Confira a lente, a iluminação e o enquadramento da câmera.",
};

const issuePriority: CameraHealthIncidentType[] = [
  "no_recent_observation",
  "lens_obstructed",
  "possible_frame_freeze",
  "low_light",
  "overexposed",
  "blurry",
  "frame_shifted",
  "profile_drift",
  "image_degraded",
  "baseline_required",
];

export type CameraHealthCheckTone = "ok" | "attention" | "pending";

export type CameraHealthCheck = {
  label: string;
  tone: CameraHealthCheckTone;
};

export function cameraHealthStatusLabel(value: string) {
  return statusLabels[value as CameraHealthStatus] ?? "Estado não disponível";
}

export function cameraHealthIssueLabel(value: string) {
  return (
    issueLabels[value as CameraHealthIncidentType] ??
    "Situação que precisa de verificação"
  );
}

export function cameraHealthIssueRecommendation(value: string) {
  return (
    issueRecommendations[value as CameraHealthIncidentType] ??
    "Confira a imagem e o posicionamento desta câmera."
  );
}

export function cameraHealthPrimaryIssue(issueCodes: string[]) {
  return issuePriority.find((code) => issueCodes.includes(code)) ?? null;
}

export function cameraHealthCanUseAsReference(issueCodes: string[]) {
  const blockingIssues = new Set([
    "possible_frame_freeze",
    "lens_obstructed",
    "low_light",
    "overexposed",
    "blurry",
    "image_degraded",
  ]);

  return !issueCodes.some((code) => blockingIssues.has(code));
}

export function cameraHealthHeadline(
  status: string,
  issueCodes: string[],
  hasObservation: boolean,
) {
  if (!hasObservation) return "Aguardando primeira verificação";

  const issue = cameraHealthPrimaryIssue(issueCodes);
  if (issue && issue !== "baseline_required") {
    return cameraHealthIssueLabel(issue);
  }

  return cameraHealthStatusLabel(status);
}

export function cameraHealthChecks(
  issueCodes: string[],
  input: { hasObservation: boolean; hasBaseline: boolean },
): CameraHealthCheck[] {
  if (!input.hasObservation) {
    return [
      { label: "Imagem ainda não verificada", tone: "pending" },
      { label: "Nitidez ainda não verificada", tone: "pending" },
      { label: "Enquadramento ainda não verificado", tone: "pending" },
    ];
  }

  const imageIssues = new Set([
    "low_light",
    "overexposed",
    "lens_obstructed",
    "image_degraded",
  ]);
  const sharpnessIssues = new Set(["blurry", "possible_frame_freeze"]);
  const framingIssues = new Set(["frame_shifted", "profile_drift"]);

  const hasImageIssue = issueCodes.some((code) => imageIssues.has(code));
  const hasSharpnessIssue = issueCodes.some((code) => sharpnessIssues.has(code));
  const hasFramingIssue = issueCodes.some((code) => framingIssues.has(code));

  return [
    {
      label: hasImageIssue ? "Imagem precisa de atenção" : "Imagem clara",
      tone: hasImageIssue ? "attention" : "ok",
    },
    {
      label: hasSharpnessIssue ? "Nitidez precisa de atenção" : "Nitidez normal",
      tone: hasSharpnessIssue ? "attention" : "ok",
    },
    input.hasBaseline
      ? {
          label: hasFramingIssue
            ? "Enquadramento diferente da referência"
            : "Enquadramento correto",
          tone: hasFramingIssue ? "attention" : "ok",
        }
      : {
          label: "Referência visual ainda não confirmada",
          tone: "pending",
        },
  ];
}

export function cameraHealthMetric(value: number | null, suffix = "") {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(2)}${suffix}`;
}

export function cameraHealthPercent(value: number | null) {
  return value === null || !Number.isFinite(value)
    ? "—"
    : `${Math.round(value * 100)}%`;
}
