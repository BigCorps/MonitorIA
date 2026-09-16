import assert from "node:assert/strict";
import test from "node:test";
import {
  integrationGroups,
  integrationSystemKeys,
  integrationSystemLabel,
} from "../src/lib/integration-catalog";

test("catálogo inicial de integrações é amplo e sem chaves duplicadas", () => {
  assert.ok(integrationSystemKeys.length >= 20);
  assert.equal(new Set(integrationSystemKeys).size, integrationSystemKeys.length);
});

test("catálogo inclui os sistemas prioritários do piloto", () => {
  const expected: Record<string, string> = {
    eye_mobile: "Eye Mobile",
    grandchef: "GrandChef",
    saipos: "Saipos",
    ifood: "iFood",
    market4u: "market4u",
    nayax_vmpay: "Nayax / VMpay (VMtecnologia)",
  };

  for (const [key, label] of Object.entries(expected)) {
    assert.ok(integrationSystemKeys.includes(key));
    assert.equal(integrationSystemLabel(key), label);
  }
});

test("catálogo mantém grupos separados para reduzir confusão no formulário", () => {
  assert.ok(integrationGroups.some((group) => group.id === "food_pos"));
  assert.ok(integrationGroups.some((group) => group.id === "delivery"));
  assert.ok(integrationGroups.some((group) => group.id === "autonomous_market"));
});
