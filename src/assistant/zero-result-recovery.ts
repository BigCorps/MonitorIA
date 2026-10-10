import type { AssistantExecutionResult, AssistantPlanV2 } from "./v2-contracts";

type EventRow = {
  id: string;
  headline?: string;
  summary?: string;
  tags?: string[];
};

export type RecoverySearch = (scope: {
  query: string;
  from: string;
  to: string;
  cameraId: string | null;
  siteId: string | null;
  limit: number;
}) => Promise<{ rows: EventRow[]; total: number }>;

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function ageMention(row: EventRow, age: "child" | "adult"): boolean {
  const raw = [row.headline ?? "", row.summary ?? "", ...(row.tags ?? [])].join(" ");
  const text = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (age === "child") return /\b(crianc\w*|bebe\w*|infantil|infantis|menin[oa]s?)\b/.test(text);
  return /\b(adult[oa]s?)\b/.test(text);
}

/** A segunda busca nunca altera o período, o local, a câmera nem os filtros estruturados. */
export function shouldRecoverEmptySearch(plan: AssistantPlanV2, execution: AssistantExecutionResult): boolean {
  if (plan.operations.length !== 1 || plan.operations[0].kind !== "search_events") return false;
  if (plan.plannerNotes.includes("adolescent:unsupported_separate_class")) return false;
  const op = plan.operations[0];
  if (op.zoneId || op.eventTypes.length || op.afterConfirmedClosing !== null) return false;
  const coverage = objectValue(execution.coverage);
  if (coverage.dataState === "NO_COVERAGE" || coverage.dataState === "FEATURE_DISABLED") return false;
  const results = objectValue(objectValue(execution.retrievedData).operationResults);
  if (!Object.prototype.hasOwnProperty.call(results, op.id)) return false;
  const found = objectValue(results[op.id]);
  if (found.totalIsExact === false) return false;
  if (!Object.prototype.hasOwnProperty.call(found, "total") && !Object.prototype.hasOwnProperty.call(found, "totalFound")) return false;
  const count = Number(found.total ?? found.totalFound ?? 0);
  return Number.isFinite(count) && count === 0 && (!Array.isArray(found.events) || found.events.length === 0);
}

export function sanitizeRecoveryTerms(terms: string[]): string[] {
  const unique = new Set<string>();
  for (const input of terms.slice(0, 8)) {
    const term = input.normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!/^[\p{L}\p{N}\s-]{2,70}$/u.test(term) || term.split(" ").length > 5) continue;
    const key = term.toLocaleLowerCase("pt-BR");
    if (/^(pessoa|pessoas|evento|eventos|movimento|atividade|alguem|algo|camera|local|registro|registros)$/.test(key)) continue;
    unique.add(term);
  }
  return [...unique].slice(0, 3);
}

export async function recoverEmptySearch(input: {
  plan: AssistantPlanV2;
  execution: AssistantExecutionResult;
  terms: string[];
  from: string;
  to: string;
  search: RecoverySearch;
}): Promise<{ execution: AssistantExecutionResult; kind: "none" | "textual" | "lexical" }> {
  if (!shouldRecoverEmptySearch(input.plan, input.execution)) return { execution: input.execution, kind: "none" };
  const op = input.plan.operations[0];
  const age = op.apparentAgeGroup;
  for (const query of sanitizeRecoveryTerms(input.terms)) {
    const result = await input.search({
      query,
      from: input.from,
      to: input.to,
      cameraId: op.cameraId ?? input.plan.legacyPlan.cameraId,
      siteId: op.siteId ?? input.plan.legacyPlan.siteId,
      limit: input.plan.legacyPlan.evidenceLimit,
    });
    // Um match textual de idade nunca é promovido a classificação visual.
    const rows = age ? result.rows.filter((row) => ageMention(row, age)) : result.rows;
    if (!rows.length) continue;
    const originalData = objectValue(input.execution.retrievedData);
    const operationResults = objectValue(originalData.operationResults);
    return {
      kind: age ? "textual" : "lexical",
      execution: {
        ...input.execution,
        retrievedData: {
          ...originalData,
          operationResults: {
            ...operationResults,
            [op.id]: {
              total: age ? rows.length : Math.max(result.total, rows.length),
              events: rows,
              recoveryMatchType: age ? "text_only" : "lexical",
            },
          },
        },
        candidateEvidenceIds: [...new Set(rows.map((row) => row.id))].slice(0, 12),
      },
    };
  }
  return { execution: input.execution, kind: "none" };
}
