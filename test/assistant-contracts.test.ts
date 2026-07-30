import assert from "node:assert/strict";
import test from "node:test";
import {
  AssistantAnswerSchema,
  AssistantPlanSchema,
} from "../src/assistant/contracts.js";

test("aceita plano de resumo do período", () => {
  const plan = AssistantPlanSchema.parse({
    intent: "period_summary",
    query: "clientes e entregas",
    fromDate: "2026-07-30",
    toDate: "2026-07-30",
    compareFromDate: null,
    compareToDate: null,
    cameraId: null,
    siteId: null,
    evidenceLimit: 6,
  });

  assert.equal(plan.intent, "period_summary");
  assert.equal(plan.evidenceLimit, 6);
});

test("rejeita datas fora do formato absoluto", () => {
  assert.throws(() =>
    AssistantPlanSchema.parse({
      intent: "search_events",
      query: "pacotes",
      fromDate: "hoje",
      toDate: "2026-07-30",
      compareFromDate: null,
      compareToDate: null,
      cameraId: null,
      siteId: null,
      evidenceLimit: 6,
    }),
  );
});

test("limita evidências da resposta", () => {
  const answer = AssistantAnswerSchema.parse({
    answer: "Foram observadas aparições estimadas de clientes.",
    caution: "A mesma pessoa pode aparecer em mais de um evento.",
    evidenceEventIds: [],
    periodLabel: "Hoje",
    suggestions: ["Mostrar entregas"],
  });

  assert.equal(answer.periodLabel, "Hoje");
});
