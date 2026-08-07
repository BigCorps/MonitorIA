import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";
import {
  analyzeEventThroughGateway,
  runVisionModel,
} from "./inference-gateway";
import type {
  AnalyzeEventInput,
  VisionAnalysisResult,
  VisionPlanOutcome,
} from "./types";

export { runVisionModel };

export function shouldEscalate(result: VisionAnalysisResult) {
  return (
    result.event.requiresReview ||
    result.event.sceneComplexity.identityAmbiguity === "high" ||
    result.event.sceneComplexity.occlusionLevel === "high"
  );
}

export async function analyzeEventForPlan(
  input: AnalyzeEventInput,
  planCode: AnalysisPlanCode,
  options?: Parameters<typeof analyzeEventThroughGateway>[2],
): Promise<VisionPlanOutcome> {
  return analyzeEventThroughGateway(input, planCode, options);
}
