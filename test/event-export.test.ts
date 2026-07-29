import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEventsJson,
  buildEventsMarkdown,
} from "../src/lib/event-export.js";

const input = {
  generatedAt: "2026-07-29T17:00:00.000Z",
  timeZone: "America/Sao_Paulo",
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
      headline: "Cliente entregou um pacote",
      eventType: "person_present",
      eventTypeLabel: "Pessoa presente",
      summary:
        "Cliente aproximou-se do balcão e entregou um pacote.",
      confidence: 0.9,
      requiresReview: true,
      humanVerdict: null,
      peopleCount: 2,
      vehicleCount: 0,
      tags: ["entrega", "balcão"],
    },
  ],
};

test("usa o título específico no Markdown", () => {
  const markdown = buildEventsMarkdown(input);

  assert.match(
    markdown,
    /Cliente entregou um pacote/,
  );
  assert.match(
    markdown,
    /Tipo técnico:\\*\\* Pessoa presente/,
  );
  assert.match(markdown, /90%/);
});

test("exporta JSON estruturado v1.1", () => {
  const json = JSON.parse(
    buildEventsJson(input),
  );

  assert.equal(json.schemaVersion, "1.1");
  assert.equal(
    json.events[0].headline,
    "Cliente entregou um pacote",
  );
});
