import assert from "node:assert/strict";
import test from "node:test";
import { AdaptiveMotionCalibration } from "../agent/src/motion-calibration.js";

test("eleva o limiar de continuação quando o repouso comprovado fica acima dele", () => {
  const calibration = new AdaptiveMotionCalibration();
  for (let index = 0; index < 60; index += 1) {
    calibration.observe(0.48 + (index % 3) * 0.02, 1, true);
  }
  const snapshot = calibration.snapshot(1, 0.25, true);
  assert.equal(snapshot.ready, true);
  assert.ok(snapshot.samples >= 12);
  assert.equal(snapshot.effectiveStartThreshold, 1);
  assert.ok(snapshot.effectiveContinueThreshold > 0.25);
  assert.ok(snapshot.effectiveContinueThreshold < snapshot.effectiveStartThreshold);
});

test("movimento acima da janela de repouso não ensina a câmera a ficar insensível", () => {
  const calibration = new AdaptiveMotionCalibration();
  for (let index = 0; index < 60; index += 1) {
    calibration.observe(1.4 + (index % 3) * 0.05, 1, true);
  }
  const snapshot = calibration.snapshot(1, 0.25, true);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.samples, 0);
  assert.equal(snapshot.effectiveStartThreshold, 1);
  assert.equal(snapshot.effectiveContinueThreshold, 0.25);
});

test("preserva os limites configurados quando o modo adaptativo está desligado", () => {
  const calibration = new AdaptiveMotionCalibration();
  for (let index = 0; index < 60; index += 1) calibration.observe(1.5, 1, true);
  const snapshot = calibration.snapshot(1.25, 0.6, false);
  assert.equal(snapshot.ready, true);
  assert.equal(snapshot.effectiveStartThreshold, 1.25);
  assert.equal(snapshot.effectiveContinueThreshold, 0.6);
});
