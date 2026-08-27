import assert from "node:assert/strict";
import test from "node:test";

import type {
  LocalMotionEvent,
} from "../agent/src/types.js";
import {
  canonicalizeEventEvidenceV103,
  evidenceWindowContractV103,
} from "../agent/src/v103/evidence-coherence.js";

function frame(
  label: "start" | "peak" | "extra" | "end",
  capturedAt: string,
) {
  const segmentStart = new Date(
    new Date(capturedAt).getTime() - 1_000,
  ).toISOString();

  return {
    label,
    frame: {
      path: `/tmp/${label}.jpg`,
      width: 1280,
      height: 720,
      byteSize: 10_000,
      capturedAt,
      timeline: {
        source: "rtsp_timeline",
        segmentId: `${label}.ts`,
        segmentStartedAt: segmentStart,
        sourceTimestamp: capturedAt,
        offsetMs: 1_000,
        contentSha256:
          "0".repeat(64),
      },
    },
  };
}

function event(
  startedAt: string,
  endedAt: string,
  frames: ReturnType<typeof frame>[],
): LocalMotionEvent {
  return {
    eventId:
      "123e4567-e89b-42d3-a456-426614174000",
    cameraId:
      "123e4567-e89b-42d3-a456-426614174001",
    cameraName: "Teste",
    sessionId: null,
    startedAt,
    endedAt,
    localMetrics: {
      planCode: "intensive",
      peakMotionPercent: 2,
      meanMotionPercent: 1,
      rawPeakMotionPercent: 2,
      durationSeconds: 10,
      framesObserved: 10,
      configuredStartThreshold: 0.5,
      configuredContinueThreshold: 0.25,
      effectiveStartThreshold: 0.5,
      effectiveContinueThreshold: 0.25,
      noiseP50Percent: 0,
      noiseP90Percent: 0,
      noiseP95Percent: 0,
      ignoredPixelPercent: 0,
      autoIgnoredCellCount: 0,
      startConsecutiveFrames: 2,
      endConsecutiveFrames: 2,
      cooldownSeconds: 0,
      chapterMinimumSeconds: 60,
      chapterMaximumSeconds: 240,
      regionShiftThreshold: 0.28,
      dominantRegion: null,
      motionCentroidX: null,
      motionCentroidY: null,
      motionRegionCount: 1,
      motionSpreadPercent: 0,
      motionDensityPercent: 0,
      startMeanLuma: 80,
      maxDirectionalChangeRatio: 0,
      suppressedCameraNoiseSamples: 0,
      closeReason: "motion_stopped",
    },
    frames,
  };
}

test("todos os JPEGs ficam dentro do intervalo canônico do mesmo vídeo", () => {
  const source = event(
    "2026-08-27T21:11:00.000Z",
    "2026-08-27T21:11:40.000Z",
    [
      frame(
        "start",
        "2026-08-27T21:11:00.000Z",
      ),
      frame(
        "peak",
        "2026-08-27T21:11:11.000Z",
      ),
      frame(
        "end",
        "2026-08-27T21:11:44.000Z",
      ),
    ],
  );

  const result =
    canonicalizeEventEvidenceV103(source);

  assert.equal(
    result.endedAt,
    "2026-08-27T21:11:44.000Z",
  );
  assert.equal(
    evidenceWindowContractV103(
      result,
    ).valid,
    true,
  );

  assert.deepEqual(
    (
      result.localMetrics as any
    ).evidenceFrameOffsetsSeconds,
    {
      start: 0,
      peak: 11,
      end: 44,
    },
  );
});

test("frame muito distante não estica um acontecimento para outro período", () => {
  const source = event(
    "2026-08-27T21:11:00.000Z",
    "2026-08-27T21:11:40.000Z",
    [
      frame(
        "start",
        "2026-08-27T21:11:00.000Z",
      ),
      frame(
        "peak",
        "2026-08-27T21:11:10.000Z",
      ),
      frame(
        "end",
        "2026-08-27T21:20:00.000Z",
      ),
    ],
  );

  const result =
    canonicalizeEventEvidenceV103(source);

  assert.equal(
    result.endedAt,
    "2026-08-27T21:11:40.000Z",
  );
  assert.equal(
    result.frames.some(
      (item) => item.label === "end",
    ),
    false,
  );
  assert.deepEqual(
    (
      result.localMetrics as any
    ).evidenceDroppedOutOfWindowLabels,
    ["end"],
  );
});

test("evidência RTSP coerente é registrada no diagnóstico", () => {
  const result =
    canonicalizeEventEvidenceV103(
      event(
        "2026-08-27T12:00:00.000Z",
        "2026-08-27T12:00:10.000Z",
        [
          frame(
            "start",
            "2026-08-27T12:00:00.000Z",
          ),
          frame(
            "end",
            "2026-08-27T12:00:10.000Z",
          ),
        ],
      ),
    );

  assert.equal(
    (
      result.localMetrics as any
    ).evidenceTimelineCoherent,
    true,
  );
  assert.equal(
    (
      result.localMetrics as any
    ).evidenceFrameWindowValid,
    true,
  );
});

test("não perde todo o acontecimento por pequena diferença de relógio", () => {
  const result =
    canonicalizeEventEvidenceV103(
      event(
        "2026-08-27T12:00:00.000Z",
        "2026-08-27T12:00:10.000Z",
        [
          frame(
            "peak",
            "2026-08-27T12:00:13.000Z",
          ),
        ],
      ),
    );

  assert.equal(
    result.endedAt,
    "2026-08-27T12:00:13.000Z",
  );
  assert.equal(
    result.frames.length,
    1,
  );
  assert.equal(
    evidenceWindowContractV103(
      result,
    ).valid,
    true,
  );
});
