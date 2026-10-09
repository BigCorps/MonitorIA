import assert from "node:assert/strict";
import test from "node:test";
import { recoverEmptySearch, sanitizeRecoveryTerms, shouldRecoverEmptySearch } from "../src/assistant/zero-result-recovery";
import {
  answerDeterministicallyV2,
  planDeterministicallyV2,
} from "../src/assistant/deterministic-v2";

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


test("entende período de 7 dias escrito em linguagem natural", () => {
  const result = plan("Consegue identificar movimento no período de 7 dias?");
  assert.equal(result.plan.legacyPlan.fromDate, "2026-09-25");
  assert.equal(result.plan.legacyPlan.toDate, "2026-10-01");
});

test("marca pedido de todo período disponível para resolução no backend", () => {
  const result = plan("Liste os eventos de todos os dias existentes");
  assert.ok(result.plan.plannerNotes.includes("period:available"));
});

test("criança vira filtro estruturado de faixa etária", () => {
  const result = plan("Quero ver crianças na câmera Entrada nos últimos 7 dias");
  const search = result.plan.operations.find(
    (op) => op.kind === "search_events" && op.apparentAgeGroup === "child",
  );
  assert.equal(search?.cameraId, "22222222-2222-4222-8222-222222222222");
  assert.equal(search?.apparentAgeGroup, "child");
  assert.equal(result.plan.legacyPlan.fromDate, "2026-09-25");
});


test("follow-up curto sobre crianças herda câmera e período anteriores", () => {
  const previousMessage =
    "Quero ver crianças na câmera Entrada nos últimos 7 dias";
  const previous = plan(previousMessage);

  const result = plan("Viu crianças?", [
    { role: "user", content: previousMessage },
    {
      role: "assistant",
      content: "Consulta concluída.",
      plan: previous.plan,
    },
  ]);

  const search = result.plan.operations.find(
    (op) => op.kind === "search_events" && op.apparentAgeGroup === "child",
  );

  assert.equal(
    search?.cameraId,
    "22222222-2222-4222-8222-222222222222",
  );
  assert.equal(result.plan.legacyPlan.fromDate, "2026-09-25");
  assert.equal(result.plan.legacyPlan.toDate, "2026-10-01");
});

test("adolescente isolado recebe limitação explícita sem virar criança", () => {
  const message =
    "Mostre adolescentes na câmera Entrada nos últimos 7 dias";
  const result = plan(message);

  assert.ok(
    result.plan.plannerNotes.includes(
      "adolescent:unsupported_separate_class",
    ),
  );
  assert.ok(
    !result.plan.operations.some(
      (op) => op.apparentAgeGroup === "child",
    ),
  );

  const answer = answerDeterministicallyV2({
    message,
    plan: result.plan,
    retrievedData: {
      operationResults: {},
      coverage: null,
    },
    allowedEvidenceIds: [],
  });

  assert.match(
    answer.answer,
    /não possui uma classe visual separada para adolescentes/i,
  );
  assert.match(
    answer.caution ?? "",
    /não determina idade exata/i,
  );
});

function planWithChildNamedZone(message: string) {
  return planDeterministicallyV2({
    message,
    currentDate: "2026-10-01",
    timezone: "America/Sao_Paulo",
    selectedFrom: null,
    selectedTo: null,
    selectedCameraId: null,
    selectedSiteId: null,
    directory: {
      ...directory,
      zones: [{
        ...directory.zones[0],
        id: "77777777-7777-4777-8777-777777777777",
        name: "Crianças",
        cameraId: "33333333-3333-4333-8333-333333333333",
      }],
    },
    history: [],
  });
}

test("palavra crianças não ativa automaticamente zona com o mesmo nome", () => {
  const result = planWithChildNamedZone(
    "Quero ver crianças na câmera Entrada nos últimos 7 dias",
  );
  const searches = result.plan.operations.filter((op) => op.kind === "search_events");
  assert.equal(searches.length, 1, "não adicionar consulta genérica sem filtro infantil");
  assert.equal(searches[0]?.apparentAgeGroup, "child");
  assert.equal(searches[0]?.zoneId, null);
  assert.equal(searches[0]?.cameraId, "22222222-2222-4222-8222-222222222222");
  assert.equal(result.plan.legacyPlan.fromDate, "2026-09-25");
});

test("zona chamada Crianças só é aplicada quando explicitamente solicitada", () => {
  const result = planWithChildNamedZone(
    "Mostre prováveis crianças na zona Crianças nos últimos 7 dias",
  );
  const searches = result.plan.operations.filter((op) => op.kind === "search_events");
  assert.equal(searches.length, 1);
  assert.equal(searches[0]?.apparentAgeGroup, "child");
  assert.equal(searches[0]?.zoneId, "77777777-7777-4777-8777-777777777777");
  assert.equal(searches[0]?.cameraId, "33333333-3333-4333-8333-333333333333");
});

test("pergunta sobre quantidade de crianças não mistura total não filtrado", () => {
  const result = planWithChildNamedZone(
    "Quantos eventos com crianças na câmera Entrada nos últimos 7 dias?",
  );
  assert.equal(result.plan.operations.filter((op) => op.kind === "search_events").length, 1);
  assert.equal(result.plan.operations.filter((op) => op.kind === "period_summary").length, 0);
  assert.equal(result.plan.operations[0]?.apparentAgeGroup, "child");
});

function emptyExecution(dataState = "READY") {
  return {
    retrievedData: { operationResults: { age_group: { total: 0, events: [] }, search: { total: 0, events: [] } }, coverage: { dataState } },
    candidateEvidenceIds: [],
    coverage: { dataState },
  };
}

test("segunda consulta só é permitida em busca vazia com cobertura", () => {
  const first = plan("Mostre crianças na câmera Entrada").plan;
  assert.equal(shouldRecoverEmptySearch(first, emptyExecution()), true);
  assert.equal(shouldRecoverEmptySearch(first, emptyExecution("NO_COVERAGE")), false);
  assert.equal(shouldRecoverEmptySearch(first, emptyExecution("FEATURE_DISABLED")), false);
  const found = emptyExecution();
  (found.retrievedData.operationResults as any).age_group.total = 1;
  assert.equal(shouldRecoverEmptySearch(first, found), false);
  assert.equal(shouldRecoverEmptySearch(plan("Quantos clientes vieram ontem?").plan, emptyExecution()), false);
});

test("termos de busca são curtos, únicos e não incluem diretivas", () => {
  assert.deepEqual(
    sanitizeRecoveryTerms([" crianças ", "crianças", "@important", "pessoa", "bebê"]),
    ["crianças", "bebê"],
  );
});

test("segunda consulta preserva câmera e datas na mesma execução", async () => {
  const original = plan("Quero ver crianças na câmera Entrada nos últimos 7 dias").plan;
  const seen: unknown[] = [];
  const eventId = "88888888-8888-4888-8888-888888888888";
  const result = await recoverEmptySearch({
    plan: original, execution: emptyExecution(), terms: ["crianças"],
    from: "2026-09-25T03:00:00Z", to: "2026-10-02T03:00:00Z",
    search: async (scope) => {
      seen.push(scope);
      return { total: 1, rows: [{ id: eventId, headline: "Criança atravessa a entrada", summary: "", tags: [] }] };
    },
  });
  assert.equal(result.kind, "textual");
  assert.deepEqual(seen, [{
    query: "crianças", from: "2026-09-25T03:00:00Z", to: "2026-10-02T03:00:00Z",
    cameraId: "22222222-2222-4222-8222-222222222222", siteId: "11111111-1111-4111-8111-111111111111",
    limit: original.legacyPlan.evidenceLimit,
  }]);
  assert.deepEqual(result.execution.candidateEvidenceIds, [eventId]);
  const op = original.operations[0];
  const recovered = (result.execution.retrievedData.operationResults as any)[op.id];
  assert.equal(recovered.recoveryMatchType, "text_only");
  const answer = answerDeterministicallyV2({
    message: "Quero ver crianças", plan: original,
    retrievedData: result.execution.retrievedData, allowedEvidenceIds: [eventId],
  });
  assert.match(answer.answer, /menção textual compatível/);
  assert.match(answer.answer, /sem confirmação de faixa etária/);
  assert.doesNotMatch(answer.answer, /com pelo menos uma classificação visual/);
});

test("não confunde texto de adulto com criança nem relaxa zona", async () => {
  const original = plan("Quero ver crianças na câmera Entrada").plan;
  const result = await recoverEmptySearch({
    plan: original, execution: emptyExecution(), terms: ["crianças"],
    from: "2026-09-25T03:00:00Z", to: "2026-10-02T03:00:00Z",
    search: async () => ({ total: 1, rows: [{ id: "88888888-8888-4888-8888-888888888888", headline: "Adulto caminha na entrada", tags: [] }] }),
  });
  assert.equal(result.kind, "none");
  assert.equal(result.execution.candidateEvidenceIds.length, 0);
  const zoned = plan("Mostre os eventos da Área Restrita hoje").plan;
  assert.equal(shouldRecoverEmptySearch(zoned, emptyExecution()), false);
});

test("busca textual genérica recupera evidências sem segundo balão", async () => {
  const original = plan("Mostre as entregas na Entrada hoje").plan;
  // Não executa caso o interpretador tenha escolhido operação de resumo em vez de pesquisa.
  if (original.operations.length !== 1 || original.operations[0].kind !== "search_events") return;
  const op = original.operations[0];
  const execution = {
    ...emptyExecution(),
    retrievedData: { operationResults: { [op.id]: { total: 0, events: [] } }, coverage: { dataState: "READY" } },
  };
  const result = await recoverEmptySearch({
    plan: original, execution, terms: ["encomenda"],
    from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z",
    search: async () => ({ total: 1, rows: [{ id: "88888888-8888-4888-8888-888888888888", headline: "Pacote recebido" }] }),
  });
  assert.equal(result.kind, "lexical");
});
