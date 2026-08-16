import assert from "node:assert/strict";
import test from "node:test";
import { EmptySceneComplexity } from "../src/contracts/scene-intelligence.js";
import {
  EVENT_REVIEW_CONFIDENCE_THRESHOLD,
  normalizeAnalyzedEventZones,
} from "../src/lib/event-analysis.js";

function eventWith(
  confidence: number,
  primaryEventType:
    | "vehicle_present"
    | "person_present"
    | "no_relevant_change" = "vehicle_present",
  requiresReview = false,
  reviewReasons: string[] = [],
) {
  return {
    schemaVersion: "1.5" as const,
    headline:
      primaryEventType === "no_relevant_change"
        ? "Sem mudança relevante"
        : "Acontecimento detectado",
    primaryEventType,
    summary:
      primaryEventType === "no_relevant_change"
        ? "Nenhuma mudança relevante foi confirmada."
        : "A IA detectou um acontecimento visual relevante.",
    observations: [],
    people: [],
    vehicles: [],
    objects: [],
    stateObservations: [],
    sessionSignals: [],
    entityRelations: [],
    sceneComplexity: {
      ...EmptySceneComplexity,
      notes: [...EmptySceneComplexity.notes],
    },
    zoneIds: [],
    tags: [],
    confidence,
    requiresReview,
    reviewReasons,
  };
}

test("evento relevante com confiança zero sempre exige revisão", () => {
  const result = normalizeAnalyzedEventZones(
    eventWith(0),
    new Set<string>(),
  );

  assert.equal(result.requiresReview, true);
  assert.ok(
    result.reviewReasons.includes("low_event_confidence"),
  );
  assert.ok(
    result.reviewReasons.includes("zero_event_confidence"),
  );
});

test("evento relevante abaixo de 35% exige revisão", () => {
  const result = normalizeAnalyzedEventZones(
    eventWith(EVENT_REVIEW_CONFIDENCE_THRESHOLD - 0.01),
    new Set<string>(),
  );

  assert.equal(result.requiresReview, true);
  assert.ok(
    result.reviewReasons.includes("low_event_confidence"),
  );
  assert.equal(
    result.reviewReasons.includes("zero_event_confidence"),
    false,
  );
});

test("evento relevante com 35% ou mais preserva decisão do modelo", () => {
  const result = normalizeAnalyzedEventZones(
    eventWith(EVENT_REVIEW_CONFIDENCE_THRESHOLD),
    new Set<string>(),
  );

  assert.equal(result.requiresReview, false);
  assert.deepEqual(result.reviewReasons, []);
});

test("guarda preserva motivos de revisão já informados sem duplicar", () => {
  const result = normalizeAnalyzedEventZones(
    eventWith(
      0.2,
      "person_present",
      true,
      ["occlusion", "low_event_confidence"],
    ),
    new Set<string>(),
  );

  assert.equal(result.requiresReview, true);
  assert.deepEqual(
    result.reviewReasons.sort(),
    ["low_event_confidence", "occlusion"].sort(),
  );
});

test("no_relevant_change não cria fila de revisão só por confiança baixa", () => {
  const result = normalizeAnalyzedEventZones(
    eventWith(0, "no_relevant_change"),
    new Set<string>(),
  );

  assert.equal(result.requiresReview, false);
  assert.deepEqual(result.reviewReasons, []);
});
