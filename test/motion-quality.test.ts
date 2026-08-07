import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMotion,
  isLikelyCameraNoise,
  MOTION_HEIGHT,
  MOTION_WIDTH,
} from "../agent/src/motion.js";

const size = MOTION_WIDTH * MOTION_HEIGHT;

test("rejeita mudança global de exposição ou infravermelho", () => {
  const previous = Buffer.alloc(size, 25);
  const current = Buffer.alloc(size, 70);
  const motion = calculateMotion(previous, current);

  assert.equal(motion.activeRegionCount, 9);
  assert.equal(motion.motionSpreadPercent, 100);
  assert.ok(motion.directionalChangeRatio > 0.99);
  assert.equal(isLikelyCameraNoise(motion), true);
});

test("rejeita ruído difuso do sensor em baixa luz", () => {
  const previous = Buffer.alloc(size, 2);
  const current = Buffer.alloc(size, 2);

  for (let index = 0; index < size; index += 20) {
    current[index] = 28;
  }

  const motion = calculateMotion(previous, current);

  assert.ok(motion.meanLuma < 10);
  assert.ok(motion.motionSpreadPercent > 85);
  assert.ok(motion.motionDensityPercent <= 6);
  assert.equal(isLikelyCameraNoise(motion), true);
});

test("preserva movimento localizado de pessoa ou objeto", () => {
  const previous = Buffer.alloc(size, 25);
  const current = Buffer.alloc(size, 25);

  for (let y = 20; y < 60; y += 1) {
    for (let x = 50; x < 85; x += 1) {
      current[y * MOTION_WIDTH + x] = 90;
    }
  }

  const motion = calculateMotion(previous, current);

  assert.ok(motion.changedPixelPercent > 5);
  assert.ok(motion.motionSpreadPercent < 15);
  assert.equal(isLikelyCameraNoise(motion), false);
});
