import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateMotion,
  MOTION_HEIGHT,
  MOTION_WIDTH,
} from "../agent/src/motion.js";

test("calcula a região predominante do movimento", () => {
  const size = MOTION_WIDTH * MOTION_HEIGHT;
  const previous = Buffer.alloc(size, 0);
  const current = Buffer.alloc(size, 0);

  for (let y = 5; y < 25; y += 1) {
    for (let x = 5; x < 35; x += 1) {
      current[y * MOTION_WIDTH + x] = 255;
    }
  }

  const result = calculateMotion(
    previous,
    current,
  );

  assert.ok(
    result.motionCentroidX !== null,
  );
  assert.ok(
    result.motionCentroidY !== null,
  );
  assert.equal(result.dominantRegion, "0:0");
});
