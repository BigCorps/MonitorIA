import assert from "node:assert/strict";
import test from "node:test";
import { planDeterministicallyV2 } from "../src/assistant/deterministic-v2";

const directory = {
  sites: [{ id: "11111111-1111-4111-8111-111111111111", name: "Loja Centro", timezone: "America/Sao_Paulo" }],
  cameras: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Entrada", siteId: "11111111-1111-4111-8111-111111111111", sourceKind: "live_camera" as const },
    { id: "33333333-3333-4333-8333-333333333333", name: "Estoque", siteId: "11111111-1111-4111-8111-111111111111", sourceKind: "live_camera" as const },
  ],
  zones: [{ id: "44444444-4444-4444-8444-444444444444", name: "Área Restrita", cameraId: "33333333-3333-4333-8333-333333333333", siteId: "11111111-1111-4111-8111-111111111111", zoneType: "restricted", description: "", personRoleHint: null }],
  visualEntities: [{ id: "55555555-5555-4555-8555-555555555555", name: "Portão principal", cameraId: "22222222-2222-4222-8222-222222222222", siteId: "11111111-1111-4111-8111-111111111111", entityType: "access_barrier", aliases: ["portão da frente"], enabled: true, reliability: "high" }],
  processes: [{ id: "66666666-6666-4666-8666-666666666666", name: "Fechamento da loja", processCode: "closing", cameraId: "22222222-2222-4222-8222-222222222222", siteId: "11111111-1111-4111-8111-111111111111", description: "", sessionType: "closing_procedure", aliases: [] }],
};

function plan(message: string, history: any[] = []) {
  return planDeterministicallyV2({ message, currentDate: "2026-10-01", timezone: "America/Sao_Paulo", selectedFrom: null, selectedTo: null, selectedCameraId: null, selectedSiteId: null, directory, history });
}

test("decompõe pergunta composta em várias operações", () => {
  const result = plan("Quantos clientes vieram ontem, qual câmera teve mais movimento e teve algo depois do fechamento?");
  const kinds = result.plan.operations.map((op) => `${op.kind}:${op.aggregation}:${op.metric}`);
  assert.ok(kinds.includes("period_summary:count:customers"));
  assert.ok(kinds.includes("period_summary:rank:events"));
  assert.ok(kinds.some((value) => value.startsWith("routine_deviation:")));
  assert.equal(result.plan.legacyPlan.fromDate, "2026-09-30");
});

test("saúde de ontem usa histórico, não estado atual", () => {
  const result = plan("A câmera Entrada ficou offline ontem?");
  assert.ok(result.plan.operations.some((op) => op.kind === "camera_health_history"));
  assert.ok(!result.plan.operations.some((op) => op.kind === "camera_health_current"));
});

test("zona configurada vira filtro estruturado", () => {
  const result = plan("Mostre os eventos da Área Restrita hoje");
  const search = result.plan.operations.find((op) => op.kind === "search_events");
  assert.equal(search?.zoneId, "44444444-4444-4444-8444-444444444444");
  assert.equal(search?.cameraId, "33333333-3333-4333-8333-333333333333");
});

test("entidade visual resolve aliases", () => {
  const result = plan("O portão da frente ficou aberto?");
  const visual = result.plan.operations.find((op) => op.kind === "visual_state");
  assert.equal(visual?.visualEntityId, "55555555-5555-4555-8555-555555555555");
});

test("direção entre duas câmeras é preservada", () => {
  const result = plan("Houve passagem da Entrada para o Estoque hoje?");
  const journey = result.plan.operations.find((op) => op.kind === "cross_camera_sequence");
  assert.equal(journey?.fromCameraId, "22222222-2222-4222-8222-222222222222");
  assert.equal(journey?.toCameraId, "33333333-3333-4333-8333-333333333333");
});

test("pergunta de prioridade usa resumo de atenção", () => {
  const result = plan("O que merece minha atenção agora?");
  assert.ok(result.plan.operations.some((op) => op.kind === "attention_summary"));
});
