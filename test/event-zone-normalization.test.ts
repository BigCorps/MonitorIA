import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAnalyzedEventZones,
} from "../src/lib/event-analysis.js";

const allowed =
  "4c8ebdd5-720d-4bc4-8a84-6e0f921ee0a8";
const invalid =
  "2e8acbac-54bc-4ae9-b2ec-a176b38f32fd";

test("remove zonas que não pertencem ao perfil ativo", () => {
  const normalized =
    normalizeAnalyzedEventZones(
      {
        schemaVersion: "1.1",
        headline:
          "Pessoa permaneceu na área observada",
        primaryEventType:
          "person_present",
        summary:
          "Uma pessoa permaneceu na zona observada.",
        observations: [
          {
            type: "person_present",
            offsetSeconds: 2,
            description: "Pessoa visível.",
            zoneIds: [allowed, invalid],
            confidence: 0.9,
          },
        ],
        people: [
          {
            localTrackId: "p1",
            role: "customer",
            roleConfidence: 0.8,
            upperClothingColor: null,
            lowerClothingColor: null,
            accessories: [],
            carrying: [],
            zoneIds: [invalid, allowed],
            confidence: 0.8,
          },
        ],
        vehicles: [],
        objects: [],
        zoneIds: [
          invalid,
          allowed,
          allowed,
        ],
        tags: ["pessoa"],
        confidence: 0.88,
        requiresReview: false,
        reviewReasons: [],
      },
      new Set([allowed]),
    );

  assert.deepEqual(
    normalized.zoneIds,
    [allowed],
  );
  assert.deepEqual(
    normalized.observations[0]?.zoneIds,
    [allowed],
  );
  assert.deepEqual(
    normalized.people[0]?.zoneIds,
    [allowed],
  );
  assert.equal(
    normalized.people[0]?.role,
    "customer",
  );
});
