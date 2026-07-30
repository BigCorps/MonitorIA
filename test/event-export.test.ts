import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventsJson,
  buildEventsMarkdown,
} from "../src/lib/event-export.js";

const input = {
  generatedAt: "2026-07-30T15:00:00.000Z",
  timeZone: "America/Sao_Paulo",
  filters: {
    "Data inicial": "2026-07-30",
    "Data final": "2026-07-30",
  },
  total: 1,
  operationalSummary: [
    {
      label: "Aparições estimadas de clientes",
      value: 4,
      note: "não representa clientes únicos",
    },
  ],
  events: [
    {
      id: "3100141d-ef3c-4f98-ac4f-81651e4dc9e0",
      startedAt: "2026-07-30T14:21:00.144Z",
      endedAt: "2026-07-30T14:22:00.144Z",
      cameraName: "Entrada da Loja",
      siteName: "Casa Verde",
      headline: "Cliente entregou um pacote",
      eventType: "object_appeared",
      eventTypeLabel: "Objeto apareceu",
      summary: "Cliente entregou um pacote no balcão.",
      confidence: 0.9,
      requiresReview: false,
      humanVerdict: null,
      peopleCount: 2,
      vehicleCount: 0,
      tags: ["entrega", "balcão"],
    },
  ],
};

test("inclui indicadores estimados no Markdown", () => {
  const markdown = buildEventsMarkdown(input);
  assert.match(markdown, /Indicadores estimados/);
  assert.match(markdown, /Aparições estimadas de clientes/);
  assert.match(markdown, /Cliente entregou um pacote/);
});

test("exporta JSON schema 1.2", () => {
  const json = JSON.parse(buildEventsJson(input));
  assert.equal(json.schemaVersion, "1.2");
  assert.equal(
    json.summary.operationalIndicators[0].value,
    4,
  );
});
