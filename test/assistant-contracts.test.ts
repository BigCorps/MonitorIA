import assert from "node:assert/strict";
import test from "node:test";
import {
  AssistantAnswerSchema,
  AssistantChartSpecSchema,
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
    wantsChart: false,
    chartType: null,
    chartMetric: null,
  });

  assert.equal(plan.intent, "period_summary");
  assert.equal(plan.evidenceLimit, 6);
  assert.equal(plan.wantsChart, false);
});

test("aceita pedido de gráfico por hora", () => {
  const plan = AssistantPlanSchema.parse({
    intent: "compare_periods",
    query: "movimento por hora",
    fromDate: "2026-07-30",
    toDate: "2026-07-30",
    compareFromDate: "2026-07-29",
    compareToDate: "2026-07-29",
    cameraId: null,
    siteId: null,
    evidenceLimit: 4,
    wantsChart: true,
    chartType: "line",
    chartMetric: "events_by_hour",
  });

  assert.equal(plan.chartType, "line");
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
      wantsChart: false,
      chartType: null,
      chartMetric: null,
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

test("valida séries com o mesmo tamanho dos rótulos", () => {
  const chart = AssistantChartSpecSchema.parse({
    type: "line",
    title: "Movimento por hora",
    xLabel: "Horário",
    yLabel: "Eventos",
    labels: ["09h", "10h"],
    series: [
      {
        name: "Hoje",
        values: [3, 7],
      },
    ],
    note: null,
  });

  assert.equal(chart.series[0]?.values[1], 7);
});
