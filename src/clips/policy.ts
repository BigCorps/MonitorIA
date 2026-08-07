import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";

export const MONITORIA_CLIP_DURATION_SECONDS = 15;
export const MONITORIA_CLIP_RETENTION_DAYS = 30;
export const MONITORIA_CLIP_MAX_BYTES = 25 * 1024 * 1024;

export function expectedLongTermEvidenceCount(
  planCode: string | null | undefined,
) {
  if (planCode === "intensive") return 3;
  if (planCode === "standard") return 2;
  return 1;
}

export function planSupportsClips(
  planCode: string | null | undefined,
): planCode is AnalysisPlanCode {
  return planCode === "intensive";
}
