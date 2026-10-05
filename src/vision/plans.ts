import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";
import type {
  VisionAnalysisMode,
  VisionImageDetail,
} from "./types";
import type { VisionRouteCode } from "./complexity-router";
import {
  configuredMonitoriaModel,
  monitoriaTrackForModel,
  type MonitoriaAiTrack,
} from "@/src/ai/model-policy";

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

function routeModel(
  value: string | undefined,
  track: MonitoriaAiTrack,
) {
  return configuredMonitoriaModel(track, value);
}

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

export function getVisionPlan(
  code: AnalysisPlanCode,
  track: MonitoriaAiTrack = "standard",
): VisionPlan {
  if (code === "basic") {
    return {
      code,
      mode: "economic",
      primaryModel: routeModel(process.env.VISION_MODEL_ECONOMIC, track),
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
      primaryModel: routeModel(process.env.VISION_MODEL_DETAILED, track),
      escalationModel: routeModel(process.env.VISION_MODEL_VERIFIER, track),
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
    primaryModel: routeModel(process.env.VISION_MODEL_BALANCED, track),
    escalationModel: routeModel(process.env.VISION_MODEL_ESCALATION, track),
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
  track: MonitoriaAiTrack = "standard",
): VisionRouteExecution {
  const economicModel = routeModel(process.env.VISION_MODEL_ECONOMIC, track);
  const balancedModel = routeModel(process.env.VISION_MODEL_BALANCED, track);
  const strongModel = routeModel(
    process.env.VISION_MODEL_DETAILED ??
      process.env.VISION_MODEL_ESCALATION,
    track,
  );
  const verifierModel = routeModel(
    process.env.VISION_MODEL_VERIFIER ?? strongModel,
    track,
  );

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
  // O A/B legado não cruza tracks. Durante o piloto, VIP continua em Luna
  // e o produto padrão continua em nano.
  return configuredMonitoriaModel(
    monitoriaTrackForModel(model),
    process.env.VISION_MODEL_ECONOMIC,
  );
}
