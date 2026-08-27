import type {
  LocalEventFrame,
  LocalMotionEvent,
} from "../types.js";

export type EventPriorityV103 =
  | "critical"
  | "important"
  | "normal";

const score = {
  critical: 300,
  important: 200,
  normal: 100,
} as const;

function metricsOf(event: LocalMotionEvent) {
  const value = event.localMetrics;
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function labelsOf(event: LocalMotionEvent) {
  return [
    ...new Set(
      event.frames.map((frame) => frame.label),
    ),
  ] as LocalEventFrame["label"][];
}

/**
 * Importância local da evidência.
 *
 * Não tenta diagnosticar crime nem intenção. "critical" significa somente
 * que a prova deve atravessar armazenamento/upload antes de ocorrências
 * rotineiras quando existe backlog.
 */
export function classifyEventPriorityV103(
  event: LocalMotionEvent,
): EventPriorityV103 {
  const metrics = metricsOf(event);

  const operational =
    metrics.operationalAccessEnabled === true;
  const outside =
    metrics.outsideDeclaredHours === true ||
    metrics.operationalPriorityHint ===
      "high_outside_hours";
  const structural =
    metrics.structuralMotionV103 === true;
  const timelineProblem =
    metrics.evidenceTimelineCoherent === false;

  if (
    (operational && outside) ||
    (operational && structural)
  ) {
    return "critical";
  }

  if (operational || timelineProblem) {
    return "important";
  }

  return "normal";
}

export function requiredEvidenceLabelsV103(
  event: LocalMotionEvent,
) {
  const labels = labelsOf(event);

  // "extra" é enriquecimento. Todo quadro principal que o detector conseguiu
  // preservar (start/peak/end) vira requisito: se o upload não conseguir
  // prepará-lo, mantemos o acontecimento local para nova tentativa em vez de
  // enviar silenciosamente um pacote mais pobre.
  const required = labels.filter(
    (label) => label !== "extra",
  );

  if (required.length) return required;

  return labels.slice(0, 1);
}

export function prioritizeEventV103(
  event: LocalMotionEvent,
): LocalMotionEvent {
  const priority =
    classifyEventPriorityV103(event);
  const required =
    requiredEvidenceLabelsV103(event);
  const metrics = metricsOf(event);

  return {
    ...event,
    localMetrics: {
      // Usamos as métricas tipadas originais como base para preservar todos
      // os campos obrigatórios de LocalMotionEvent["localMetrics"].
      ...event.localMetrics,
      evidencePriorityVersion: 1,
      evidencePriorityV103: priority,
      evidencePriorityScoreV103:
        score[priority],
      evidenceRequiredLabelsV103:
        required,
      evidenceOptionalLabelsV103:
        labelsOf(event).filter(
          (label) =>
            !required.includes(label),
        ),
      evidenceCompletenessRequiredV103:
        true,
      operationalSecurityContextV103:
        priority === "critical" &&
        metrics.outsideDeclaredHours === true
          ? "outside_hours_activity"
          : null,
    } as LocalMotionEvent["localMetrics"],
  };
}

export function priorityScoreV103(
  event: LocalMotionEvent,
) {
  const metrics = metricsOf(event);
  const stored = Number(
    metrics.evidencePriorityScoreV103,
  );
  if (Number.isFinite(stored)) {
    return stored;
  }
  return score[
    classifyEventPriorityV103(event)
  ];
}
