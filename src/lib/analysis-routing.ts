import type { VisionPlanOutcome } from "@/src/vision/types";

export async function persistAnalysisRoutingDecision(input: {
  supabase: any;
  organizationId: string;
  cameraId: string;
  analysisJobId: string;
  eventId: string | null;
  outcome: VisionPlanOutcome;
}) {
  const finalAttempt = input.outcome.attempts.at(-1);

  const payload = {
    organization_id: input.organizationId,
    camera_id: input.cameraId,
    analysis_job_id: input.analysisJobId,
    event_id: input.eventId,
    plan_code: input.outcome.routing.planCode,
    camera_mode: input.outcome.routing.cameraMode,
    scene_density: input.outcome.routing.sceneDensity,
    preflight_score: input.outcome.routing.preflightScore,
    postflight_score: input.outcome.routing.postflightScore,
    initial_route: input.outcome.routing.initialRoute,
    selected_route: input.outcome.routing.selectedRoute,
    capped_by_plan: input.outcome.routing.cappedByPlan,
    verification_requested:
      input.outcome.routing.verificationRequested,
    verification_limited_by_plan:
      input.outcome.routing.verificationLimitedByPlan,
    verified: input.outcome.verified,
    critical: input.outcome.routing.critical,
    provider: finalAttempt?.provider ?? input.outcome.final.provider,
    model: finalAttempt?.model ?? input.outcome.final.model,
    reasons: input.outcome.routing.reasons,
    attempts: input.outcome.attempts.map((attempt) => ({
      role: attempt.role,
      route: attempt.route ?? null,
      provider: attempt.provider,
      model: attempt.model,
      responseId: attempt.responseId,
      latencyMs: attempt.latencyMs,
      usage: attempt.usage,
    })),
  };

  const { data, error } = await input.supabase
    .from("analysis_routing_decisions")
    .upsert(payload, { onConflict: "analysis_job_id" })
    .select("id")
    .single();

  if (error) {
    console.error(
      "Falha ao registrar decisão de roteamento:",
      error.message,
    );
    return null;
  }

  await input.supabase
    .from("analysis_jobs")
    .update({
      routing_decision_id: String(data.id),
      model_chain: payload.attempts,
    })
    .eq("id", input.analysisJobId)
    .eq("organization_id", input.organizationId);

  if (input.eventId) {
    await input.supabase
      .from("events")
      .update({
        routing_summary: {
          route: payload.selected_route,
          initialRoute: payload.initial_route,
          preflightScore: payload.preflight_score,
          postflightScore: payload.postflight_score,
          verified: payload.verified,
          critical: payload.critical,
          reasons: payload.reasons,
        },
        scene_complexity: input.outcome.final.event.sceneComplexity,
        entity_relation_count:
          input.outcome.final.event.entityRelations.length,
      })
      .eq("id", input.eventId)
      .eq("organization_id", input.organizationId);
  }

  return String(data.id);
}
