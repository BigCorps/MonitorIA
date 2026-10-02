import assert from "node:assert/strict";
import test from "node:test";
import { deriveCameraProductState } from "../src/camera/product-state.js";

const base = {
  id: "camera-1",
  name: "Geral Rampa",
  siteId: "site-1",
  siteName: "Posto",
  sourceKind: "live_camera" as const,
  cameraOnline: true,
  cameraPaired: true,
  imageReceived: true,
  planReady: true,
  planCode: "intensive",
  profileReady: true,
  agentMapped: true,
  agentEnabled: true,
  agentOnline: true,
  agentHeartbeatRecent: true,
  monitorActive: true,
  pipelineIssue: false,
  visualHealthStatus: "healthy",
  latestAnalysisAt: "2026-10-02T18:00:00.000Z",
  latestImageAt: "2026-10-02T18:00:00.000Z",
};

test("online sem perfil não é mostrado como pronto", () => {
  const state = deriveCameraProductState({ ...base, profileReady: false });
  assert.equal(state.status, "needs_configuration");
  assert.equal(state.label, "Precisa concluir configuração");
  assert.match(state.description, /perfil inteligente/i);
  assert.equal(state.action.label, "Concluir configuração");
});

test("câmera completa com sessão ativa aparece como Monitorando", () => {
  const state = deriveCameraProductState(base);
  assert.equal(state.status, "monitoring");
  assert.equal(state.label, "Monitorando");
  assert.equal(state.remainingSteps, 0);
});

test("perfil e plano prontos sem monitor ativo pedem ativação", () => {
  const state = deriveCameraProductState({ ...base, monitorActive: false });
  assert.equal(state.status, "ready_to_monitor");
  assert.equal(state.label, "Pronta para monitorar");
});

test("pipeline com sinal forte de falha vira Atenção necessária", () => {
  const state = deriveCameraProductState({ ...base, pipelineIssue: true });
  assert.equal(state.status, "attention_required");
  assert.equal(state.label, "Atenção necessária");
  assert.equal(state.action.label, "Ver diagnóstico");
});

test("computador sem heartbeat recente vira Offline", () => {
  const state = deriveCameraProductState({
    ...base,
    agentHeartbeatRecent: false,
  });
  assert.equal(state.status, "offline");
  assert.equal(state.label, "Offline");
});

test("gravação local não exige computador para ficar pronta", () => {
  const state = deriveCameraProductState({
    ...base,
    sourceKind: "local_recording",
    cameraOnline: false,
    cameraPaired: false,
    agentMapped: false,
    agentEnabled: false,
    agentOnline: false,
    agentHeartbeatRecent: false,
    monitorActive: false,
  });
  assert.equal(state.status, "ready_to_monitor");
  assert.equal(state.label, "Pronta para analisar");
  assert.equal(state.checklist.find((item) => item.key === "agent")?.applicable, false);
});
