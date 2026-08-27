import assert from "node:assert/strict";
import test from "node:test";

import type {
  LocalMotionEvent,
} from "../agent/src/types.js";
import {
  classifyEventPriorityV103,
  prioritizeEventV103,
} from "../agent/src/v103/event-priority.js";
import {
  prioritizeClaimedEntriesV103,
} from "../agent/src/v103/priority-queue.js";
import {
  storageHealthV103,
} from "../agent/src/v103/storage-health.js";
import {
  v103BudgetForFrameCount,
} from "../agent/src/v103/essential-evidence.js";

function event(
  id: string,
  cameraId: string,
  metrics: Record<string, unknown>,
): LocalMotionEvent {
  return {
    eventId: id,
    cameraId,
    cameraName: cameraId,
    sessionId: null,
    startedAt:
      "2026-08-27T12:00:00.000Z",
    endedAt:
      "2026-08-27T12:00:10.000Z",
    localMetrics: {
      planCode: "standard",
      peakMotionPercent: 2,
      meanMotionPercent: 1,
      durationSeconds: 10,
      framesObserved: 10,
      closeReason: "motion_stopped",
      ...metrics,
    } as any,
    frames: [
      {
        label: "start",
        frame: {
          path: "/tmp/start.jpg",
          width: 1280,
          height: 720,
          byteSize: 10_000,
          capturedAt:
            "2026-08-27T12:00:00.000Z",
        },
      },
      {
        label: "peak",
        frame: {
          path: "/tmp/peak.jpg",
          width: 1280,
          height: 720,
          byteSize: 10_000,
          capturedAt:
            "2026-08-27T12:00:05.000Z",
        },
      },
      {
        label: "end",
        frame: {
          path: "/tmp/end.jpg",
          width: 1280,
          height: 720,
          byteSize: 10_000,
          capturedAt:
            "2026-08-27T12:00:10.000Z",
        },
      },
    ],
  };
}

test("atividade operacional fora do horário vira crítica", () => {
  const source = event(
    "123e4567-e89b-42d3-a456-426614174000",
    "123e4567-e89b-42d3-a456-426614174010",
    {
      operationalAccessEnabled: true,
      outsideDeclaredHours: true,
    },
  );

  assert.equal(
    classifyEventPriorityV103(source),
    "critical",
  );

  const prioritized =
    prioritizeEventV103(source);

  assert.deepEqual(
    (prioritized.localMetrics as any)
      .evidenceRequiredLabelsV103,
    ["start", "peak", "end"],
  );
  assert.equal(
    (prioritized.localMetrics as any)
      .operationalSecurityContextV103,
    "outside_hours_activity",
  );
});

test("movimento estrutural operacional também recebe prioridade crítica", () => {
  const source = event(
    "123e4567-e89b-42d3-a456-426614174001",
    "123e4567-e89b-42d3-a456-426614174010",
    {
      operationalAccessEnabled: true,
      structuralMotionV103: true,
    },
  );

  assert.equal(
    classifyEventPriorityV103(source),
    "critical",
  );
});

test("fila pronta escolhe crítico antes de rotina mantendo fairness por câmera", () => {
  const normal = event(
    "123e4567-e89b-42d3-a456-426614174002",
    "123e4567-e89b-42d3-a456-426614174010",
    {},
  );
  const criticalA =
    prioritizeEventV103(
      event(
        "123e4567-e89b-42d3-a456-426614174003",
        "123e4567-e89b-42d3-a456-426614174010",
        {
          operationalAccessEnabled: true,
          outsideDeclaredHours: true,
        },
      ),
    );
  const criticalB =
    prioritizeEventV103(
      event(
        "123e4567-e89b-42d3-a456-426614174004",
        "123e4567-e89b-42d3-a456-426614174011",
        {
          operationalAccessEnabled: true,
          outsideDeclaredHours: true,
        },
      ),
    );

  const claimed: any[] = [
    {
      id: normal.eventId,
      event: normal,
      attempts: 0,
      createdAt:
        "2026-08-27T12:00:00.000Z",
      nextAttemptAt:
        "2026-08-27T12:00:00.000Z",
      lastError: null,
    },
    {
      id: criticalA.eventId,
      event: criticalA,
      attempts: 0,
      createdAt:
        "2026-08-27T12:00:02.000Z",
      nextAttemptAt:
        "2026-08-27T12:00:02.000Z",
      lastError: null,
    },
    {
      id: criticalB.eventId,
      event: criticalB,
      attempts: 0,
      createdAt:
        "2026-08-27T12:00:03.000Z",
      nextAttemptAt:
        "2026-08-27T12:00:03.000Z",
      lastError: null,
    },
  ];

  const selected =
    prioritizeClaimedEntriesV103(
      claimed,
      2,
    );

  assert.equal(selected.length, 2);
  assert.equal(
    (selected[0]!.event.localMetrics as any)
      .evidencePriorityV103,
    "critical",
  );
  assert.equal(
    (selected[1]!.event.localMetrics as any)
      .evidencePriorityV103,
    "critical",
  );
  assert.notEqual(
    selected[0]!.event.cameraId,
    selected[1]!.event.cameraId,
  );
});

test("orçamento reserva espaço para todos os quadros principais", () => {
  assert.equal(
    v103BudgetForFrameCount(3),
    900_000,
  );
  assert.equal(
    v103BudgetForFrameCount(4),
    675_000,
  );
});

test("telemetria de disco distingue atenção e suspensão", () => {
  const gb = 1024 ** 3;

  assert.equal(
    storageHealthV103(
      12 * gb,
      2 * gb,
    ).level,
    "normal",
  );
  assert.equal(
    storageHealthV103(
      8 * gb,
      1 * gb,
    ).level,
    "attention",
  );
  assert.equal(
    storageHealthV103(
      5 * gb,
      512 * 1024 ** 2,
    ).level,
    "warning",
  );

  const critical =
    storageHealthV103(
      3 * gb,
      0,
    );
  assert.equal(
    critical.level,
    "critical",
  );
  assert.equal(
    critical.videoCaptureSuspended,
    true,
  );
});
