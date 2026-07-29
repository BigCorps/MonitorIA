import assert from "node:assert/strict";
import test from "node:test";
import { monitoringScheduleState } from "../agent/src/schedule.js";

test("agenda always mantém o monitoramento ativo", () => {
  const result = monitoringScheduleState(
    { mode: "always" },
    "America/Sao_Paulo",
    new Date("2026-07-29T15:00:00Z"),
  );

  assert.equal(result.enabled, true);
  assert.equal(result.thresholdMultiplier, 1);
});

test("fora do horário pode exigir movimento significativo", () => {
  const result = monitoringScheduleState(
    {
      mode: "weekly",
      weekly: [{ day: 3, start: "08:00", end: "10:00" }],
      outsideMode: "significant_only",
    },
    "America/Sao_Paulo",
    new Date("2026-07-29T15:00:00Z"),
  );

  assert.equal(result.enabled, true);
  assert.equal(result.thresholdMultiplier, 1.8);
});
