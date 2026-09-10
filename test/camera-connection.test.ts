import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_SIGNAL_STALE_MS,
  cameraHasRecentSignal,
} from "../src/lib/camera-connection.js";

const NOW = Date.parse("2026-09-10T18:00:00.000Z");

test("câmera online com sinal recente aparece online", () => {
  assert.equal(
    cameraHasRecentSignal("online", "2026-09-10T17:50:00.000Z", NOW),
    true,
  );
});

test("status online persistido não mascara sinal antigo", () => {
  assert.equal(
    cameraHasRecentSignal(
      "online",
      new Date(NOW - CAMERA_SIGNAL_STALE_MS - 1).toISOString(),
      NOW,
    ),
    false,
  );
});

test("câmera sem last_seen nunca é tratada como online recente", () => {
  assert.equal(cameraHasRecentSignal("online", null, NOW), false);
});

test("status diferente de online continua sem sinal recente", () => {
  assert.equal(
    cameraHasRecentSignal("offline", "2026-09-10T17:59:00.000Z", NOW),
    false,
  );
});
