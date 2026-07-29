import { createVisionProvider } from "./create-provider";
import { getVisionPlan } from "./plans";
import type {
  AnalyzeEventInput,
  VisionAnalysisAttempt,
  VisionAnalysisResult,
  VisionPlanOutcome,
} from "./types";
import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";

function escalationConfidence() {
  const parsed = Number(
    process.env.VISION_BALANCED_ESCALATION_CONFIDENCE ?? "0.75",
  );
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : 0.75;
}

export function shouldEscalate(result: VisionAnalysisResult) {
  return (
    result.event.confidence < escalationConfidence() ||
    (
      result.event.requiresReview &&
      ["other", "unusual_activity"].includes(
        result.event.primaryEventType,
      )
    )
  );
}

export async function runVisionModel(
  input: AnalyzeEventInput,
  options: {
    model: string;
    detail: "low" | "high" | "auto";
    maxOutputTokens: number;
    role: VisionAnalysisAttempt["role"];
  },
): Promise<VisionAnalysisAttempt> {
  const provider = createVisionProvider({
    model: options.model,
    detail: options.detail,
    maxOutputTokens: options.maxOutputTokens,
  });

  const result = await provider.analyzeEvent(input);
  return { ...result, role: options.role };
}

export async function analyzeEventForPlan(
  input: AnalyzeEventInput,
  planCode: AnalysisPlanCode,
): Promise<VisionPlanOutcome> {
  const plan = getVisionPlan(planCode);

  const planInput: AnalyzeEventInput = {
    ...input,
    planCode,
    analysisMode: plan.mode,
  };

  const primary = await runVisionModel(planInput, {
    model: plan.primaryModel,
    detail: plan.detail,
    maxOutputTokens: plan.maxOutputTokens,
    role: "primary",
  });

  const attempts: VisionAnalysisAttempt[] = [primary];

  if (
    plan.escalationModel &&
    plan.escalationModel !== primary.model &&
    shouldEscalate(primary)
  ) {
    const escalation = await runVisionModel(planInput, {
      model: plan.escalationModel,
      detail: plan.detail,
      maxOutputTokens: Math.max(plan.maxOutputTokens, 2800),
      role: "escalation",
    });

    attempts.push(escalation);

    return {
      final: escalation,
      attempts,
      escalated: true,
    };
  }

  return {
    final: primary,
    attempts,
    escalated: false,
  };
}
