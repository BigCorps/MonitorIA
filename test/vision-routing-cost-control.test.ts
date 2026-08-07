import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveVisionRouteExecution } from "../src/vision/plans";

test("plano Detalhada usa o modelo balanceado na rota normal", () => {
  const previousBalanced = process.env.VISION_MODEL_BALANCED;
  const previousDetailed = process.env.VISION_MODEL_DETAILED;

  process.env.VISION_MODEL_BALANCED = "balanced-cost-probe";
  process.env.VISION_MODEL_DETAILED = "detailed-cost-probe";

  try {
    const balanced = resolveVisionRouteExecution(
      "intensive",
      "balanced",
    );
    const strong = resolveVisionRouteExecution(
      "intensive",
      "strong",
    );

    assert.equal(balanced.model, "balanced-cost-probe");
    assert.equal(strong.model, "detailed-cost-probe");
  } finally {
    if (previousBalanced === undefined) {
      delete process.env.VISION_MODEL_BALANCED;
    } else {
      process.env.VISION_MODEL_BALANCED = previousBalanced;
    }

    if (previousDetailed === undefined) {
      delete process.env.VISION_MODEL_DETAILED;
    } else {
      process.env.VISION_MODEL_DETAILED = previousDetailed;
    }
  }
});

test("migração da Fase 9 limita verificações e corrige a telemetria", async () => {
  const sql = await readFile(
    new URL(
      "../supabase/migrations/20260807173000_phase9_cost_control.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(sql, /reserve_monitoria_analysis_verification/);
  assert.match(sql, /maximum_escalation_percent/);
  assert.match(sql, /analysis_verification_reservations/);
  assert.match(sql, /sync_monitoria_daily_escalation_metrics/);
  assert.match(sql, /refresh_monitoria_ai_usage_rollups/);
});
