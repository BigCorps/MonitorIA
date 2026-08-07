import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { supportErrorCatalog } from "../src/lib/support-error-catalog.js";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("migration da Fase 12 protege alertas inteligentes e o gate", () => {
  const sql = read("supabase/migrations/20260808193000_phase12_launch_gate_intelligent_alerts.sql");
  for (const table of ["intelligent_alert_settings", "intelligent_alerts", "release_evidence", "release_gate_runs"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /service role required/i);
  assert.match(sql, /evaluate_release_gate_v1/i);
});

test("alertas inteligentes reutilizam evidências sem nova chamada de modelo", () => {
  const sql = read("supabase/migrations/20260808193000_phase12_launch_gate_intelligent_alerts.sql");
  assert.match(sql, /'additionalModelCalls', 0/i);
  assert.match(sql, /'kind', 'alert'/i);
  assert.match(sql, /insight_type, status, severity/i);
  assert.doesNotMatch(sql, /OPENAI_API_KEY|responses\.create|chat\.completions/i);
});

test("catálogo cobre os doze alertas inteligentes da Fase 12", () => {
  const codes = new Set(supportErrorCatalog.map((entry) => entry.code));
  assert.equal(codes.size, 25);
  for (const code of [
    "opening_late", "closing_missing", "reopened_activity", "restricted_access",
    "object_removed", "equipment_after_hours", "queue_excessive", "session_long",
    "camera_obstructed", "camera_drift", "camera_low_quality", "process_incomplete",
  ]) assert.ok(codes.has(code));
});

test("cron atualiza inteligência e registra o gate da release", () => {
  const cron = read("app/api/cron/operations/route.ts");
  assert.match(cron, /refresh_intelligent_alerts_v1/);
  assert.match(cron, /evaluate_release_gate_v1/);
  assert.match(cron, /additionalModelCalls/);
});

test("cadastro geral exige flag no servidor e gate possui tela interna", () => {
  const actions = read("app/login/actions.ts");
  const release = read("src/lib/release.ts");
  const page = read("app/dashboard/admin/launch/page.tsx");
  assert.match(actions, /if \(!generalSignupEnabled\(\)\)/);
  assert.match(release, /GENERAL_SIGNUP_ENABLED/);
  assert.match(page, /requireInternalOperator/);
});

test("preços da landing permanecem alinhados ao gate comercial", () => {
  const landing = read("src/lib/landing-content.ts");
  const sql = read("supabase/migrations/20260808193000_phase12_launch_gate_intelligent_alerts.sql");
  for (const price of ["39,90", "79,90", "149,90"]) assert.match(landing, new RegExp(price));
  for (const cents of ["3990", "7990", "14990"]) assert.match(sql, new RegExp(cents));
});
