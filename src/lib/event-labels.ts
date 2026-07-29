export const EVENT_TYPE_LABELS: Record<string, string> = {
  person_entered: "Pessoa entrou",
  person_exited: "Pessoa saiu",
  person_present: "Pessoa presente",
  vehicle_entered: "Veículo entrou",
  vehicle_exited: "Veículo saiu",
  vehicle_stopped: "Veículo parou",
  vehicle_present: "Veículo presente",
  object_appeared: "Objeto apareceu",
  object_removed: "Objeto removido",
  object_moved: "Objeto movido",
  zone_intrusion: "Entrada em zona",
  unusual_activity: "Atividade incomum",
  scene_change: "Mudança de cena",
  no_relevant_change: "Sem mudança relevante",
  other: "Outro",
};

export const EVENT_TYPE_OPTIONS = Object.entries(
  EVENT_TYPE_LABELS,
).map(([value, label]) => ({ value, label }));

export const REVIEW_LABELS: Record<string, string> = {
  all: "Todos",
  required: "Exige revisão",
  reviewed: "Já revisado",
  not_required: "Não necessária",
  pending: "Pendente",
  confirmed: "Confirmado",
  rejected: "Rejeitado",
  useful: "Útil",
  irrelevant: "Irrelevante",
  incorrect: "Classificação incorreta",
};

export function eventTypeLabel(value: string) {
  return EVENT_TYPE_LABELS[value] ?? value.replaceAll("_", " ");
}

export function reviewLabel(value: string | null) {
  if (!value) return "Sem avaliação";
  return REVIEW_LABELS[value] ?? value.replaceAll("_", " ");
}
