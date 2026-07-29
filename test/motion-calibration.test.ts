import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveMotionCalibration } from "../agent/src/motion-calibration.js";

test("eleva os limiares quando o ruído fica acima da configuração", () => {
  const calibration = new AdaptiveMotionCalibration();

  for (let index = 0; index < 60; index += 1) {
    calibration.observe(1.4 + (index % 3) * 0.05, 1, true);
  }

  const snapshot = calibration.snapshot(1, 0.25, true);

  assert.equal(snapshot.ready, true);
  assert.ok(snapshot.effectiveStartThreshold > 2);
  assert.ok(snapshot.effectiveContinueThreshold > 1);
});

test("preserva os limites configurados quando o modo adaptativo está desligado", () => {
  const calibration = new AdaptiveMotionCalibration();

  for (let index = 0; index < 60; index += 1) {
    calibration.observe(1.5, 1, true);
  }

  const snapshot = calibration.snapshot(1.25, 0.6, false);

  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.effectiveStartThreshold, 1.25);
  assert.equal(snapshot.effectiveContinueThreshold, 0.6);
});
