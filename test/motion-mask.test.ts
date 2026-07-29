import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMotionMask,
  calculateMotion,
  MOTION_HEIGHT,
  MOTION_WIDTH,
} from "../agent/src/motion.js";

test("ignora movimento dentro de um polígono normalizado", () => {
  const size = MOTION_WIDTH * MOTION_HEIGHT;
  const previous = Buffer.alloc(size, 0);
  const current = Buffer.alloc(size, 0);

  for (let y = 0; y < MOTION_HEIGHT / 2; y += 1) {
    for (let x = 0; x < MOTION_WIDTH / 2; x += 1) {
      current[y * MOTION_WIDTH + x] = 255;
    }
  }

  const mask = buildMotionMask(
    [[
      { x: 0, y: 0 },
      { x: 0.5, y: 0 },
      { x: 0.5, y: 0.5 },
      { x: 0, y: 0.5 },
    ]],
    "none",
  );

  const result = calculateMotion(previous, current, 20, mask);
  assert.equal(result.changedPixelPercent, 0);
});

test("máscara explícita cobre o canto superior esquerdo", () => {
  const mask = buildMotionMask([], "top-left");
  const ignored = mask.reduce(
    (total, value) => total + (value ? 1 : 0),
    0,
  );

  assert.ok(ignored > 0);
  assert.ok(ignored < mask.length / 4);
});
