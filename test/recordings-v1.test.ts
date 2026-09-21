import assert from "node:assert/strict";
import test from "node:test";
import {
  RecordingEventDetector,
} from "../src/recordings/browser-detector";
import type {
  RecordingCameraConfig,
  RecordingCandidate,
} from "../src/recordings/types";

const WIDTH = 160;
const HEIGHT = 90;

function frame(fill = 0) {
  return new Uint8Array(WIDTH * HEIGHT).fill(fill);
}

function localized(value: number) {
  const result = frame(0);
  for (let y = 30; y < 60; y += 1) {
    for (let x = 60; x < 100; x += 1) {
      result[y * WIDTH + x] = value;
    }
  }
  return result;
}

const config: RecordingCameraConfig = {
  cameraId: "00000000-0000-4000-8000-000000000001",
  cameraName: "Gravação teste",
  siteName: "Loja",
  sourceKind: "local_recording",
  planCode: "standard",
  timezone: "America/Sao_Paulo",
  captureIntervalSeconds: 1,
  consolidationIntervalSeconds: 10,
  motionStartThreshold: 1.25,
  motionContinueThreshold: 0.6,
  eventCloseAfterSeconds: 20,
  motionAdaptiveEnabled: false,
  motionOverlayMask: "none",
  motionStartConsecutiveFrames: 3,
  motionEndConsecutiveFrames: 6,
  motionCooldownSeconds: 10,
  monitoringSchedule: { mode: "always" },
  motionIgnorePolygons: [],
  maximumAnalysisFrames: 3,
  clipEnabled: false,
  clipDurationSeconds: null,
  clipRetentionDays: null,
  entitlement: {
    accessSource: "subscription",
    monitoringAllowed: true,
    periodStartsAt: null,
    periodEndsAt: null,
    reason: "active_subscription",
  },
};

function at(base: Date, seconds: number) {
  return new Date(base.getTime() + seconds * 1000).toISOString();
}

test("gravações usam a mesma segmentação determinística de movimento", () => {
  const base = new Date("2026-09-19T12:00:00.000Z");
  const detector = new RecordingEventDetector(config, base);
  const closed: RecordingCandidate[] = [];

  detector.observe({ luma: frame(0), offsetSeconds: 0, capturedAt: at(base, 0) });
  detector.observe({ luma: localized(255), offsetSeconds: 1, capturedAt: at(base, 1) });
  detector.observe({ luma: localized(0), offsetSeconds: 2, capturedAt: at(base, 2) });
  detector.observe({ luma: localized(255), offsetSeconds: 3, capturedAt: at(base, 3) });
  detector.observe({ luma: localized(0), offsetSeconds: 4, capturedAt: at(base, 4) });

  for (let second = 5; second <= 30; second += 1) {
    const step = detector.observe({
      luma: localized(0),
      offsetSeconds: second,
      capturedAt: at(base, second),
    });
    closed.push(...step.closed);
  }

  assert.equal(closed.length, 1);
  assert.equal(closed[0]?.localMetrics.sourceKind, "local_recording");
  assert.equal(closed[0]?.localMetrics.planCode, "standard");
  assert.ok(Number(closed[0]?.localMetrics.framesObserved ?? 0) >= 1);
  assert.ok((closed[0]?.evidence.length ?? 0) >= 1);
});

test("mudança global uniforme de iluminação não vira acontecimento", () => {
  const base = new Date("2026-09-19T12:00:00.000Z");
  const detector = new RecordingEventDetector(config, base);

  detector.observe({ luma: frame(20), offsetSeconds: 0, capturedAt: at(base, 0) });

  let events = 0;
  for (let second = 1; second <= 12; second += 1) {
    const value = second % 2 ? 90 : 20;
    const step = detector.observe({
      luma: frame(value),
      offsetSeconds: second,
      capturedAt: at(base, second),
    });
    events += step.closed.length;
  }

  events += detector.finish().closed.length;
  assert.equal(events, 0);
});

test("plano Essencial mantém no máximo uma evidência por acontecimento", () => {
  const base = new Date("2026-09-19T12:00:00.000Z");
  const detector = new RecordingEventDetector(
    { ...config, planCode: "basic", maximumAnalysisFrames: 1 },
    base,
  );

  detector.observe({ luma: frame(0), offsetSeconds: 0, capturedAt: at(base, 0) });
  detector.observe({ luma: localized(255), offsetSeconds: 1, capturedAt: at(base, 1) });
  detector.observe({ luma: localized(0), offsetSeconds: 2, capturedAt: at(base, 2) });
  detector.observe({ luma: localized(255), offsetSeconds: 3, capturedAt: at(base, 3) });
  detector.observe({ luma: localized(0), offsetSeconds: 4, capturedAt: at(base, 4) });

  const final = detector.finish();
  assert.equal(final.closed.length, 1);
  assert.equal(final.closed[0]?.evidence.length, 1);
});


// RC3 SQL invariants — Gravações
import rc3Test from "node:test";
import rc3Assert from "node:assert/strict";
import { readFileSync as rc3ReadFileSync } from "node:fs";

const rc3RecordingMigration = rc3ReadFileSync(
  "supabase/migrations/20260920234205_recordings_v1.sql",
  "utf8",
);

rc3Test(
  "gravação local valida recording_session antes do early return legado",
  () => {
    const functionStart = rc3RecordingMigration.indexOf(
      "create or replace function private.enforce_monitoria_analysis_entitlement()",
    );

    const recordingGate = rc3RecordingMigration.indexOf(
      "if new.recording_session_id is not null then",
      functionStart,
    );

    const legacyEarlyReturn = rc3RecordingMigration.indexOf(
      "if new.source_agent_id is null and new.agent_event_id is null then",
      functionStart,
    );

    rc3Assert.ok(functionStart >= 0);
    rc3Assert.ok(recordingGate >= 0);
    rc3Assert.ok(legacyEarlyReturn >= 0);
    rc3Assert.ok(recordingGate < legacyEarlyReturn);
  },
);

rc3Test(
  "quota usa reserva enquanto ativa e duração processada depois",
  () => {
    rc3Assert.doesNotMatch(
      rc3RecordingMigration,
      /sum\(session\.reserved_seconds\)/,
    );

    rc3Assert.match(
      rc3RecordingMigration,
      /when session\.status in \('reserved', 'processing'\)[\s\S]*?then session\.reserved_seconds[\s\S]*?else session\.processed_seconds/,
    );

    rc3Assert.match(
      rc3RecordingMigration,
      /processed_seconds integer not null default 0 check \(processed_seconds between 0 and reserved_seconds\)/,
    );
  },
);


// RC4 quota invariants — Gravações
const rc4SessionRoute = rc3ReadFileSync(
  "app/api/recordings/sessions/[sessionId]/route.ts",
  "utf8",
);

const rc4RecordingSource = rc3ReadFileSync(
  "src/lib/recording-source.ts",
  "utf8",
);

rc3Test(
  "reserva grava a duração já mapeada como processed_seconds",
  () => {
    rc3Assert.match(
      rc3RecordingMigration,
      /quota_limit_seconds,\s+reserved_seconds,\s+processed_seconds,\s+browser_metadata/,
    );

    rc3Assert.match(
      rc3RecordingMigration,
      /v_limit,\s+p_duration_seconds,\s+p_duration_seconds,\s+coalesce\(p_browser_metadata/,
    );
  },
);

rc3Test(
  "finalização da sessão não sobrescreve processed_seconds com a reserva",
  () => {
    rc3Assert.doesNotMatch(
      rc4SessionRoute,
      /processed_seconds[\s\S]{0,80}authorized\.session\.reserved_seconds/,
    );

    rc3Assert.doesNotMatch(
      rc4SessionRoute,
      /Number\(authorized\.session\.reserved_seconds\)/,
    );
  },
);

rc3Test(
  "dashboard usa reserva para sessões ativas e processado para terminais",
  () => {
    rc3Assert.match(
      rc4RecordingSource,
      /\.select\("status,reserved_seconds,processed_seconds"\)/,
    );

    rc3Assert.match(
      rc4RecordingSource,
      /\["reserved", "processing"\]\.includes/,
    );

    rc3Assert.match(
      rc4RecordingSource,
      /active[\s\S]*?session\.reserved_seconds[\s\S]*?session\.processed_seconds/,
    );
  },
);


// RC5 concurrent retry invariant — Gravações
rc3Test(
  "request_key é serializado antes da consulta de duplicata",
  () => {
    const functionStart = rc3RecordingMigration.indexOf(
      "create or replace function public.reserve_monitoria_recording_session(",
    );

    const requestLock = rc3RecordingMigration.indexOf(
      ":recording-request:",
      functionStart,
    );

    const duplicateLookup = rc3RecordingMigration.indexOf(
      "into v_existing",
      functionStart,
    );

    rc3Assert.ok(functionStart >= 0);
    rc3Assert.ok(requestLock >= 0);
    rc3Assert.ok(duplicateLookup >= 0);
    rc3Assert.ok(requestLock < duplicateLookup);
  },
);


// RC6 UX + trial readiness regressions — Gravações
const recordingTrialRoute = rc3ReadFileSync(
  "app/api/recordings/trial/route.ts",
  "utf8",
);

const recordingsClientUi = rc3ReadFileSync(
  "app/dashboard/recordings/recordings-client.tsx",
  "utf8",
);

const recordingsPageUi = rc3ReadFileSync(
  "app/dashboard/recordings/page.tsx",
  "utf8",
);

const firstRunUi = rc3ReadFileSync(
  "app/dashboard/first-run-setup.tsx",
  "utf8",
);

const installerUi = rc3ReadFileSync(
  "src/components/installer-platform-actions.tsx",
  "utf8",
);

const pairingUi = rc3ReadFileSync(
  "app/dashboard/site-pairing-code.tsx",
  "utf8",
);

rc3Test(
  "trial de gravação aceita readiness aninhado retornado pelo banco",
  () => {
    rc3Assert.match(
      recordingTrialRoute,
      /preparedValue\?\.readiness\?\.ready === true/,
    );

    rc3Assert.match(
      recordingTrialRoute,
      /preparedValue\?\.status === "ready"/,
    );

    rc3Assert.doesNotMatch(
      recordingTrialRoute,
      /if \(!preparedValue\?\.ready\)/,
    );
  },
);

rc3Test(
  "onboarding oferece teste com gravação antes da configuração das câmeras",
  () => {
    const recordingCta =
      firstRunUi.indexOf("Teste agora com uma gravação");

    const cameraSetup =
      firstRunUi.indexOf("connectGrid");

    rc3Assert.ok(recordingCta >= 0);
    rc3Assert.ok(cameraSetup >= 0);
    rc3Assert.ok(recordingCta < cameraSetup);
    rc3Assert.match(
      firstRunUi,
      /Testar com uma gravação/,
    );
  },
);

rc3Test(
  "interface de gravações usa linguagem de cliente e esconde termos internos",
  () => {
    rc3Assert.match(
      recordingsPageUi,
      /Teste o MonitorIA com uma gravação/,
    );

    rc3Assert.match(
      recordingsClientUi,
      /Não foi possível concluir agora/,
    );

    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /Vídeo pronto para processamento local pelo navegador/,
    );

    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /Vídeo reconhecido pelo modo de compatibilidade local/,
    );

    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /candidato\(s\) local\(is\)/,
    );

    rc3Assert.doesNotMatch(
      installerUi,
      /O Agent deve ser instalado/,
    );

    rc3Assert.doesNotMatch(
      pairingUi,
      /Gerar código de pareamento/,
    );
  },
);


// RC7 trial 24h + result persistence regressions — Gravações
const trial24Migration = rc3ReadFileSync(
  "supabase/migrations/20260921004311_recordings_trial_24h.sql",
  "utf8",
);

const recordingPageRc7 = rc3ReadFileSync(
  "app/dashboard/recordings/page.tsx",
  "utf8",
);

const eventPageRc7 = rc3ReadFileSync(
  "app/dashboard/events/[eventId]/page.tsx",
  "utf8",
);

rc3Test(
  "trial por gravação usa 24 horas em todas as camadas",
  () => {
    rc3Assert.match(
      recordingTrialRoute,
      /recordingLimitSeconds: 86_400/,
    );

    rc3Assert.match(
      rc4RecordingSource,
      /accessSource === "trial"[\s\S]*?\? 86_400/,
    );

    rc3Assert.match(
      recordingsClientUi,
      /TRIAL_RECORDING_LIMIT_SECONDS = 86_400/,
    );

    rc3Assert.match(
      trial24Migration,
      /v_limit := 86400/,
    );

    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /10 minutos/,
    );
  },
);

rc3Test(
  "confirmação do ambiente não exibe campos técnicos gerados",
  () => {
    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /profileDraft\.monitoringGoals/,
    );

    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /profileDraft\.zones\?\.map/,
    );

    rc3Assert.match(
      recordingsClientUi,
      /O MonitorIA reconheceu o local desta gravação/,
    );
  },
);

rc3Test(
  "resultados parciais ficam em carregamento até a análise terminar",
  () => {
    const pending = recordingsClientUi.indexOf(
      "sessionResult.pending",
    );

    const empty = recordingsClientUi.indexOf(
      "Não encontramos acontecimentos relevantes nesse trecho.",
    );

    rc3Assert.ok(pending >= 0);
    rc3Assert.ok(empty >= 0);
    rc3Assert.ok(pending < empty);

    rc3Assert.match(
      recordingsClientUi,
      /Analisando seus acontecimentos/,
    );
  },
);

rc3Test(
  "análise fica persistida na URL e pode ser restaurada",
  () => {
    rc3Assert.match(
      recordingsClientUi,
      /searchParams\.set\("session", sessionId\)/,
    );

    rc3Assert.match(
      recordingPageRc7,
      /initialSessionId=\{first\(params\.session\)\}/,
    );

    rc3Assert.match(
      recordingsClientUi,
      /Recuperando sua análise/,
    );
  },
);

rc3Test(
  "acontecimento aberto por gravação volta para a mesma análise",
  () => {
    rc3Assert.match(
      recordingsClientUi,
      /recordingSession=/,
    );

    rc3Assert.match(
      eventPageRc7,
      /recordingSource/,
    );

    rc3Assert.match(
      eventPageRc7,
      /recordingSession/,
    );

    rc3Assert.match(
      eventPageRc7,
      /Voltar à gravação/,
    );
  },
);

rc3Test(
  "progresso do motor não é mostrado diretamente ao cliente",
  () => {
    rc3Assert.doesNotMatch(
      recordingsClientUi,
      /setStatus\(message\)/,
    );

    rc3Assert.match(
      recordingsClientUi,
      /onProgress: \(value, _message\)/,
    );
  },
);
