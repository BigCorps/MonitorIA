import assert from "node:assert/strict";
import test from "node:test";
import { salesTrialEventTypeLabel } from "../src/lib/trial-results.js";

test("traduz tipos conhecidos para linguagem comercial", () => {
  assert.equal(salesTrialEventTypeLabel("vehicle_entered"), "Veículo entrou");
  assert.equal(salesTrialEventTypeLabel("delivery_arrived"), "Entrega chegou");
});

test("mantém um fallback legível para tipos novos", () => {
  assert.equal(salesTrialEventTypeLabel("gate_opened"), "Gate Opened");
  assert.equal(salesTrialEventTypeLabel(""), "Acontecimento");
});
