import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseEvidenceCapturePrefixV103,
  segmentBelongsToEventWindowV103,
} from "../agent/src/v103/early-evidence-pinning.js";

const id =
  "123e4567-e89b-42d3-a456-426614174000";

test("reconhece ciclo de evidência do detector normal", () => {
  assert.deepEqual(
    parseEvidenceCapturePrefixV103(
      `${id}-start`,
    ),
    {
      eventId: id,
      label: "start",
    },
  );

  assert.deepEqual(
    parseEvidenceCapturePrefixV103(
      `${id}-end`,
    ),
    {
      eventId: id,
      label: "end",
    },
  );
});

test("reconhece também o detector estrutural 1.0.3", () => {
  assert.deepEqual(
    parseEvidenceCapturePrefixV103(
      `${id}-v103-structural-peak`,
    ),
    {
      eventId: id,
      label: "peak",
    },
  );
});

test("não prende capturas que não pertencem a acontecimentos", () => {
  assert.equal(
    parseEvidenceCapturePrefixV103(
      "profile-snapshot",
    ),
    null,
  );
});

test("seleção de segmentos inclui margem antes e depois", () => {
  const start = 100_000;
  const end = 120_000;

  assert.equal(
    segmentBelongsToEventWindowV103(
      {
        startedAt: 96_000,
        modifiedAt: 99_000,
      },
      start,
      end,
    ),
    true,
  );

  assert.equal(
    segmentBelongsToEventWindowV103(
      {
        startedAt: 80_000,
        modifiedAt: 90_000,
      },
      start,
      end,
    ),
    false,
  );
});

test("pinning é contínuo e reaproveita o builder homologado", async () => {
  const source = await readFile(
    new URL(
      "../agent/src/v103/early-evidence-pinning.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /PIN_INTERVAL_MS = 4_000/,
  );
  assert.match(
    source,
    /\.pinning/,
  );
  assert.match(
    source,
    /protectVideoFiles/,
  );
  assert.match(
    source,
    /buildClipFromSegments/,
  );
  assert.match(
    source,
    /restorePinnedProtection/,
  );
});
