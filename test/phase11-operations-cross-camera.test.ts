import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AssistantPlanSchema } from "../src/assistant/contracts.js";
import { supportErrorCatalog } from "../src/lib/support-error-catalog.js";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Assistente aceita sequência provável entre câmeras", () => {
  const plan = AssistantPlanSchema.parse({
    intent: "cross_camera_sequence",
    query: "por quais câmeras essa passagem continuou?",
    fromDate: "2026-08-08",
    toDate: "2026-08-08",
    compareFromDate: null,
    compareToDate: null,
    cameraId: null,
    siteId: null,
    evidenceLimit: 8,
    wantsChart: false,
    chartType: null,
    chartMetric: null,
  });
  assert.equal(plan.intent, "cross_camera_sequence");
});

test("migration da Fase 11 protege alertas e proíbe biometria", () => {
  const sql = read("supabase/migrations/20260808110000_phase11_operations_cross_camera.sql");
  assert.match(sql, /create table if not exists public\.operational_alerts/i);
  assert.match(sql, /create table if not exists public\.cross_camera_journeys/i);
  assert.match(sql, /alter table public\.operational_alerts enable row level security/i);
  assert.match(sql, /service role required/i);
  assert.match(sql, /'biometricsUsed', false/i);
  assert.doesNotMatch(sql, /OPENAI_API_KEY|responses\.create/i);
});

test("diagnóstico não consulta credenciais, IP ou payload bancário", () => {
  const diagnostics = read("src/lib/support-diagnostics.ts");
  for (const forbidden of [
    "encrypted_rtsp_config",
    "last_ip",
    "agent_token_hash",
    "pix_copy_paste",
    "provider_payload",
  ]) {
    assert.doesNotMatch(diagnostics, new RegExp(forbidden, "i"));
  }
});

test("catálogo cobre todos os alertas operacionais", () => {
  const codes = new Set(supportErrorCatalog.map((entry) => entry.code));
  assert.equal(codes.size, 13);
  for (const code of ["agent_offline", "camera_offline", "purge_delayed", "payment_divergent", "assistant_unavailable"]) {
    assert.ok(codes.has(code));
  }
});

test("cron, ajuda e página pública de status estão publicados", () => {
  assert.match(read("vercel.json"), /\/api\/cron\/operations/);
  assert.match(read("app/ajuda/page.tsx"), /MarketingPage/);
  assert.match(read("app/status/page.tsx"), /getPlatformStatus/);
  assert.match(read("app/sitemap.ts"), /\/status/);
});
