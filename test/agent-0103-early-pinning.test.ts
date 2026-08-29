import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  GlobalVideoDiskBudget,
  isPersistentPinningDirectoryV103,
} from "../agent/src/v102/disk-budget.js";
import {
  durablePinningRetentionContractV103,
  shouldRetainPinnedEventV103,
} from "../agent/src/v103/durable-pinning-retention.js";
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

test("retenção durável segue fila pendente e ack recente", () => {
  const now = Date.parse("2026-08-29T18:00:00.000Z");
  const contract = durablePinningRetentionContractV103();

  assert.equal(contract.queuePendingHasPriority, true);
  assert.equal(contract.acceptedPinGraceMs, 7 * 24 * 60 * 60_000);

  assert.equal(
    shouldRetainPinnedEventV103({
      queuePending: true,
      acceptedAt: "2026-01-01T00:00:00.000Z",
      nowMs: now,
    }),
    true,
  );

  assert.equal(
    shouldRetainPinnedEventV103({
      queuePending: false,
      acceptedAt: "2026-08-28T18:00:00.000Z",
      nowMs: now,
    }),
    true,
  );

  assert.equal(
    shouldRetainPinnedEventV103({
      queuePending: false,
      acceptedAt: "2026-08-20T18:00:00.000Z",
      nowMs: now,
    }),
    false,
  );
});

test("diretório .pinning é proteção persistente e só cede no último estágio", async () => {
  assert.equal(
    isPersistentPinningDirectoryV103(
      path.join("root", "camera", `${id}.pinning`),
      "evidence",
    ),
    true,
  );
  assert.equal(
    isPersistentPinningDirectoryV103(
      path.join("root", "camera", `${id}.sources`),
      "evidence",
    ),
    false,
  );

  const root = await mkdtemp(path.join(os.tmpdir(), "monitoria-v103-pin-"));
  const previousCap = process.env.MONITORIA_VIDEO_BUFFER_MAX_GB;
  process.env.MONITORIA_VIDEO_BUFFER_MAX_GB = "0.000001";

  try {
    const evidenceRoot = path.join(root, "event-video-evidence", "camera-1");
    const pinnedDir = path.join(evidenceRoot, `${id}.pinning`);
    await mkdir(pinnedDir, { recursive: true });
    await writeFile(path.join(pinnedDir, "000001.ts"), Buffer.alloc(4096, 1));
    await writeFile(path.join(evidenceRoot, "ordinary.mp4"), Buffer.alloc(4096, 2));

    const budget = new GlobalVideoDiskBudget(root);
    await budget.prune(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      true,
      false,
    );

    await assert.rejects(stat(path.join(evidenceRoot, "ordinary.mp4")));
    assert.ok((await stat(path.join(pinnedDir, "000001.ts"))).size > 0);

    await budget.prune(
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      true,
      true,
    );

    await assert.rejects(stat(path.join(pinnedDir, "000001.ts")));
  } finally {
    if (previousCap === undefined) {
      delete process.env.MONITORIA_VIDEO_BUFFER_MAX_GB;
    } else {
      process.env.MONITORIA_VIDEO_BUFFER_MAX_GB = previousCap;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("retenção durável é instalada antes do early-pinning", async () => {
  const indexSource = await readFile(
    new URL("../agent/src/index-v103.ts", import.meta.url),
    "utf8",
  );
  const durable = indexSource.indexOf("installV103DurablePinningRetention();");
  const early = indexSource.indexOf("installV103EarlyEvidencePinning();");

  assert.ok(durable >= 0);
  assert.ok(early >= 0);
  assert.ok(durable < early);
});
