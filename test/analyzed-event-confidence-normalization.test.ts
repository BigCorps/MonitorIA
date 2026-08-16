import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalyzedEventSchema,
} from "../src/contracts/analyzed-event.js";
import {
  EmptyPersonAppearance,
} from "../src/contracts/person-memory.js";
import {
  EmptySceneComplexity,
  EmptyVehicleAppearance,
} from "../src/contracts/scene-intelligence.js";

function baseEvent() {
  return {
    schemaVersion: "1.5" as const,
    headline: "Movimento identificado na entrada",
    primaryEventType: "person_present" as const,
    summary: "A câmera registrou movimento na área monitorada.",
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
    confidence: 0.8,
    requiresReview: false,
    reviewReasons: [],
  };
}

test("mantém confidências válidas entre 0 e 1", () => {
  const parsed = AnalyzedEventSchema.parse(baseEvent());
  assert.equal(parsed.confidence, 0.8);
});

test("normaliza porcentagens e pequenos overshoots antes da validação", () => {
  const parsed = AnalyzedEventSchema.parse({
    ...baseEvent(),
    confidence: -0.4,
    observations: [
      {
        type: "person_present",
        offsetSeconds: 2,
        description: "Pessoa visível.",
        zoneIds: [],
        confidence: 75,
      },
    ],
    people: [
      {
        localTrackId: "p1",
        role: "visitor",
        roleConfidence: 1.2,
        upperClothingColor: null,
        lowerClothingColor: null,
        accessories: [],
        carrying: [],
        zoneIds: [],
        appearance: {
          ...EmptyPersonAppearance,
          distinctiveVisibleFeatures: [],
        },
        confidence: 0.91,
      },
    ],
    vehicles: [
      {
        localTrackId: "v1",
        type: "car",
        color: "branco",
        plateSuggestion: {
          text: null,
          confidence: 88,
          visibility: "too_small",
          status: "suggestion",
        },
        zoneIds: [],
        appearance: {
          ...EmptyVehicleAppearance,
          distinctiveVisibleFeatures: [],
          visibleAccessories: [],
        },
        confidence: 0.82,
      },
    ],
    objects: [
      {
        localTrackId: "o1",
        label: "pacote",
        color: null,
        state: "present",
        zoneIds: [],
        confidence: -5,
      },
    ],
  });

  assert.equal(parsed.confidence, 0);
  assert.equal(parsed.observations[0]?.confidence, 0.75);
  assert.equal(parsed.people[0]?.roleConfidence, 1);
  assert.equal(
    parsed.vehicles[0]?.plateSuggestion?.confidence,
    0.88,
  );
  assert.equal(parsed.objects[0]?.confidence, 0);
});

test("limita valores absurdos sem derrubar o evento", () => {
  const parsed = AnalyzedEventSchema.parse({
    ...baseEvent(),
    confidence: 250,
  });

  assert.equal(parsed.confidence, 1);
});
