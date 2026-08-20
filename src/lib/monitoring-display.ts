/**
 * Contrato de apresentação do MonitorIA para o cliente final.
 *
 * Este arquivo não altera cálculos nem dados. Ele centraliza somente
 * formatação e labels amigáveis usados pelo dashboard.
 */

const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

function validDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function monitoringTimeZone(timeZone?: string | null) {
  return timeZone?.trim() || DEFAULT_TIME_ZONE;
}

export function formatMonitoringDateTime(
  value: string | Date | null | undefined,
  timeZone?: string | null,
) {
  if (!value) return "—";
  const date = validDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: monitoringTimeZone(timeZone),
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatMonitoringDate(
  value: string | Date | null | undefined,
  timeZone?: string | null,
) {
  if (!value) return "—";
  const date = validDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: monitoringTimeZone(timeZone),
    dateStyle: "short",
  }).format(date);
}

export function formatMonitoringTime(
  value: string | Date | null | undefined,
  timeZone?: string | null,
) {
  if (!value) return "—";
  const date = validDate(value);
  if (!date) return "—";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: monitoringTimeZone(timeZone),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMonitoringDuration(seconds: number | null | undefined) {
  const rounded = Math.max(0, Math.round(Number(seconds ?? 0)));

  if (rounded < 60) {
    return `${rounded} segundo${rounded === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }

  return `${minutes} minuto${minutes === 1 ? "" : "s"}`;
}

export type MonitoringConfidenceTier = "low" | "medium" | "high";

export function monitoringConfidenceTier(
  confidence: number | null | undefined,
): MonitoringConfidenceTier {
  const value = Number(confidence ?? 0);
  if (value >= 0.82) return "high";
  if (value >= 0.62) return "medium";
  return "low";
}

export function monitoringConfidenceLabel(
  confidence: number | null | undefined,
) {
  const tier = monitoringConfidenceTier(confidence);
  if (tier === "high") return "Boa certeza";
  if (tier === "medium") return "Certeza moderada";
  return "Certeza limitada";
}

export function monitoringSeverityLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    info: "Informativo",
    low: "Baixa",
    medium: "Média",
    warning: "Atenção",
    high: "Alta",
    critical: "Crítica",
  };

  return labels[String(value ?? "").toLowerCase()] ?? "Informativo";
}

export function monitoringStateLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    open: "Em andamento",
    completed: "Concluído",
    incomplete: "Incompleto",
    uncertain: "Não confirmado",
    aborted: "Interrompido",
    active: "Ativo",
    learning: "Aprendendo",
    stale: "Desatualizado",
    paused: "Pausado",
    retired: "Encerrado",
    observing: "Em observação",
    resolved: "Resolvido",
    dismissed: "Descartado",
    closed_by_inactivity: "Encerrado automaticamente",
    informational: "Informativo",
    healthy: "Funcionando normalmente",
    degraded: "Precisa de atenção",
    critical: "Problema grave",
    offline: "Sem comunicação",
    unknown: "Aguardando informações",
    proposed: "Aguardando confirmação",
  };

  return (
    labels[String(value ?? "").toLowerCase()] ??
    "Estado não disponível"
  );
}
