import assert from "node:assert/strict";
import test from "node:test";
import { estimateVisionCostBreakdown } from "../src/vision/cost.js";

test("GPT-5 nano usa preço de entrada, cache e saída corretos", () => {
  const cost = estimateVisionCostBreakdown("gpt-5-nano", {
    inputTokens: 6000,
    cachedInputTokens: 4000,
    outputTokens: 1500,
    reasoningTokens: 900,
    totalTokens: 7500,
  });

  assert.equal(cost.billableInputTokens, 2000);
  assert.equal(cost.cachedInputTokens, 4000);
  assert.ok(Math.abs(cost.totalCostUsd - 0.00072) < 0.0000001);
});

test("tokens de raciocínio não são cobrados duas vezes", () => {
  const cost = estimateVisionCostBreakdown("gpt-5-mini", {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 1000,
    reasoningTokens: 800,
    totalTokens: 1000,
  });

  assert.equal(cost.outputCostUsd, 0.002);
  assert.equal(cost.totalCostUsd, 0.002);
});
