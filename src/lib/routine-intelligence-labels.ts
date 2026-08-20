import type {
  OperationalDeviationCode,
  OperationalSeverity,
  RoutineBaselineCode,
  RoutineUnit,
} from "@/src/contracts/routine-intelligence";

const BASELINE_LABELS: Record<RoutineBaselineCode, string> = {
  operating_open_minute: "Abertura habitual",
  operating_close_minute: "Fechamento habitual",
  operating_duration_minutes: "Tempo habitual de funcionamento",
  first_activity_delay_minutes: "Primeira atividade após abertura",
  last_activity_lead_minutes: "Última atividade antes do fechamento",
  daily_session_count: "Volume diário de atividades",
  hourly_session_count: "Atividade por hora",
  session_duration_seconds: "Duração habitual dos períodos",
  after_close_event_count: "Atividade depois do fechamento",
};

const DEVIATION_LABELS: Record<OperationalDeviationCode, string> = {
  opening_early: "Abertura antecipada",
  opening_late: "Abertura atrasada",
  opening_not_observed: "Abertura ainda não confirmada",
  closing_early: "Fechamento antecipado",
  closing_late: "Fechamento tardio",
  closing_not_observed: "Fechamento não confirmado",
  first_activity_late: "Primeira atividade mais tarde que o habitual",
  activity_after_closing: "Atividade depois do fechamento",
  session_duration_high: "Período mais longo que o habitual",
  activity_volume_low: "Atividade abaixo do habitual",
  activity_volume_high: "Atividade acima do habitual",
};

const SEVERITY_LABELS: Record<OperationalSeverity, string> = {
  info: "Informativo",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  critical: "Crítica",
};

export const ROUTINE_WEEKDAY_LABELS = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

const WEEKDAY_LONG_LABELS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
] as const;

export function routineBaselineLabel(code: string) {
  return BASELINE_LABELS[code as RoutineBaselineCode] ?? "Padrão observado";
}

export function operationalDeviationLabel(code: string) {
  return DEVIATION_LABELS[code as OperationalDeviationCode] ?? "Mudança observada";
}

export function operationalSeverityLabel(severity: string) {
  return SEVERITY_LABELS[severity as OperationalSeverity] ?? "Informativa";
}

export function routineScopeLabel(dayOfWeek: number, bucketHour: number) {
  const day =
    dayOfWeek === -1
      ? "Todos os dias observados"
      : WEEKDAY_LONG_LABELS[dayOfWeek] ?? "Dia específico";

  return bucketHour >= 0
    ? `${day} · ${String(bucketHour).padStart(2, "0")}:00`
    : day;
}

export function routineSensitivityLabel(value: string) {
  if (value === "conservative") return "Mais tolerante";
  if (value === "sensitive") return "Mais rigorosa";
  return "Equilibrada";
}

export function routineMinuteToTime(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.max(0, Math.round(value));
  const minute = rounded % 1440;
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}`;
}

function minuteOfDayLabel(value: number) {
  const rounded = Math.max(0, Math.round(value));
  const dayOffset = Math.floor(rounded / 1440);
  const minute = rounded % 1440;
  const hour = Math.floor(minute / 60);
  const minutePart = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutePart).padStart(2, "0")}${
    dayOffset ? ` +${dayOffset}d` : ""
  }`;
}

export function routineValueLabel(
  value: number | null,
  unit: RoutineUnit | null,
) {
  if (value === null || !Number.isFinite(value)) return "—";

  switch (unit) {
    case "minute_of_day":
      return minuteOfDayLabel(value);
    case "seconds":
      return value >= 120
        ? `${(value / 60).toLocaleString("pt-BR", {
            maximumFractionDigits: 1,
          })} min`
        : `${Math.round(value)} s`;
    case "minutes":
      return `${value.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })} min`;
    case "percent":
      return `${value.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      })}%`;
    case "ratio":
      return value.toLocaleString("pt-BR", {
        maximumFractionDigits: 2,
      });
    case "count":
    default:
      return value.toLocaleString("pt-BR", {
        maximumFractionDigits: 1,
      });
  }
}

export function routineRangeLabel(input: {
  lower: number;
  center: number;
  upper: number;
  unit: RoutineUnit;
}) {
  return `${routineValueLabel(input.lower, input.unit)}–${routineValueLabel(
    input.upper,
    input.unit,
  )}`;
}
