import type {
  ProcessDeviationCode,
  ProcessInstanceStatus,
  ProcessStepStatus,
} from "@/src/contracts/operational-process";

const PROCESS_LABELS: Record<string, string> = {
  customer_service: "Atendimento ao cliente",
  delivery_or_pickup: "Entrega ou retirada",
  visitor_stay: "Permanência de visitante",
  opening_procedure: "Abertura",
  closing_procedure: "Fechamento",
  equipment_operation: "Uso de equipamento",
  restricted_area_access: "Acesso a área restrita",
  staff_activity: "Atividade da equipe",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Em andamento",
  completed: "Concluído",
  incomplete: "Precisa de atenção",
  uncertain: "Não foi possível confirmar",
  aborted: "Sem registros relevantes",
  observed: "Atividade observada",
};

const STEP_STATUS_LABELS: Record<ProcessStepStatus, string> = {
  pending: "Aguardando",
  observed: "Confirmada",
  missing: "Não confirmada",
  skipped: "Opcional não observada",
  ambiguous: "Não foi possível confirmar",
  out_of_order: "Observada em outra ordem",
  unexpected: "Ação adicional",
};

const DEVIATION_LABELS: Record<ProcessDeviationCode, string> = {
  missing_required_step: "Etapa obrigatória não confirmada",
  out_of_order_step: "Etapa observada em outra ordem",
  unexpected_step: "Ação adicional observada",
  duration_high: "Duração acima do habitual",
  duration_low: "Duração abaixo do habitual",
  stalled: "Atividade sem nova confirmação",
  ambiguous_result: "Resultado não confirmado",
};

const CHAPTER_LABELS: Record<string, string> = {
  arrival: "Chegada",
  waiting: "Espera ou permanência",
  service_started: "Início do atendimento",
  service_continued: "Atendimento em andamento",
  terminal_activity: "Uso de caixa ou terminal",
  object_handoff: "Entrega ou retirada de objeto",
  departure: "Saída",
  opening_step: "Ação de abertura",
  closing_step: "Ação de fechamento",
  equipment_activity: "Uso de equipamento",
  restricted_access: "Acesso a área restrita",
  state_change: "Mudança de estado visível",
  presence: "Presença ou permanência",
};

export const PROCESS_OBSERVATION_OPTIONS = Object.entries(CHAPTER_LABELS).map(
  ([value, label]) => ({ value, label }),
);

export function operationalProcessLabel(code: string) {
  return PROCESS_LABELS[code] ?? code.replaceAll("_", " ");
}

export function processInstanceStatusLabel(
  status: string,
  definitionSource?: string | null,
) {
  if (
    definitionSource === "system" &&
    !["open", "aborted"].includes(status)
  ) {
    return STATUS_LABELS.observed;
  }

  return STATUS_LABELS[status as ProcessInstanceStatus] ?? "Estado não disponível";
}

export function processStepStatusLabel(status: string) {
  return STEP_STATUS_LABELS[status as ProcessStepStatus] ?? "Não confirmado";
}

export function processDeviationLabel(code: string) {
  return DEVIATION_LABELS[code as ProcessDeviationCode] ?? "Diferença observada";
}

export function processDurationLabel(seconds: number) {
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded} s`;
  if (rounded < 3600) return `${Math.round(rounded / 60)} min`;

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.round((rounded % 3600) / 60);
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

export function processStrictnessLabel(value: string) {
  if (value === "flexible") return "Mais flexível";
  if (value === "strict") return "Mais rigoroso";
  return "Equilibrado";
}

export function processScopeLabel(
  source: string,
  siteName?: string | null,
  cameraName?: string | null,
) {
  if (source === "camera") {
    return cameraName ? `Somente ${cameraName}` : "Uma câmera";
  }
  if (source === "site") {
    return siteName ? `Local ${siteName}` : "Um local";
  }
  if (source === "organization") return "Toda a empresa";
  return "Modelo padrão do MonitorIA";
}

export function processObservationLabel(value: string) {
  return CHAPTER_LABELS[value] ?? value.replaceAll("_", " ");
}
