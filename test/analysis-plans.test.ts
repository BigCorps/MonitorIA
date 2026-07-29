import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMERA_ANALYSIS_PLANS,
  normalizeAnalysisPlan,
} from "../src/lib/analysis-plans.js";
import { getAgentPlan } from "../agent/src/plans.js";

test("modo econômico observa localmente com intervalo maior e envia um quadro", () => {
  assert.equal(
    CAMERA_ANALYSIS_PLANS.basic.captureIntervalSeconds,
    3,
  );
  assert.equal(getAgentPlan("basic").maximumFrames, 1);
});

test("modo equilibrado envia até três quadros", () => {
  assert.equal(getAgentPlan("standard").maximumFrames, 3);
  assert.equal(
    CAMERA_ANALYSIS_PLANS.standard.consolidationIntervalSeconds,
    10,
  );
});

test("valor desconhecido volta para o modo equilibrado", () => {
  assert.equal(normalizeAnalysisPlan("desconhecido"), "standard");
});
