import type { AnalyzedEvent } from "@/src/contracts/analyzed-event";
import type {
  CameraIntelligenceConfig,
  CameraIntelligenceMode,
} from "@/src/contracts/scene-intelligence";
import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";
import type { AnalyzeEventInput } from "./types";

export type VisionRouteCode =
  | "deterministic"
  | "economic"
  | "balanced"
  | "strong";

export type VisionRoutingReason = {
  code: string;
  weight: number;
  detail: string;
};

export type VisionRoutingDecision = {
  version: "1.0";
  planCode: AnalysisPlanCode;
  cameraMode: CameraIntelligenceMode;
  sceneDensity: CameraIntelligenceConfig["sceneDensity"];
  preflightScore: number;
  postflightScore: number | null;
  selectedRoute: VisionRouteCode;
  initialRoute: VisionRouteCode;
  cappedByPlan: boolean;
  deterministicDisposition:
    | "none"
    | "ignore"
    | "reuse_state"
    | "await_more_frames";
  verificationRequested: boolean;
  verificationLimitedByPlan: boolean;
  critical: boolean;
  reasons: VisionRoutingReason[];
};

const MODE_BASE: Record<CameraIntelligenceMode, number> = {
  auto: 10,
  general: 8,
  entrance: 14,
  service_counter: 16,
  checkout: 18,
  parking: 18,
  warehouse: 16,
  corridor: 13,
  production: 20,
  restricted_area: 23,
  crowd: 32,
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function routeForScore(
  score: number,
  config: CameraIntelligenceConfig,
  deterministicDisposition: VisionRoutingDecision["deterministicDisposition"],
): VisionRouteCode {
  if (
    deterministicDisposition !== "none" &&
    score < 20
  ) {
    return "deterministic";
  }

  if (score < 35) return "economic";
  if (score < config.strongThreshold) return "balanced";
  return "strong";
}

function capRouteForPlan(
  route: VisionRouteCode,
  planCode: AnalysisPlanCode,
) {
  if (planCode === "basic" && ["balanced", "strong"].includes(route)) {
    return { route: "economic" as const, capped: true };
  }

  if (planCode === "standard" && route === "deterministic") {
    return { route, capped: false };
  }

  return { route, capped: false };
}

function addReason(
  reasons: VisionRoutingReason[],
  code: string,
  weight: number,
  detail: string,
) {
  if (!weight) return;
  reasons.push({ code, weight, detail });
}

export function assessPreflightComplexity(
  input: AnalyzeEventInput,
  planCode: AnalysisPlanCode,
): VisionRoutingDecision {
  const config = input.profile.intelligence;
  const reasons: VisionRoutingReason[] = [];
  let score = MODE_BASE[config.mode];

  addReason(
    reasons,
    "camera_mode",
    MODE_BASE[config.mode],
    `Modo de câmera ${config.mode}.`,
  );

  if (config.sceneDensity === "high") {
    score += 15;
    addReason(reasons, "scene_density", 15, "Densidade configurada como alta.");
  } else if (config.sceneDensity === "low") {
    score -= 4;
    addReason(reasons, "scene_density", -4, "Densidade configurada como baixa.");
  }

  const peak = Number(input.localMetrics.peakMotionPercent ?? 0);
  if (peak >= 15) {
    score += 15;
    addReason(reasons, "high_motion", 15, `Pico de movimento ${peak.toFixed(2)}%.`);
  } else if (peak >= 7) {
    score += 8;
    addReason(reasons, "medium_motion", 8, `Pico de movimento ${peak.toFixed(2)}%.`);
  } else if (peak >= 3) {
    score += 4;
    addReason(reasons, "visible_motion", 4, `Pico de movimento ${peak.toFixed(2)}%.`);
  }

  const duration = Number(input.localMetrics.durationSeconds ?? 0);
  if (duration >= 180) {
    score += 10;
    addReason(reasons, "long_event", 10, `Evento com ${duration.toFixed(0)} segundos.`);
  } else if (duration >= 60) {
    score += 6;
    addReason(reasons, "medium_event", 6, `Evento com ${duration.toFixed(0)} segundos.`);
  }

  if (input.frames.length === 1) {
    score += 7;
    addReason(reasons, "single_frame", 7, "Somente um quadro disponível aumenta ambiguidade temporal.");
  } else if (input.frames.length >= 3) {
    score += 3;
    addReason(reasons, "temporal_sequence", 3, "Sequência temporal com três ou mais quadros.");
  }

  const regionCount = Number(input.localMetrics.motionRegionCount ?? 0);
  if (regionCount >= 4) {
    score += 12;
    addReason(reasons, "many_motion_regions", 12, `${regionCount} regiões de movimento.`);
  } else if (regionCount >= 2) {
    score += 6;
    addReason(reasons, "multiple_motion_regions", 6, `${regionCount} regiões de movimento.`);
  }

  const spread = Number(input.localMetrics.motionSpreadPercent ?? 0);
  if (spread >= 60) {
    score += 12;
    addReason(reasons, "wide_motion", 12, `Movimento ocupa ${spread.toFixed(1)}% do quadro.`);
  } else if (spread >= 30) {
    score += 6;
    addReason(reasons, "distributed_motion", 6, `Movimento ocupa ${spread.toFixed(1)}% do quadro.`);
  }

  const candidateEntityIds = Array.isArray(
    input.localMetrics.candidateEntityIds,
  )
    ? input.localMetrics.candidateEntityIds
    : [];

  if (candidateEntityIds.length >= 2) {
    score += 8;
    addReason(
      reasons,
      "multiple_state_entities",
      8,
      `${candidateEntityIds.length} entidades visuais candidatas.`,
    );
  } else if (candidateEntityIds.length === 1) {
    score += 4;
    addReason(reasons, "state_entity", 4, "Entidade visual configurada envolvida.");
  }

  if (input.localMetrics.outsideDeclaredHours) {
    score += 8;
    addReason(reasons, "outside_hours", 8, "Evento fora do horário declarado.");
  }

  if (input.localMetrics.afterConfirmedClosing) {
    score += 15;
    addReason(reasons, "after_closing", 15, "Evento após fechamento visual confirmado.");
  }

  const deterministicDisposition =
    input.localMetrics.deterministicDisposition ?? "none";
  const preflightScore = clampScore(score);
  const initialRoute = config.complexityRoutingEnabled
    ? routeForScore(preflightScore, config, deterministicDisposition)
    : planCode === "intensive"
      ? "strong"
      : planCode === "standard"
        ? "balanced"
        : "economic";
  const capped = capRouteForPlan(initialRoute, planCode);

  return {
    version: "1.0",
    planCode,
    cameraMode: config.mode,
    sceneDensity: config.sceneDensity,
    preflightScore,
    postflightScore: null,
    selectedRoute: capped.route,
    initialRoute,
    cappedByPlan: capped.capped,
    deterministicDisposition,
    verificationRequested: false,
    verificationLimitedByPlan: false,
    critical: Boolean(
      input.localMetrics.afterConfirmedClosing ||
        candidateEntityIds.length > 0,
    ),
    reasons,
  };
}

export function assessPostflightComplexity(
  event: AnalyzedEvent,
  decision: VisionRoutingDecision,
  config: CameraIntelligenceConfig,
): VisionRoutingDecision {
  const reasons = [...decision.reasons];
  let score = decision.preflightScore;

  const people = Math.max(
    event.people.length,
    event.sceneComplexity.visiblePersonCount,
  );
  const vehicles = Math.max(
    event.vehicles.length,
    event.sceneComplexity.visibleVehicleCount,
  );

  if (people >= 6) {
    score += 20;
    addReason(reasons, "crowd_detected", 20, `${people} pessoas visíveis.`);
  } else if (people >= 3) {
    score += 12;
    addReason(reasons, "multiple_people", 12, `${people} pessoas visíveis.`);
  } else if (people >= 2) {
    score += 6;
    addReason(reasons, "two_people", 6, "Duas pessoas visíveis.");
  }

  if (vehicles >= 3) {
    score += 12;
    addReason(reasons, "multiple_vehicles", 12, `${vehicles} veículos visíveis.`);
  } else if (vehicles >= 2) {
    score += 7;
    addReason(reasons, "two_vehicles", 7, "Dois veículos visíveis.");
  }

  if (event.sceneComplexity.occlusionLevel === "high") {
    score += 16;
    addReason(reasons, "high_occlusion", 16, "Oclusão alta entre entidades.");
  } else if (event.sceneComplexity.occlusionLevel === "partial") {
    score += 7;
    addReason(reasons, "partial_occlusion", 7, "Oclusão parcial entre entidades.");
  }

  if (event.sceneComplexity.identityAmbiguity === "high") {
    score += 15;
    addReason(reasons, "identity_ambiguity", 15, "Alta ambiguidade de continuidade visual.");
  } else if (event.sceneComplexity.identityAmbiguity === "medium") {
    score += 7;
    addReason(reasons, "identity_ambiguity", 7, "Ambiguidade moderada de continuidade visual.");
  }

  const simultaneousActions = Math.max(
    event.sceneComplexity.simultaneousActionCount,
    event.entityRelations.length,
  );
  if (simultaneousActions >= 4) {
    score += 14;
    addReason(reasons, "many_actions", 14, `${simultaneousActions} ações ou relações.`);
  } else if (simultaneousActions >= 2) {
    score += 7;
    addReason(reasons, "simultaneous_actions", 7, `${simultaneousActions} ações ou relações.`);
  }

  if (
    event.stateObservations.some(
      (observation) => observation.transitionVisible,
    )
  ) {
    score += 8;
    addReason(reasons, "state_transition", 8, "Mudança de estado visual observada.");
  }

  if (
    ["unusual_activity", "zone_intrusion"].includes(
      event.primaryEventType,
    )
  ) {
    score += 8;
    addReason(reasons, "sensitive_event", 8, "Evento em categoria operacional sensível.");
  }

  if (event.requiresReview) {
    score += 8;
    addReason(reasons, "review_required", 8, "A análise solicitou revisão.");
  }

  const postflightScore = clampScore(score);
  const verificationRequested = Boolean(
    config.verificationEnabled &&
      decision.planCode !== "basic" &&
      (
        postflightScore >= config.verificationThreshold ||
        (
          decision.critical &&
          event.confidence < 0.82
        ) ||
        event.sceneComplexity.identityAmbiguity === "high"
      ),
  );

  return {
    ...decision,
    postflightScore,
    verificationRequested,
    critical:
      decision.critical ||
      event.stateObservations.some(
        (observation) => observation.transitionVisible,
      ),
    reasons,
  };
}
