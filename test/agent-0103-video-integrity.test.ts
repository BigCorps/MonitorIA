import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessClipIntegrityV103,
} from "../agent/src/v103/clip-integrity.js";

test("clipe 4 s não pode satisfazer pedido de 50 s", () => {
  const result = assessClipIntegrityV103(50, 4);
  assert.equal(result.accepted, false);
  assert.ok(result.coverageRatio < 0.1);
});

test("pequena diferença de container é tolerada", () => {
  const result = assessClipIntegrityV103(50, 49);
  assert.equal(result.accepted, true);
  assert.ok(result.coverageRatio >= 0.94);
});

test("clipe muito curto é fail-closed no Agent 1.0.3", async () => {
  const source = await readFile(
    new URL(
      "../agent/src/v103/clip-integrity.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /clip_incomplete_coverage/);
  assert.match(source, /resolveFfprobe/);
  assert.match(source, /proto\.buildClip/);
  assert.match(source, /proto\.preservedClip/);
});

test("backend não publica vídeo incompleto como ready", async () => {
  const source = await readFile(
    new URL(
      "../app/api/agent/clips/[requestId]/complete/route.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /clip_incomplete_coverage/);
  assert.match(source, /clipIntegrityStatus/);
  assert.match(source, /integrityRejected/);
  assert.match(source, /requestedDurationSeconds/);
});
