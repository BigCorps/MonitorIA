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
} from "../src/contracts/scene-intelligence.js";
import {
  CHILD_SAFETY_MONITORING_GOAL,
  childSafetyClassificationEnabled,
  normalizeChildSafetyOutput,
  publicMonitoringGoals,
} from "../src/vision/child-safety.js";
import {
  buildVisionInstructions,
} from "../src/vision/prompt.js";
import {
  normalizeAnalyzedEventZones,
} from "../src/lib/event-analysis.js";

function baseEvent() {
  return {
    schemaVersion: "1.5" as const,
    headline: "Pessoa entrou na área",
    primaryEventType: "person_entered" as const,
    summary: "Uma pessoa entrou.",
    observations: [],
    people: [
      {
        localTrackId: "person-1",
        role: "unknown" as const,
        roleConfidence: 0.5,
        upperClothingColor: null,
        lowerClothingColor: null,
        accessories: [],
        carrying: [],
        zoneIds: [],
        appearance: EmptyPersonAppearance,
        confidence: 0.8,
      },
    ],
    vehicles: [],
    objects: [],
    stateObservations: [],
    sessionSignals: [],
    entityRelations: [],
    sceneComplexity: EmptySceneComplexity,
    zoneIds: [],
    tags: [],
    confidence: 0.8,
    requiresReview: false,
    reviewReasons: [],
  };
}

test("feature flag depende do objetivo interno exato", () => {
  assert.equal(
    childSafetyClassificationEnabled({
      monitoringGoals: [CHILD_SAFETY_MONITORING_GOAL],
    }),
    true,
  );
  assert.equal(
    childSafetyClassificationEnabled({
      monitoringGoals: ["Contar pessoas"],
    }),
    false,
  );
});

test("marcador interno não é enviado como objetivo operacional", () => {
  assert.deepEqual(
    publicMonitoringGoals([
      "Contar pessoas",
      CHILD_SAFETY_MONITORING_GOAL,
    ]),
    ["Contar pessoas"],
  );
});

test("eventos 1.5 antigos recebem unknown sem quebrar", () => {
  const parsed = AnalyzedEventSchema.parse(baseEvent());
  assert.equal(parsed.people[0]?.apparentAgeGroup, "unknown");
  assert.equal(parsed.people[0]?.apparentAgeGroupConfidence, 0);
});

test("câmera sem piloto força unknown mesmo se o modelo sugerir criança", () => {
  const raw = {
    ...baseEvent(),
    people: [
      {
        ...baseEvent().people[0],
        apparentAgeGroup: "child",
        apparentAgeGroupConfidence: 0.94,
      },
    ],
  };

  const normalized = normalizeChildSafetyOutput(raw, false) as any;
  assert.equal(normalized.people[0].apparentAgeGroup, "unknown");
  assert.equal(normalized.people[0].apparentAgeGroupConfidence, 0);
});

test("provável criança exige revisão humana de forma determinística", () => {
  const raw = AnalyzedEventSchema.parse({
    ...baseEvent(),
    people: [
      {
        ...baseEvent().people[0],
        apparentAgeGroup: "child",
        apparentAgeGroupConfidence: 0.82,
      },
    ],
  });

  const result = normalizeAnalyzedEventZones(
    raw,
    new Set<string>(),
  );

  assert.equal(result.requiresReview, true);
  assert.ok(result.tags.includes("probable_child"));
  assert.ok(
    result.reviewReasons.includes(
      "child_age_group_requires_human_review",
    ),
  );
});

test("prompt habilitado proíbe idade exata e reconhecimento facial", () => {
  const prompt = buildVisionInstructions("balanced", false, true);
  assert.match(prompt, /apparentAgeGroup=child, adult ou unknown/);
  assert.match(prompt, /Não determine idade exata/);
  assert.match(prompt, /Não use reconhecimento facial/);
  assert.match(prompt, /revisão humana/);
});

test("prompt comum exige unknown", () => {
  const prompt = buildVisionInstructions("balanced", false, false);
  assert.match(prompt, /use apparentAgeGroup=unknown/);
  assert.match(prompt, /Não estime idade, faixa etária/);
});
