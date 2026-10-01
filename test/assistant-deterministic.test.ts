import assert from "node:assert/strict";
import test from "node:test";
import {
  answerDeterministically,
  planDeterministically,
} from "../src/assistant/deterministic.js";

const directory = {
  sites: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Loja Centro", timezone: "America/Sao_Paulo" },
  ],
  cameras: [
    { id: "22222222-2222-4222-8222-222222222222", name: "Entrada", siteId: "11111111-1111-4111-8111-111111111111", sourceKind: "live_camera" as const },
    { id: "33333333-3333-4333-8333-333333333333", name: "Estoque", siteId: "11111111-1111-4111-8111-111111111111", sourceKind: "live_camera" as const },
    { id: "44444444-4444-4444-8444-444444444444", name: "Gravação Antiga", siteId: "11111111-1111-4111-8111-111111111111", sourceKind: "local_recording" as const },
  ],
};

function plan(message: string, history: Array<{ role: "user" | "assistant"; content: string }> = []) {
  return planDeterministically({
    message,
    currentDate: "2026-10-01",
    timezone: "America/Sao_Paulo",
    selectedFrom: null,
    selectedTo: null,
    selectedCameraId: null,
    selectedSiteId: null,
    directory,
    history,
  });
}

test("entende saúde da câmera sem LLM", () => {
  const result = plan("A câmera do estoque ficou offline?");
  assert.equal(result.understood, true);
  assert.equal(result.plan.intent, "camera_health");
  assert.equal(result.plan.cameraId, "33333333-3333-4333-8333-333333333333");
  assert.equal(result.plan.fromDate, "2026-10-01");
});

test("resolve ontem deterministicamente", () => {
  const result = plan("Houve atividade depois do fechamento ontem?");
  assert.equal(result.plan.intent, "routine_deviation");
  assert.equal(result.plan.fromDate, "2026-09-30");
  assert.equal(result.plan.toDate, "2026-09-30");
});

test("resolve semana atual e comparação anterior", () => {
  const result = plan("Compare esta semana com a anterior");
  assert.equal(result.plan.intent, "compare_periods");
  assert.equal(result.plan.fromDate, "2026-09-28");
  assert.equal(result.plan.toDate, "2026-10-01");
  assert.equal(result.plan.compareFromDate, "2026-09-21");
  assert.equal(result.plan.compareToDate, "2026-09-27");
});

test("transforma faixa horária em diretiva controlada", () => {
  const result = plan("Mostre os eventos da câmera do estoque entre 14h e 16h");
  assert.equal(result.plan.intent, "search_events");
  assert.match(result.plan.query, /@time=14:00-16:00/);
  assert.equal(result.plan.cameraId, "33333333-3333-4333-8333-333333333333");
});

test("eventos importantes usam diretiva controlada", () => {
  const result = plan("Mostre os eventos importantes de hoje");
  assert.equal(result.plan.intent, "search_events");
  assert.match(result.plan.query, /@important/);
});

test("ranking por câmera usa resumo do período", () => {
  const result = plan("Qual câmera teve mais eventos hoje?");
  assert.equal(result.plan.intent, "period_summary");
  assert.equal(result.understood, true);
});

test("reutiliza intenção da conversa e troca apenas período", () => {
  const result = plan("E ontem?", [
    { role: "user", content: "Qual câmera teve mais movimento hoje?" },
    { role: "assistant", content: "Entrada." },
  ]);
  assert.equal(result.plan.intent, "period_summary");
  assert.equal(result.plan.fromDate, "2026-09-30");
  assert.equal(result.plan.toDate, "2026-09-30");
});

test("não trata gravação histórica como câmera online", () => {
  const result = plan("A Gravação Antiga está offline agora?");
  assert.equal(result.plan.cameraId, "44444444-4444-4444-8444-444444444444");
  assert.notEqual(result.plan.intent, "camera_health");
});

test("pergunta desconhecida fica disponível para fallback", () => {
  const result = plan("Faça uma leitura semântica muito específica desta situação");
  assert.equal(result.understood, false);
  assert.ok(result.confidence < 0.74);
});

test("resposta de ranking é auditável e não exagera movimento", () => {
  const answer = answerDeterministically({
    message: "Qual câmera teve mais movimento hoje?",
    plan: plan("Qual câmera teve mais movimento hoje?").plan,
    retrievedData: {
      summary: {
        totalEvents: 17,
        byCamera: [
          { cameraId: "22222222-2222-4222-8222-222222222222", cameraName: "Entrada", events: 10 },
          { cameraId: "33333333-3333-4333-8333-333333333333", cameraName: "Estoque", events: 7 },
        ],
        evidence: [],
      },
      calibratedActivity: {},
    },
    allowedEvidenceIds: [],
  });

  assert.match(answer.answer, /Entrada/);
  assert.match(answer.answer, /10 de 17/);
  assert.match(answer.caution ?? "", /eventos registrados/);
});

test("resposta de saúde preserva inferência limitada", () => {
  const resultPlan = plan("Alguma câmera está escura?").plan;
  const answer = answerDeterministically({
    message: "Alguma câmera está escura?",
    plan: resultPlan,
    retrievedData: {
      cameraHealth: {
        summary: { cameras_enabled: 2 },
        cameras: [
          {
            camera_name: "Estoque",
            health_status: "degraded",
            active_incidents: [
              {
                type: "low_light",
                summary: "Luminosidade abaixo da faixa configurada.",
                consecutive_count: 7,
                last_observed_at: "2026-10-01T09:42:00-03:00",
              },
            ],
          },
        ],
      },
    },
    allowedEvidenceIds: [],
  });

  assert.match(answer.answer, /Estoque/);
  assert.match(answer.answer, /7 observações consecutivas/);
  assert.doesNotMatch(answer.answer.toLowerCase(), /sabotagem|intencao|intenção/);
});
