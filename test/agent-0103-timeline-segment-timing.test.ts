import assert from "node:assert/strict";
import test from "node:test";

import {
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

test("contrato da timeline 1.0.3 mantém espera estendida e GOP variável", () => {
  const contract =
    timelineSegmentTimingContractV103();

  assert.equal(
    contract.variableGopWindow,
    true,
  );
  assert.equal(
    contract.longSegmentSeekPreserved,
    true,
  );
  assert.ok(
    contract.extendedWaitMs >= 15_000,
  );
});
