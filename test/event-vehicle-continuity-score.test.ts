import assert from "node:assert/strict";
import test from "node:test";
import { scoreVehicleContinuationCandidate } from "../src/lib/event-vehicle-continuity.js";

function vehicle(input: {
  color?: string;
  bodyStyle?: string;
  sizeClass?: string;
  orientation?: string;
  zones?: string[];
}) {
  return {
    type: "car",
    color: input.color ?? "unknown",
    zoneIds: input.zones ?? ["zone-garage"],
    appearance: {
      colorFamily: input.color ?? "unknown",
      bodyStyle: input.bodyStyle ?? "sedan",
      sizeClass: input.sizeClass ?? "unknown",
      orientation: input.orientation ?? "front",
      distinctiveVisibleFeatures: [],
      visibleAccessories: [],
      confidence: 0.8,
    },
  };
}

test("mesmo veículo provável na mesma zona e poucos minutos recebe continuidade forte", () => {
  const score = scoreVehicleContinuationCandidate({
    current: vehicle({ color: "unknown", bodyStyle: "sedan" }),
    previous: vehicle({ color: "unknown", bodyStyle: "sedan" }),
    gapSeconds: 180,
  });

  assert.ok(score >= 0.72);
});

test("cores conhecidas conflitantes impedem continuidade", () => {
  const score = scoreVehicleContinuationCandidate({
    current: vehicle({ color: "white" }),
    previous: vehicle({ color: "black" }),
    gapSeconds: 90,
  });

  assert.equal(score, 0);
});

test("veículos em zonas diferentes não são agrupados", () => {
  const score = scoreVehicleContinuationCandidate({
    current: vehicle({ zones: ["zone-street"] }),
    previous: vehicle({ zones: ["zone-garage"] }),
    gapSeconds: 60,
  });

  assert.equal(score, 0);
});
