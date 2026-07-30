import assert from "node:assert/strict";
import test from "node:test";
import { buildAssistantChart } from "../src/assistant/chart.js";

const basePlan = {
  intent: "period_summary" as const,
  query: "movimento por hora",
  fromDate: "2026-07-29",
  toDate: "2026-07-30",
  compareFromDate: null,
  compareToDate: null,
  cameraId: null,
  siteId: null,
  evidenceLimit: 6,
  wantsChart: true,
  chartType: "line" as const,
  chartMetric: "events_by_hour" as const,
};

test("gera uma linha por dia quando o resumo possui byDayHour", () => {
  const chart = buildAssistantChart({
    plan: basePlan,
    fromDate: "2026-07-29",
    toDate: "2026-07-30",
    retrievedData: {
      summary: {
        byDayHour: [
          {
            date: "2026-07-29",
            hours: [
              { hour: 9, events: 2 },
              { hour: 10, events: 5 },
            ],
          },
          {
            date: "2026-07-30",
            hours: [
              { hour: 9, events: 4 },
              { hour: 10, events: 8 },
            ],
          },
        ],
      },
    },
  });

  assert.ok(chart);
  assert.equal(chart.type, "line");
  assert.deepEqual(chart.labels, ["09h", "10h"]);
  assert.equal(chart.series.length, 2);
  assert.deepEqual(chart.series[1]?.values, [4, 8]);
});

test("não gera gráfico sem pedido explícito", () => {
  const chart = buildAssistantChart({
    plan: {
      ...basePlan,
      wantsChart: false,
    },
    fromDate: "2026-07-30",
    toDate: "2026-07-30",
    retrievedData: {
      summary: {
        byHour: [{ hour: 10, events: 5 }],
      },
    },
  });

  assert.equal(chart, null);
});
