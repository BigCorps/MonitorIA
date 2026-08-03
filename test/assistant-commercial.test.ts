import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantBalanceLabel,
  assistantBalanceTone,
  sortAssistantPackages,
} from "../src/assistant-commercial/format.ts";
import type {
  AssistantBalance,
  AssistantCreditPackage,
} from "../src/assistant-commercial/types.ts";

function balance(overrides: Partial<AssistantBalance> = {}): AssistantBalance {
  return {
    organizationId: "org",
    enforcementEnabled: true,
    serviceAccessAllowed: true,
    blockReason: null,
    accessSource: "subscription",
    unlimited: false,
    accessAllowed: true,
    includedTotal: 90,
    includedUsed: 20,
    includedReserved: 0,
    includedRemaining: 70,
    purchasedRemaining: 0,
    purchasedReserved: 0,
    totalRemaining: 70,
    nextResetAt: null,
    nextPurchasedExpiryAt: null,
    calculatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

test("mostra saldo total disponível", () => {
  assert.equal(
    assistantBalanceLabel(balance({ totalRemaining: 68 })),
    "68 interações disponíveis",
  );
});

test("modo legado não mostra limite artificial", () => {
  const value = balance({
    unlimited: true,
    enforcementEnabled: false,
    accessSource: "legacy",
    totalRemaining: null,
  });
  assert.equal(assistantBalanceLabel(value), "Acesso de homologação");
  assert.equal(assistantBalanceTone(value), "legacy");
});

test("saldo baixo gera atenção e saldo zero bloqueia", () => {
  assert.equal(assistantBalanceTone(balance({ totalRemaining: 10 })), "warning");
  assert.equal(
    assistantBalanceTone(
      balance({ totalRemaining: 0, accessAllowed: false }),
    ),
    "blocked",
  );
});

test("pacotes são ordenados pelo catálogo", () => {
  const packages: AssistantCreditPackage[] = [
    {
      code: "b",
      displayName: "B",
      description: "",
      amountCents: 1,
      currency: "BRL",
      interactions: 500,
      validityDays: 365,
      sortOrder: 20,
    },
    {
      code: "a",
      displayName: "A",
      description: "",
      amountCents: 1,
      currency: "BRL",
      interactions: 100,
      validityDays: 365,
      sortOrder: 10,
    },
  ];
  assert.deepEqual(
    sortAssistantPackages(packages).map((item) => item.code),
    ["a", "b"],
  );
});

test("pacote extra não substitui assinatura ou trial", () => {
  const value = balance({
    serviceAccessAllowed: false,
    blockReason: "subscription_or_trial_required",
    accessAllowed: false,
    purchasedRemaining: 100,
    totalRemaining: 100,
  });
  assert.equal(assistantBalanceLabel(value), "Assinatura necessária");
  assert.equal(assistantBalanceTone(value), "blocked");
});
