const TECHNICAL_LABELS: Record<string, string> = {
  observed_only: "estado observado, sem transição visível",
  visible_transition: "mudança visível nas imagens",
  persistent_confirmation: "estado confirmado em imagens sucessivas",
  estimated_interval: "horário estimado dentro de uma faixa observada",
  camera_health_regime_shift:
    "mudança persistente do ambiente observada pela câmera",
  open_estimated: "aberto por inferência operacional",
  closed_estimated: "fechado por inferência operacional",
  strong_snapshot: "estado confirmado por uma imagem forte, sem transição visível",
  closed_by_inactivity: "encerrada após um período sem nova atividade",
  explicit_departure: "encerrada quando a saída foi observada",
  operating_state_confirmed: "encerrada após confirmação visual do estado",
  maximum_duration: "encerrada ao atingir o limite de duração",
  no_visible_outcome: "sem resultado final visível",
  in_progress: "em andamento",
  customer_service: "atendimento no balcão",
  visitor_stay: "permanência de visitante",
  staff_activity: "atividade de funcionário",
  opening_procedure: "procedimento de abertura",
  closing_procedure: "procedimento de fechamento",
  service_started: "início do atendimento",
  service_continued: "continuação do atendimento",
  terminal_activity: "atividade no terminal",
  vehicle_present: "veículo presente",
  no_relevant_change: "sem mudança relevante",
};

const ISO_TIMESTAMP =
  /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})/g;

function formatTimestamp(value: string, timeZone: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return `${new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} (horário da câmera)`;
}

function localizeString(value: string, timeZone: string) {
  const exactLabel = TECHNICAL_LABELS[value];
  if (exactLabel) return exactLabel;

  return value.replace(ISO_TIMESTAMP, (timestamp) =>
    formatTimestamp(timestamp, timeZone),
  );
}

export function localizeAssistantPayload(
  value: unknown,
  timeZone: string,
): unknown {
  if (typeof value === "string") {
    return localizeString(value, timeZone);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      localizeAssistantPayload(item, timeZone),
    );
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        localizeAssistantPayload(item, timeZone),
      ]),
    );
  }

  return value;
}

function formatDateOnly(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
}

export function assistantPeriodLabel(
  fromDate: string,
  toDate: string,
  timeZone: string,
) {
  const period =
    fromDate === toDate
      ? formatDateOnly(fromDate, timeZone)
      : `${formatDateOnly(fromDate, timeZone)} a ${formatDateOnly(
          toDate,
          timeZone,
        )}`;

  return `${period} · horário da câmera`;
}
