import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalyzedEventSchema,
} from "../src/contracts/analyzed-event.js";

test("aceita headline e papel operacional", () => {
  const parsed = AnalyzedEventSchema.parse({
    schemaVersion: "1.1",
    headline: "Cliente entregou pacote no balcão",
    primaryEventType: "object_appeared",
    summary:
      "Cliente colocou um pacote no balcão e o funcionário o recebeu.",
    observations: [],
    people: [
      {
        localTrackId: "p1",
        role: "customer",
        roleConfidence: 0.9,
        upperClothingColor: "preta",
        lowerClothingColor: null,
        accessories: [],
        carrying: ["pacote"],
        zoneIds: [],
        confidence: 0.9,
      },
    ],
    vehicles: [],
    objects: [],
    zoneIds: [],
    tags: ["entrega", "balcão"],
    confidence: 0.9,
    requiresReview: false,
    reviewReasons: [],
  });

  assert.equal(
    parsed.people[0]?.role,
    "customer",
  );
});

test("rejeita título genérico vazio", () => {
  assert.throws(() =>
    AnalyzedEventSchema.parse({
      schemaVersion: "1.1",
      headline: "",
      primaryEventType: "person_present",
      summary: "Pessoa presente.",
      observations: [],
      people: [],
      vehicles: [],
      objects: [],
      zoneIds: [],
      tags: [],
      confidence: 0.8,
      requiresReview: false,
      reviewReasons: [],
    }),
  );
});
