import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("assistente traduz precisão operacional estimada", async () => {
  const source = await readFile(
    new URL("../src/lib/assistant-display.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /estimated_interval/);
  assert.match(source, /horário estimado dentro de uma faixa observada/);
  assert.match(source, /camera_health_regime_shift/);
  assert.match(source, /closed_estimated/);
  assert.match(source, /open_estimated/);
});

test("migration protege abertura e fechamento inferidos", async () => {
  const source = await readFile(
    new URL(
      "../supabase/migrations/20260825230000_operational_inference_health_final.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /monitoria_health_shift_corroborated_v1/);
  assert.match(source, /site_operating_sessions_guard_close_v2/);
  assert.match(source, /site_operating_sessions_guard_open_v1/);
  assert.match(source, /visual_state_transitions_guard_primary_insert_v1/);
  assert.match(source, /estimated_interval/);
  assert.match(source, /openingTimingNote/);
  assert.match(source, /closingTimingNote/);
});
