import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";
import type {
  VisionAnalysisMode,
  VisionImageDetail,
} from "./types";
import type { VisionRouteCode } from "./complexity-router";

export type VisionPlan = {
  code: AnalysisPlanCode;
  mode: VisionAnalysisMode;
  primaryModel: string;
  escalationModel: string | null;
  detail: VisionImageDetail;
  maxOutputTokens: number;
  maximumFrames: number;
};

export type VisionRouteExecution = {
  route: VisionRouteCode;
  mode: VisionAnalysisMode;
  model: string | null;
  detail: VisionImageDetail;
  maxOutputTokens: number;
  maximumFrames: number;
  verifierModel: string | null;
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
        1800,
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
      escalationModel:
        process.env.VISION_MODEL_VERIFIER ?? "gpt-5-mini",
      detail: detail(process.env.VISION_DETAIL_DETAILED, "high"),
      maxOutputTokens: positiveInteger(
        process.env.VISION_MAX_OUTPUT_DETAILED,
        4000,
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
      2600,
    ),
    maximumFrames: 3,
  };
}

export function resolveVisionRouteExecution(
  code: AnalysisPlanCode,
  route: VisionRouteCode,
): VisionRouteExecution {
  const economicModel =
    process.env.VISION_MODEL_ECONOMIC ?? "gpt-5-nano";
  const balancedModel =
    process.env.VISION_MODEL_BALANCED ?? "gpt-5-nano";
  const strongModel =
    process.env.VISION_MODEL_DETAILED ??
    process.env.VISION_MODEL_ESCALATION ??
    "gpt-5-mini";
  const verifierModel =
    process.env.VISION_MODEL_VERIFIER ?? strongModel;

  if (route === "deterministic") {
    return {
      route,
      mode: "economic",
      model: null,
      detail: "low",
      maxOutputTokens: 0,
      maximumFrames: 0,
      verifierModel: null,
    };
  }

  if (code === "basic") {
    return {
      route: "economic",
      mode: "economic",
      model: economicModel,
      detail: detail(process.env.VISION_DETAIL_ECONOMIC, "low"),
      maxOutputTokens: positiveInteger(
        process.env.VISION_MAX_OUTPUT_ECONOMIC,
        1800,
      ),
      maximumFrames: 1,
      verifierModel: null,
    };
  }

  if (route === "economic") {
    return {
      route,
      mode: "economic",
      model: economicModel,
      detail: detail(process.env.VISION_DETAIL_ECONOMIC, "low"),
      maxOutputTokens: positiveInteger(
        process.env.VISION_MAX_OUTPUT_ECONOMIC,
        1800,
      ),
      maximumFrames: 1,
      verifierModel: code === "intensive" ? verifierModel : null,
    };
  }

  if (route === "strong") {
    return {
      route,
      mode: "detailed",
      model: strongModel,
      detail: detail(process.env.VISION_DETAIL_STRONG, "high"),
      maxOutputTokens: positiveInteger(
        process.env.VISION_MAX_OUTPUT_STRONG,
        code === "intensive" ? 4400 : 3600,
      ),
      maximumFrames: code === "intensive" ? 4 : 3,
      verifierModel,
    };
  }

  return {
    route: "balanced",
    mode: "balanced",
    model: balancedModel,
    detail: detail(process.env.VISION_DETAIL_BALANCED, "low"),
    maxOutputTokens: positiveInteger(
      process.env.VISION_MAX_OUTPUT_BALANCED,
      code === "intensive" ? 3400 : 2600,
    ),
    maximumFrames: 3,
    verifierModel,
  };
}

export function otherValidationModel(model: string) {
  return model.includes("nano")
    ? process.env.VISION_MODEL_ESCALATION ?? "gpt-5-mini"
    : process.env.VISION_MODEL_ECONOMIC ?? "gpt-5-nano";
}
