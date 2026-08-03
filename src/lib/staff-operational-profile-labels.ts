import type {
  ShiftWindow,
  StaffProfileCandidateStatus,
  StaffProfileDecision,
  StaffProfileProposalStatus,
  StaffProfileReviewStatus,
  StaffProfileStatus,
} from "@/src/contracts/staff-operational-profile";

const weekdays = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export function weekdayLabel(value: number) {
  return weekdays[value] ?? `dia ${value}`;
}

export function staffProfileStatusLabel(value: StaffProfileStatus) {
  return {
    active: "Ativo",
    paused: "Pausado",
    retired: "Encerrado",
  }[value];
}

export function staffCandidateStatusLabel(value: StaffProfileCandidateStatus) {
  return {
    learning: "Aprendendo",
    pending_review: "Aguardando revisão",
    approved: "Aprovado",
    rejected: "Rejeitado",
    expired: "Expirado",
    merged: "Unificado",
  }[value];
}

export function staffDecisionLabel(value: StaffProfileDecision) {
  return {
    matched: "Correspondência provável",
    candidate: "Novo perfil provável",
    review_required: "Revisão necessária",
    unknown: "Sem correspondência suficiente",
    not_staff: "Não classificado como equipe",
  }[value];
}

export function staffReviewStatusLabel(value: StaffProfileReviewStatus) {
  return {
    not_required: "Sem revisão necessária",
    pending: "Aguardando revisão",
    confirmed: "Confirmado",
    reassigned: "Reatribuído",
    rejected: "Rejeitado",
    not_staff: "Marcado como não funcionário",
    uncertain: "Mantido como incerto",
  }[value];
}

export function staffProposalStatusLabel(value: StaffProfileProposalStatus) {
  return {
    pending: "Aguardando aprovação",
    applied: "Aplicada",
    rejected: "Rejeitada",
    expired: "Expirada",
  }[value];
}

export function actionCodeLabel(value: string) {
  return ({
    arrival: "chegada",
    waiting: "espera",
    service_started: "início de atendimento",
    service_continued: "continuação do atendimento",
    terminal_activity: "uso de terminal",
    object_handoff: "transferência de objeto",
    departure: "saída",
    opening_step: "etapa de abertura",
    closing_step: "etapa de fechamento",
    equipment_activity: "operação de equipamento",
    restricted_access: "acesso restrito",
    state_change: "mudança de estado",
    presence: "presença",
    other: "outra ação",
  } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

export function sessionTypeLabel(value: string) {
  return ({
    customer_service: "atendimento",
    delivery_or_pickup: "entrega ou retirada",
    visitor_stay: "permanência de visitante",
    staff_activity: "atividade da equipe",
    equipment_operation: "operação de equipamento",
    restricted_area_access: "acesso restrito",
    opening_procedure: "abertura",
    closing_procedure: "fechamento",
    other: "outra sessão",
  } as Record<string, string>)[value] ?? value.replaceAll("_", " ");
}

export function minuteOfDayLabel(value: number) {
  const bounded = Math.max(0, Math.min(1439, Math.floor(value)));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function shiftWindowLabel(window: ShiftWindow) {
  return `${weekdayLabel(window.weekday)} · ${minuteOfDayLabel(window.startMinute)}–${minuteOfDayLabel(window.endMinute)}`;
}

export function confidencePercent(value: number) {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
