import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

import {
  createEvidenceGapTrackerV103,
} from "../agent/src/v103/evidence-gap.js";

const cameraId =
  "123e4567-e89b-42d3-a456-426614174010";
const eventId =
  "123e4567-e89b-42d3-a456-426614174000";

test("evento regular sem qualquer JPEG vira lacuna durável", async () => {
  const captured: any[] = [];
  const moments = [
    new Date(
      "2026-08-27T21:11:00.000Z",
    ),
    new Date(
      "2026-08-27T21:11:44.000Z",
    ),
  ];

  const tracker =
    createEvidenceGapTrackerV103({
      cameraId,
      cameraName: "Balcão",
      sessionId: null,
      timezone:
        "America/Sao_Paulo",
      operationalAccess: null,
      now: () =>
        moments.shift() ??
        new Date(
          "2026-08-27T21:11:44.000Z",
        ),
      record: async (gap) => {
        captured.push(gap);
        return true;
      },
      log: () => undefined,
    });

  tracker.observe(
    'Movimento iniciado em "Balcão": 2.00%.',
  );
  tracker.observe(
    `Evento local ${eventId} preservado sem envio porque nenhum quadro da timeline ficou disponível.`,
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 0),
  );

  assert.equal(
    captured.length,
    1,
  );
  assert.equal(
    captured[0].eventId,
    eventId,
  );
  assert.equal(
    captured[0].reason,
    "visual_evidence_unavailable",
  );
  assert.equal(
    captured[0].timePrecision,
    "detector_log_interval",
  );
  assert.equal(
    captured[0].startedAt,
    "2026-08-27T21:11:00.000Z",
  );
  assert.equal(
    captured[0].endedAt,
    "2026-08-27T21:11:44.000Z",
  );
});

test("gap estrutural fora do horário recebe prioridade crítica", async () => {
  const captured: any[] = [];
  const moments = [
    new Date(
      "2026-08-28T06:00:00.000Z",
    ),
    new Date(
      "2026-08-28T06:00:20.000Z",
    ),
  ];

  const tracker =
    createEvidenceGapTrackerV103({
      cameraId,
      cameraName: "Entrada",
      sessionId: null,
      timezone:
        "America/Sao_Paulo",
      operationalAccess: {
        enabled: true,
        openingTime: "09:00",
        closingTime: "18:00",
        timezone:
          "America/Sao_Paulo",
        polygon: null,
        markerName: "Portão",
        markerMinConfidence: 0.78,
      },
      now: () =>
        moments.shift() ??
        new Date(
          "2026-08-28T06:00:20.000Z",
        ),
      record: async (gap) => {
        captured.push(gap);
        return true;
      },
      log: () => undefined,
    });

  tracker.observe(
    'Mudança estrutural lenta iniciada em "Entrada": acumulada=5.00%, quadro-a-quadro=0.10%, foco=área operacional.',
  );
  tracker.observe(
    `Mudança estrutural ${eventId} ficou sem quadro utilizável e não será descartada silenciosamente; a ocorrência continuará registrada nos logs locais.`,
  );

  await new Promise((resolve) =>
    setTimeout(resolve, 0),
  );

  assert.equal(
    captured[0].priority,
    "critical",
  );
  assert.equal(
    captured[0].detector,
    "structural_motion",
  );
  assert.equal(
    captured[0].localMetrics
      .outsideDeclaredHours,
    true,
  );
});

test("backend possui endpoint sem imagens e migration idempotente", async () => {
  const endpoint = await readFile(
    new URL(
      "../app/api/agent/v103/cameras/[cameraId]/evidence-gaps/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20260827165000_camera_evidence_gaps_v103.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    endpoint,
    /camera_evidence_gaps/,
  );
  assert.match(
    endpoint,
    /agent_event_id/,
  );
  assert.doesNotMatch(
    endpoint,
    /imageBase64/,
  );

  assert.match(
    sql,
    /unique \(camera_id, agent_event_id\)/,
  );
  assert.match(
    sql,
    /enable row level security/,
  );
});
