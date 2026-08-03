import assert from "node:assert/strict";
import test from "node:test";
import {
  effectiveTrialStatus,
  formatCountdown,
  readinessItems,
  readinessReasonLabel,
  secondsUntil,
  trialStatusLabel,
} from "../src/trial/status.js";

const readiness = {
  ready: false,
  cameraFound: true,
  cameraId: "camera",
  cameraName: "Entrada",
  cameraOnline: true,
  cameraPaired: true,
  activeProfile: true,
  activeProfileId: "profile",
  agentCameraEnabled: true,
  agentId: "agent",
  agentName: "Agent Windows",
  agentOnline: true,
  agentHeartbeatRecent: false,
  lastHeartbeatAt: null,
  reasons: ["agent_heartbeat_stale"],
  checkedAt: null,
};

test("formata contagem regressiva de 24 horas", () => {
  assert.equal(formatCountdown(86_400), "1d 00h 00min");
  assert.equal(formatCountdown(3_661), "01:01:01");
});

test("não retorna segundos negativos", () => {
  const target = new Date(1_000).toISOString();
  assert.equal(secondsUntil(target, 2_000), 0);
});

test("prontidão exige heartbeat recente", () => {
  const items = readinessItems(readiness);
  assert.equal(items.length, 5);
  assert.equal(items.at(-1)?.complete, false);
  assert.match(
    readinessReasonLabel("agent_heartbeat_stale"),
    /Inicie-o novamente/,
  );
});

test("expõe os rótulos comerciais do ciclo", () => {
  assert.equal(trialStatusLabel("running"), "Análise em andamento");
  assert.equal(trialStatusLabel("exploration"), "Período de exploração");
  assert.equal(trialStatusLabel("converted"), "Serviço contratado");
});


test("muda a interface para exploração sem esperar o cron", () => {
  const now = Date.parse("2026-08-01T12:00:00Z");
  assert.equal(
    effectiveTrialStatus(
      {
        status: "running",
        captureEndsAt: "2026-08-01T11:59:00Z",
        explorationEndsAt: "2026-08-08T12:00:00Z",
      },
      now,
    ),
    "exploration",
  );
});

test("encerra a exploração pela data mesmo antes do cron", () => {
  const now = Date.parse("2026-08-08T12:01:00Z");
  assert.equal(
    effectiveTrialStatus(
      {
        status: "exploration",
        captureEndsAt: "2026-08-01T12:00:00Z",
        explorationEndsAt: "2026-08-08T12:00:00Z",
      },
      now,
    ),
    "expired",
  );
});
