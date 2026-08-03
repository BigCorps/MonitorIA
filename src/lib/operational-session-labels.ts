export const OPERATIONAL_SESSION_TYPE_OPTIONS = [
  { value: "customer_service", label: "Atendimento" },
  { value: "delivery_or_pickup", label: "Entrega ou retirada" },
  { value: "visitor_stay", label: "Permanência de visitante" },
  { value: "staff_activity", label: "Atividade de funcionário" },
  { value: "equipment_operation", label: "Operação de equipamento" },
  { value: "restricted_area_access", label: "Área restrita" },
  { value: "opening_procedure", label: "Procedimento de abertura" },
  { value: "closing_procedure", label: "Procedimento de fechamento" },
  { value: "other", label: "Outra atividade" },
] as const;

const typeLabels = new Map<string, string>(
  OPERATIONAL_SESSION_TYPE_OPTIONS.map((item) => [item.value, item.label]),
);

const statusLabels: Record<string, string> = {
  open: "Em andamento",
  completed: "Concluída",
  closed_by_inactivity: "Encerrada por inatividade",
  uncertain: "Encerramento incerto",
};

const chapterLabels: Record<string, string> = {
  arrival: "Chegada",
  waiting: "Espera",
  service_started: "Início do atendimento",
  service_continued: "Atendimento em andamento",
  terminal_activity: "Uso de terminal",
  object_handoff: "Entrega ou retirada de objeto",
  departure: "Saída",
  opening_step: "Etapa de abertura",
  closing_step: "Etapa de fechamento",
  equipment_activity: "Atividade de equipamento",
  restricted_access: "Acesso a área restrita",
  state_change: "Mudança de estado",
  presence: "Permanência",
  other: "Outro capítulo",
};

const outcomeLabels: Record<string, string> = {
  in_progress: "Em andamento",
  establishment_opened: "Abertura confirmada",
  establishment_closed: "Fechamento confirmado",
  item_delivered_to_staff: "Objeto entregue ao funcionário",
  item_collected_by_customer: "Objeto entregue ao cliente",
  interaction_ended_after_handoff: "Interação encerrada após troca de objeto",
  service_ended_with_departure: "Atendimento encerrado com saída",
  visitor_departed: "Visitante deixou a área",
  restricted_access_observed: "Acesso restrito observado",
  equipment_activity_observed: "Atividade de equipamento observada",
  duration_limit_reached: "Limite de duração atingido",
  no_visible_outcome: "Sem resultado visual conclusivo",
};

export function operationalSessionTypeLabel(value: string) {
  return typeLabels.get(value) ?? "Atividade observada";
}

export function operationalSessionStatusLabel(value: string) {
  return statusLabels[value] ?? "Estado desconhecido";
}

export function operationalSessionChapterLabel(value: string) {
  return chapterLabels[value] ?? "Outro capítulo";
}

export function operationalSessionOutcomeLabel(value: string) {
  return outcomeLabels[value] ?? "Resultado visual registrado";
}
