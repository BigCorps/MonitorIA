/**
 * Política única para refinamentos aprendidos a partir de feedback humano.
 *
 * Nesta fase o arquivo define o contrato. Os consumidores serão ligados
 * seção por seção para evitar mudanças silenciosas no comportamento atual.
 */

export const HUMAN_FEEDBACK_POLICY = {
  autoApply: false,
  minimumSimilarCorrectionsForSuggestion: 3,
  preferredSimilarCorrectionsForSuggestion: 5,
  requireHumanApproval: true,
  versionApprovedRefinements: true,
  allowRollback: true,
} as const;

export type HumanFeedbackDecision =
  | "correct"
  | "irrelevant"
  | "incorrect_classification";

export type RefinementReadiness =
  | "collecting"
  | "can_suggest"
  | "strong_suggestion";

export function refinementReadiness(
  similarApprovedCorrections: number,
): RefinementReadiness {
  const count = Math.max(0, Math.floor(similarApprovedCorrections));

  if (
    count >=
    HUMAN_FEEDBACK_POLICY.preferredSimilarCorrectionsForSuggestion
  ) {
    return "strong_suggestion";
  }

  if (
    count >=
    HUMAN_FEEDBACK_POLICY.minimumSimilarCorrectionsForSuggestion
  ) {
    return "can_suggest";
  }

  return "collecting";
}

export function humanFeedbackLabel(decision: HumanFeedbackDecision) {
  const labels: Record<HumanFeedbackDecision, string> = {
    correct: "Sim, está correta",
    irrelevant: "Não é relevante",
    incorrect_classification: "Está classificado errado",
  };

  return labels[decision];
}
