export const OPERATIONAL_SESSION_TYPE_OPTIONS = [
  { value: "customer_service", label: "Atendimento" },
  { value: "delivery_or_pickup", label: "Entrega ou retirada" },
  { value: "visitor_stay", label: "Permanência de visitante" },
  { value: "staff_activity", label: "Atividade da equipe" },
  { value: "equipment_operation", label: "Uso de equipamento" },
  { value: "restricted_area_access", label: "Acesso a área restrita" },
  { value: "opening_procedure", label: "Abertura" },
  { value: "closing_procedure", label: "Fechamento" },
  { value: "other", label: "Outra atividade" },
] as const;

const typeLabels = new Map<string, string>(
  OPERATIONAL_SESSION_TYPE_OPTIONS.map((item) => [item.value, item.label]),
);

const statusLabels: Record<string, string> = {
  open: "Em andamento",
  completed: "Concluído",
  closed_by_inactivity: "Encerrado",
  uncertain: "Não confirmado",
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
  state_change: "Mudança observada",
  presence: "Permanência",
  other: "Outro registro",
};

const outcomeLabels: Record<string, string> = {
  in_progress: "Em andamento",
  establishment_opened: "Abertura confirmada",
  establishment_closed: "Fechamento confirmado",
  item_delivered_to_staff: "Objeto entregue à equipe",
  item_collected_by_customer: "Objeto entregue ao cliente",
  interaction_ended_after_handoff: "Interação encerrada após troca de objeto",
  service_ended_with_departure: "Atendimento encerrado com saída",
  visitor_departed: "Visitante deixou a área",
  restricted_access_observed: "Acesso a área restrita observado",
  equipment_activity_observed: "Atividade de equipamento observada",
  duration_limit_reached: "Não foi possível confirmar o encerramento",
  no_visible_outcome: "Sem resultado visual conclusivo",
};

export function operationalSessionTypeLabel(value: string) {
  return typeLabels.get(value) ?? "Atividade observada";
}

export function operationalSessionStatusLabel(value: string) {
  return statusLabels[value] ?? "Situação não disponível";
}

export function operationalSessionChapterLabel(value: string) {
  return chapterLabels[value] ?? "Outro registro";
}

export function operationalSessionOutcomeLabel(value: string) {
  return outcomeLabels[value] ?? "Resultado observado";
}
