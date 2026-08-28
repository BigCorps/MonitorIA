import assert from "node:assert/strict";
import test from "node:test";

import {
  closedSegmentsV103,
  evidenceSeekAttemptsV103,
  evidenceSeekPrefixV103,
  reconstructSegmentWindowsV103,
  segmentContainsTargetV103,
  segmentSeekOffsetMsV103,
  timelineSegmentTimingContractV103,
} from "../agent/src/v103/timeline-segment-timing.js";

test("reconstrói janela real quando o GOP produz segmento maior que 3 segundos", () => {
  const runStartedAt = 1_780_000_000_000;
  const result = reconstructSegmentWindowsV103([
    {
      path: "/tmp/0.ts",
      name: `${runStartedAt}-000000.ts`,
      bytes: 100_000,
      modifiedAt: runStartedAt + 11_000,
      startedAt: runStartedAt + 8_000,
    },
    {
      path: "/tmp/1.ts",
      name: `${runStartedAt}-000001.ts`,
      bytes: 100_000,
      modifiedAt: runStartedAt + 19_000,
      startedAt: runStartedAt + 16_000,
    },
  ]);

  assert.equal(result[0]?.startedAt, runStartedAt);
  assert.equal(
    result[1]?.startedAt,
    runStartedAt + 11_000,
  );
});

test("segmento atual não vira evidência até existir sucessor do mesmo stream", () => {
  const runStartedAt = 1_780_000_000_000;
  const first = {
    path: "/tmp/0.ts",
    name: `${runStartedAt}-000000.ts`,
    bytes: 100_000,
    modifiedAt: runStartedAt + 3_000,
    startedAt: runStartedAt,
  };
  const second = {
    path: "/tmp/1.ts",
    name: `${runStartedAt}-000001.ts`,
    bytes: 100_000,
    modifiedAt: runStartedAt + 6_000,
    startedAt: runStartedAt + 3_000,
  };

  assert.deepEqual(
    closedSegmentsV103(
      [first, second],
      [first.name, second.name],
    ).map((segment) => segment.name),
    [first.name],
  );

  const thirdName = `${runStartedAt}-000002.ts`;
  assert.deepEqual(
    closedSegmentsV103(
      [first, second],
      [first.name, second.name, thirdName],
    ).map((segment) => segment.name),
    [first.name, second.name],
  );
});

test("novo processo FFmpeg confirma fechamento do último segmento do processo anterior", () => {
  const oldRun = 1_780_000_000_000;
  const newRun = oldRun + 60_000;
  const lastOld = {
    path: "/tmp/old.ts",
    name: `${oldRun}-000100.ts`,
    bytes: 100_000,
    modifiedAt: oldRun + 59_000,
    startedAt: oldRun + 56_000,
  };

  assert.equal(
    closedSegmentsV103(
      [lastOld],
      [lastOld.name, `${newRun}-000000.ts`],
    ).length,
    1,
  );
});

test("seek não é mais truncado em 2,95 s dentro de segmento longo", () => {
  const segment = {
    path: "/tmp/0.ts",
    name: "1780000000000-000000.ts",
    bytes: 100_000,
    startedAt: 1_780_000_000_000,
    modifiedAt: 1_780_000_011_000,
  };

  assert.equal(
    segmentSeekOffsetMsV103(
      segment,
      1_780_000_008_000,
    ),
    8_000,
  );
  assert.equal(
    segmentContainsTargetV103(
      segment,
      1_780_000_008_000,
    ),
    true,
  );
});

test("JPEG decodifica desde o começo do TS e tenta offsets anteriores se o FFmpeg sair sem arquivo", () => {
  const args = evidenceSeekPrefixV103(
    "/tmp/segment.ts",
    2_000,
  );

  assert.ok(args.indexOf("-i") < args.indexOf("-ss"));
  assert.deepEqual(
    evidenceSeekAttemptsV103(2_000),
    [2_000, 1_650, 1_100],
  );
  assert.deepEqual(
    evidenceSeekAttemptsV103(200),
    [200, 0],
  );
});

test("contrato da timeline 1.0.3 mantém GOP variável e JPEG somente após fechamento", () => {
  const contract =
    timelineSegmentTimingContractV103();

  assert.equal(contract.variableGopWindow, true);
  assert.equal(contract.longSegmentSeekPreserved, true);
  assert.equal(contract.closedSegmentGate, true);
  assert.equal(contract.decodeBeforeSeek, true);
  assert.ok(contract.jpegRetryAttempts >= 2);
  assert.ok(contract.extendedWaitMs >= 15_000);
});
