import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";
import type {
  VisionAnalysisMode,
  VisionImageDetail,
} from "./types";

export type VisionPlan = {
  code: AnalysisPlanCode;
  mode: VisionAnalysisMode;
  primaryModel: string;
  escalationModel: string | null;
  detail: VisionImageDetail;
  maxOutputTokens: number;
  maximumFrames: number;
};

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

function detail(
  value: string | undefined,
  fallback: VisionImageDetail,
): VisionImageDetail {
  return value === "low" || value === "high" || value === "auto"
    ? value
    : fallback;
}

export function getVisionPlan(code: AnalysisPlanCode): VisionPlan {
  if (code === "basic") {
    return {
      code,
      mode: "economic",
      primaryModel:
        process.env.VISION_MODEL_ECONOMIC ?? "gpt-5-nano",
      escalationModel: null,
      detail: detail(process.env.VISION_DETAIL_ECONOMIC, "low"),
      maxOutputTokens: positiveInteger(
        process.env.VISION_MAX_OUTPUT_ECONOMIC,
        1600,
      ),
      maximumFrames: 1,
    };
  }

  if (code === "intensive") {
    return {
      code,
      mode: "detailed",
      primaryModel:
        process.env.VISION_MODEL_DETAILED ?? "gpt-5-mini",
      escalationModel: null,
      detail: detail(process.env.VISION_DETAIL_DETAILED, "low"),
      maxOutputTokens: positiveInteger(
        process.env.VISION_MAX_OUTPUT_DETAILED,
        3200,
      ),
      maximumFrames: 4,
    };
  }

  return {
    code: "standard",
    mode: "balanced",
    primaryModel:
      process.env.VISION_MODEL_BALANCED ?? "gpt-5-nano",
    escalationModel:
      process.env.VISION_MODEL_ESCALATION ?? "gpt-5-mini",
    detail: detail(process.env.VISION_DETAIL_BALANCED, "low"),
    maxOutputTokens: positiveInteger(
      process.env.VISION_MAX_OUTPUT_BALANCED,
      2400,
    ),
    maximumFrames: 3,
  };
}

export function otherValidationModel(model: string) {
  return model.includes("nano")
    ? process.env.VISION_MODEL_ESCALATION ?? "gpt-5-mini"
    : process.env.VISION_MODEL_ECONOMIC ?? "gpt-5-nano";
}
