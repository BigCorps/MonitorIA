import { randomUUID } from "node:crypto";
import {
  AnalyzedEventSchema,
  type AnalyzedEvent,
} from "@/src/contracts/analyzed-event";
import type { AnalysisPlanCode } from "@/src/lib/analysis-plans";
import { createVisionProvider } from "./create-provider";
import {
  assessPostflightComplexity,
  assessPreflightComplexity,
  type VisionRouteCode,
  type VisionRoutingDecision,
} from "./complexity-router";
import { resolveVisionRouteExecution } from "./plans";
import type {
  AnalyzeEventInput,
  VisionAnalysisAttempt,
  VisionPlanOutcome,
} from "./types";

function selectFrames(
  input: AnalyzeEventInput,
  route: VisionRouteCode,
  maximumFrames: number,
) {
  if (maximumFrames <= 0) return [];

  if (route === "economic") {
    const best =
      input.frames.find((frame) => frame.label === "peak") ??
      input.frames.find((frame) => frame.label === "end") ??
      input.frames[0];
    return best ? [best] : [];
  }

  const order = route === "strong"
    ? ["start", "extra", "peak", "end"]
    : ["start", "peak", "end", "extra"];

  return order
    .flatMap((label) => {
      const frame = input.frames.find((item) => item.label === label);
      return frame ? [frame] : [];
    })
    .slice(0, maximumFrames);
}

function deterministicEvent(
  disposition: VisionRoutingDecision["deterministicDisposition"],
): AnalyzedEvent {
  const summary =
    disposition === "reuse_state"
      ? "Nenhuma mudança visual suficiente para alterar o estado anterior."
      : disposition === "await_more_frames"
        ? "A análise foi adiada até que haja mais evidência temporal."
        : "Movimento local descartado por regra determinística de baixa relevância.";

  return AnalyzedEventSchema.parse({
    schemaVersion: "1.5",
    headline: "Sem mudança visual relevante",
    primaryEventType: "no_relevant_change",
    summary,
    observations: [],
    people: [],
    vehicles: [],
    objects: [],
    stateObservations: [],
    sessionSignals: [],
    entityRelations: [],
    sceneComplexity: {
      visiblePersonCount: 0,
      visibleVehicleCount: 0,
      simultaneousActionCount: 0,
      crowdLevel: "none",
      occlusionLevel: "none",
      identityAmbiguity: "low",
      actionAssignmentConfidence: 1,
      notes: ["Resultado produzido sem chamada generativa."],
      confidence: 1,
    },
    zoneIds: [],
    tags: ["deterministic"],
    confidence: 1,
    requiresReview: false,
    reviewReasons: [],
  });
}

export async function runVisionModel(
  input: AnalyzeEventInput,
  options: {
    model: string;
    detail: "low" | "high" | "auto";
    maxOutputTokens: number;
    role: VisionAnalysisAttempt["role"];
    route?: VisionRouteCode;
  },
): Promise<VisionAnalysisAttempt> {
  const provider = createVisionProvider({
    model: options.model,
    detail: options.detail,
    maxOutputTokens: options.maxOutputTokens,
  });

  const result = await provider.analyzeEvent(input);
  return {
    ...result,
    role: options.role,
    route: options.route,
  };
}

export async function analyzeEventThroughGateway(
  input: AnalyzeEventInput,
  planCode: AnalysisPlanCode,
): Promise<VisionPlanOutcome> {
  const preflight = assessPreflightComplexity(input, planCode);
  const execution = resolveVisionRouteExecution(
    planCode,
    preflight.selectedRoute,
  );

  if (execution.route === "deterministic") {
    const event = deterministicEvent(preflight.deterministicDisposition);
    const result = {
      event,
      provider: "monitoria",
      model: "deterministic-v1",
      responseId: `det_${randomUUID()}`,
      usage: {
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
      latencyMs: 0,
    };

    return {
      final: result,
      attempts: [
        {
          ...result,
          role: "primary",
          route: "deterministic",
        },
      ],
      escalated: false,
      verified: false,
      routing: preflight,
    };
  }

  if (!execution.model) {
    throw new Error("Rota generativa sem modelo configurado.");
  }

  const routedInput: AnalyzeEventInput = {
    ...input,
    analysisMode: execution.mode,
    frames: selectFrames(
      input,
      execution.route,
      execution.maximumFrames,
    ),
    routingDecision: preflight,
  };

  const primary = await runVisionModel(routedInput, {
    model: execution.model,
    detail: execution.detail,
    maxOutputTokens: execution.maxOutputTokens,
    role: "primary",
    route: execution.route,
  });

  const postflight = assessPostflightComplexity(
    primary.event,
    preflight,
    input.profile.intelligence,
  );

  if (
    postflight.cappedByPlan &&
    (postflight.postflightScore ?? postflight.preflightScore) >=
      input.profile.intelligence.strongThreshold
  ) {
    primary.event = AnalyzedEventSchema.parse({
      ...primary.event,
      requiresReview: true,
      reviewReasons: [
        ...new Set([
          ...primary.event.reviewReasons,
          "scene_complexity_capped_by_plan",
        ]),
      ],
    });
  }

  const attempts: VisionAnalysisAttempt[] = [primary];

  if (
    postflight.verificationRequested &&
    execution.verifierModel
  ) {
    const verifierInput: AnalyzeEventInput = {
      ...input,
      analysisMode: "detailed",
      frames: selectFrames(
        input,
        "strong",
        Math.min(input.frames.length, planCode === "intensive" ? 4 : 3),
      ),
      routingDecision: postflight,
      verificationCandidate: primary.event,
    };

    const verifier = await runVisionModel(verifierInput, {
      model: execution.verifierModel,
      detail: "high",
      maxOutputTokens: Math.max(execution.maxOutputTokens, 3600),
      role: "verifier",
      route: "strong",
    });

    attempts.push(verifier);

    return {
      final: verifier,
      attempts,
      escalated:
        execution.route !== "strong" ||
        execution.verifierModel !== execution.model,
      verified: true,
      routing: postflight,
    };
  }

  return {
    final: primary,
    attempts,
    escalated: false,
    verified: false,
    routing: postflight,
  };
}
