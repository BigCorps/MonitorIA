import assert from "node:assert/strict";
import test from "node:test";
import {
  frameFingerprint,
  isLikelySameVisualStream,
} from "../agent/src/discovery/frame-fingerprint.js";

const WIDTH = 160;
const HEIGHT = 90;

function gradientFrame() {
  const frame = new Uint8Array(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      frame[y * WIDTH + x] =
        (x * 2 + y * 3 + ((x >> 4) % 3) * 13) % 256;
    }
  }

  return frame;
}

test("mesma cena com pequena variação continua sendo alias visual", () => {
  const first = gradientFrame();
  const second = Uint8Array.from(first, (value, index) => {
    const noise = index % 17 === 0 ? 2 : index % 23 === 0 ? -2 : 0;
    return Math.max(0, Math.min(255, value + noise));
  });

  assert.equal(
    isLikelySameVisualStream(
      frameFingerprint(first, WIDTH, HEIGHT),
      frameFingerprint(second, WIDTH, HEIGHT),
    ),
    true,
  );
});

test("pequeno movimento local não cria uma câmera física diferente", () => {
  const first = gradientFrame();
  const second = Uint8Array.from(first);

  for (let y = 30; y < 52; y += 1) {
    for (let x = 62; x < 86; x += 1) {
      second[y * WIDTH + x] = Math.min(
        255,
        (second[y * WIDTH + x] ?? 0) + 24,
      );
    }
  }

  assert.equal(
    isLikelySameVisualStream(
      frameFingerprint(first, WIDTH, HEIGHT),
      frameFingerprint(second, WIDTH, HEIGHT),
    ),
    true,
  );
});

test("cenas visualmente diferentes permanecem canais distintos", () => {
  const first = gradientFrame();
  const second = new Uint8Array(WIDTH * HEIGHT);

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      second[y * WIDTH + x] =
        first[y * WIDTH + (WIDTH - x - 1)] ?? 0;
    }
  }

  assert.equal(
    isLikelySameVisualStream(
      frameFingerprint(first, WIDTH, HEIGHT),
      frameFingerprint(second, WIDTH, HEIGHT),
    ),
    false,
  );
});

test("cenas quase uniformes só deduplicam quando o frame bruto é igual", () => {
  const first = new Uint8Array(WIDTH * HEIGHT).fill(100);
  const identical = Uint8Array.from(first);
  const other = new Uint8Array(WIDTH * HEIGHT).fill(104);

  assert.equal(
    isLikelySameVisualStream(
      frameFingerprint(first, WIDTH, HEIGHT),
      frameFingerprint(identical, WIDTH, HEIGHT),
    ),
    true,
  );

  assert.equal(
    isLikelySameVisualStream(
      frameFingerprint(first, WIDTH, HEIGHT),
      frameFingerprint(other, WIDTH, HEIGHT),
    ),
    false,
  );
});
