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

test("contratos da Fase 11 publicam alertas e passagens sem biometria", () => {
  const operations = read("src/lib/operations-data.ts");
  const cron = read("app/api/cron/operations/route.ts");
  assert.match(operations, /operational_alerts/i);
  assert.match(operations, /cross_camera_journeys/i);
  assert.match(cron, /refresh_operational_alerts_v1/i);
  assert.match(cron, /refresh_cross_camera_journeys_v1/i);
  assert.doesNotMatch(`${operations}\n${cron}`, /biometric|facial_recognition/i);
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
  assert.ok(codes.size >= 13);
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
