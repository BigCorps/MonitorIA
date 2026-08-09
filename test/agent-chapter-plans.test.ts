import assert from "node:assert/strict";
import test from "node:test";
import {
  getAgentPlan,
} from "../agent/src/plans.js";

test("modo equilibrado mantém pausas curtas no mesmo capítulo", () => {
  const plan = getAgentPlan("standard");

  assert.equal(
    plan.chapterMaximumSeconds,
    180,
  );
  assert.equal(
    plan.chapterMinimumSeconds,
    45,
  );
});

test("modo detalhado evita recortar o mesmo atendimento a cada cena", () => {
  const plan = getAgentPlan("intensive");
  assert.equal(plan.chapterMinimumSeconds, 60);
  assert.equal(plan.chapterMaximumSeconds, 240);
  assert.equal(plan.regionShiftThreshold, 0.28);
});
