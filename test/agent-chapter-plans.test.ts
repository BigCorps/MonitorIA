import assert from "node:assert/strict";
import test from "node:test";
import {
  getAgentPlan,
} from "../agent/src/plans.js";

test("modo equilibrado limita capítulos a 150 segundos", () => {
  const plan = getAgentPlan("standard");

  assert.equal(
    plan.chapterMaximumSeconds,
    150,
  );
  assert.equal(
    plan.chapterMinimumSeconds,
    30,
  );
});

test("modo detalhado usa capítulos menores", () => {
  assert.ok(
    getAgentPlan("intensive")
      .chapterMaximumSeconds <
      getAgentPlan("basic")
        .chapterMaximumSeconds,
  );
});
