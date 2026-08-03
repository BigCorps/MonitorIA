import assert from "node:assert/strict";
import test from "node:test";
import {
  basisPoints,
  escalationStatus,
  overallStatus,
  projectedCostStatus,
} from "../src/ai-cost/status";

test("calcula pontos-base sem divisão inválida", () => {
  assert.equal(basisPoints(15, 100), 1500);
  assert.equal(basisPoints(1, 0), 0);
});

test("classifica projeção contra o teto de COGS", () => {
  assert.equal(projectedCostStatus(null, 80, 100), "insufficient_data");
  assert.equal(projectedCostStatus(7900, 80, 100), "healthy");
  assert.equal(projectedCostStatus(8000, 80, 100), "warning");
  assert.equal(projectedCostStatus(10000, 80, 100), "critical");
});

test("qualquer escalonamento é crítico quando o plano não permite", () => {
  assert.equal(escalationStatus(0, 0), "healthy");
  assert.equal(escalationStatus(1, 0), "critical");
});

test("avisa a partir de 80% do limite de escalonamento", () => {
  assert.equal(escalationStatus(1199, 15), "healthy");
  assert.equal(escalationStatus(1200, 15), "warning");
  assert.equal(escalationStatus(1501, 15), "critical");
});

test("estado geral prioriza crítico e atenção", () => {
  assert.equal(overallStatus(["healthy", "insufficient_data"]), "insufficient_data");
  assert.equal(overallStatus(["healthy", "warning"]), "warning");
  assert.equal(overallStatus(["warning", "critical"]), "critical");
});
