export type ExportableEvent = {
  id: string;
  startedAt: string;
  endedAt: string;
  cameraName: string;
  siteName: string;
  eventType: string;
  eventTypeLabel: string;
  summary: string;
  confidence: number;
  requiresReview: boolean;
  humanVerdict: string | null;
  peopleCount: number;
  vehicleCount: number;
  tags: string[];
};

export type EventExportInput = {
  title?: string;
  generatedAt?: string;
  timeZone?: string;
  filters: Record<string, string | number | boolean | null>;
  total: number;
  events: ExportableEvent[];
};

function escapeMarkdown(value: string) {
  return value.replaceAll("|", "\\|").trim();
}

function formatDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone,
  }).format(new Date(value));
}

export function buildEventsMarkdown(input: EventExportInput) {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const timeZone = input.timeZone ?? "America/Sao_Paulo";
  const filterLines = Object.entries(input.filters)
    .filter(([, value]) => value !== null && value !== "")
    .map(([key, value]) => `- **${key}:** ${String(value)}`);

  const eventBlocks = input.events.map((event, index) => [
    `### ${index + 1}. ${escapeMarkdown(event.eventTypeLabel)}`,
    "",
    `- **Data:** ${formatDate(event.startedAt, timeZone)}`,
    `- **Local:** ${escapeMarkdown(event.siteName)}`,
    `- **Câmera:** ${escapeMarkdown(event.cameraName)}`,
    `- **Confiança:** ${Math.round(event.confidence * 100)}%`,
    `- **Pessoas estruturadas:** ${event.peopleCount}`,
    `- **Veículos estruturados:** ${event.vehicleCount}`,
    `- **Revisão necessária:** ${event.requiresReview ? "Sim" : "Não"}`,
    event.humanVerdict
      ? `- **Avaliação humana:** ${escapeMarkdown(event.humanVerdict)}`
      : null,
    event.tags.length
      ? `- **Tags:** ${event.tags.map(escapeMarkdown).join(", ")}`
      : null,
    "",
    escapeMarkdown(event.summary),
  ].filter(Boolean).join("\n"));

  return [
    `# ${input.title ?? "Relatório MonitorIA"}`,
    "",
    `Gerado em ${formatDate(generatedAt, timeZone)}.`,
    "",
    "## Filtros",
    "",
    ...(filterLines.length ? filterLines : ["- Nenhum filtro adicional"]),
    "",
    "## Resumo",
    "",
    `- **Resultados encontrados:** ${input.total}`,
    `- **Resultados exportados:** ${input.events.length}`,
    "",
    "## Eventos",
    "",
    ...(eventBlocks.length ? eventBlocks : ["Nenhum evento encontrado."]),
    "",
  ].join("\n");
}

export function buildEventsJson(input: EventExportInput) {
  return JSON.stringify(
    {
      schemaVersion: "1.0",
      source: "MonitorIA",
      generatedAt: input.generatedAt ?? new Date().toISOString(),
      filters: input.filters,
      summary: {
        totalFound: input.total,
        exported: input.events.length,
      },
      events: input.events,
    },
    null,
    2,
  );
}
