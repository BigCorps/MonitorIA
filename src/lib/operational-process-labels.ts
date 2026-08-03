import type {
  ProcessDeviationCode,
  ProcessInstanceStatus,
  ProcessStepStatus,
} from "@/src/contracts/operational-process";

const PROCESS_LABELS: Record<string, string> = {
  customer_service: "Atendimento ao cliente",
  delivery_or_pickup: "Entrega ou retirada",
  visitor_stay: "Permanência de visitante",
  opening_procedure: "Procedimento de abertura",
  closing_procedure: "Procedimento de fechamento",
  equipment_operation: "Operação de equipamento",
  restricted_area_access: "Acesso a área restrita",
  staff_activity: "Atividade de funcionário",
};

const STATUS_LABELS: Record<ProcessInstanceStatus, string> = {
  open: "Em andamento",
  completed: "Concluído visualmente",
  incomplete: "Etapas não confirmadas",
  uncertain: "Resultado incerto",
  aborted: "Interrompido",
};

const STEP_STATUS_LABELS: Record<ProcessStepStatus, string> = {
  pending: "Aguardando",
  observed: "Observada",
  missing: "Não confirmada",
  skipped: "Opcional não observada",
  ambiguous: "Ambígua",
  out_of_order: "Fora da sequência",
  unexpected: "Ação adicional",
};

const DEVIATION_LABELS: Record<ProcessDeviationCode, string> = {
  missing_required_step: "Etapa obrigatória não confirmada",
  out_of_order_step: "Etapa fora da sequência",
  unexpected_step: "Ação adicional observada",
  duration_high: "Duração acima do habitual",
  duration_low: "Duração abaixo do habitual",
  stalled: "Processo sem novo capítulo",
  ambiguous_result: "Resultado visual incerto",
};

export function operationalProcessLabel(code: string) {
  return PROCESS_LABELS[code] ?? code.replaceAll("_", " ");
}

export function processInstanceStatusLabel(status: string) {
  return STATUS_LABELS[status as ProcessInstanceStatus] ?? status;
}

export function processStepStatusLabel(status: string) {
  return STEP_STATUS_LABELS[status as ProcessStepStatus] ?? status;
}

export function processDeviationLabel(code: string) {
  return DEVIATION_LABELS[code as ProcessDeviationCode] ?? code;
}

export function processProgressLabel(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function processDurationLabel(seconds: number) {
  if (seconds < 120) return `${Math.round(seconds)} s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} h`;
}
