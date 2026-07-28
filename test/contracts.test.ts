import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { AnalyzedEventSchema } from "../src/contracts/analyzed-event.js";

const zoneId = randomUUID();

test("aceita um evento visual válido", () => {
  const parsed = AnalyzedEventSchema.parse({
    schemaVersion: "1.0",
    primaryEventType: "vehicle_entered",
    summary: "Um veículo branco entrou na área monitorada.",
    observations: [
      {
        type: "vehicle_entered",
        offsetSeconds: 0,
        description: "Veículo cruza a entrada.",
        zoneIds: [zoneId],
        confidence: 0.9,
      },
    ],
    people: [],
    vehicles: [
      {
        localTrackId: "vehicle_1",
        type: "car",
        color: "branco",
        plateSuggestion: {
          text: "ABC1D23",
          confidence: 0.55,
          visibility: "partial",
          status: "suggestion",
        },
        zoneIds: [zoneId],
        confidence: 0.88,
      },
    ],
    objects: [],
    zoneIds: [zoneId],
    tags: ["veículo", "entrada", "branco"],
    confidence: 0.89,
    requiresReview: false,
    reviewReasons: [],
  });

  assert.equal(parsed.vehicles[0]?.plateSuggestion?.status, "suggestion");
});

test("rejeita confiança fora de 0 a 1", () => {
  assert.throws(() =>
    AnalyzedEventSchema.parse({
      schemaVersion: "1.0",
      primaryEventType: "other",
      summary: "Teste",
      observations: [],
      people: [],
      vehicles: [],
      objects: [],
      zoneIds: [],
      tags: [],
      confidence: 2,
      requiresReview: false,
      reviewReasons: [],
    }),
  );
});
