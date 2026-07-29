import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventsJson,
  buildEventsMarkdown,
} from "../src/lib/event-export.js";

const input = {
  generatedAt: "2026-07-29T17:00:00.000Z",
  filters: {
    Período: "29/07/2026",
    Câmera: "Entrada da Loja",
  },
  total: 1,
  events: [
    {
      id: "3100141d-ef3c-4f98-ac4f-81651e4dc9e0",
      startedAt: "2026-07-29T17:21:00.144Z",
      endedAt: "2026-07-29T17:24:44.954Z",
      cameraName: "Entrada da Loja",
      siteName: "Casa Verde",
      eventType: "person_entered",
      eventTypeLabel: "Pessoa entrou",
      summary: "Duas pessoas se aproximaram do balcão.",
      confidence: 0.9,
      requiresReview: true,
      humanVerdict: null,
      peopleCount: 2,
      vehicleCount: 0,
      tags: ["entrada", "balcão"],
    },
  ],
};

test("exporta relatório Markdown legível", () => {
  const markdown = buildEventsMarkdown(input);

  assert.match(markdown, /# Relatório MonitorIA/);
  assert.match(markdown, /Pessoa entrou/);
  assert.match(markdown, /Entrada da Loja/);
  assert.match(markdown, /90%/);
});

test("exporta JSON estruturado e válido", () => {
  const json = JSON.parse(buildEventsJson(input));

  assert.equal(json.schemaVersion, "1.0");
  assert.equal(json.summary.totalFound, 1);
  assert.equal(json.events[0].peopleCount, 2);
});
