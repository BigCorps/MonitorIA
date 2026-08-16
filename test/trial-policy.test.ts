import assert from "node:assert/strict";
import test from "node:test";
import {
  SALES_ASSISTED_TRIAL_POLICY,
  SELF_SERVICE_TRIAL_POLICY,
  trialPolicyForMode,
} from "../src/trial/policy.js";

test("self-service preserva 24 horas e uma câmera", () => {
  assert.equal(SELF_SERVICE_TRIAL_POLICY.durationMinutes, 1440);
  assert.equal(SELF_SERVICE_TRIAL_POLICY.maxCameras, 1);
  assert.equal(SELF_SERVICE_TRIAL_POLICY.defaultPlanCode, null);
});

test("trial assistido usa 60 minutos e até seis câmeras", () => {
  assert.equal(SALES_ASSISTED_TRIAL_POLICY.durationMinutes, 60);
  assert.equal(SALES_ASSISTED_TRIAL_POLICY.maxCameras, 6);
  assert.equal(SALES_ASSISTED_TRIAL_POLICY.defaultPlanCode, "intensive");
});

test("a política é resolvida explicitamente por modo", () => {
  assert.equal(
    trialPolicyForMode("sales_assisted").mode,
    "sales_assisted",
  );
  assert.equal(
    trialPolicyForMode("self_service").mode,
    "self_service",
  );
});
