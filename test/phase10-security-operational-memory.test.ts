import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AssistantPlanSchema } from "../src/assistant/contracts.js";

const root = new URL("../", import.meta.url);

function read(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

const basePlan = {
  query: "",
  fromDate: "2026-08-07",
  toDate: "2026-08-07",
  compareFromDate: null,
  compareToDate: null,
  cameraId: null,
  siteId: null,
  evidenceLimit: 8,
  wantsChart: false,
  chartType: null,
  chartMetric: null,
};

test("aceita todos os intents de memória operacional da Fase 10", () => {
  const intents = [
    "interaction_summary",
    "routine_deviation",
    "staff_activity",
    "queue_analysis",
    "object_history",
    "equipment_history",
    "camera_health",
    "daily_operations",
  ];

  for (const intent of intents) {
    assert.equal(
      AssistantPlanSchema.parse({ ...basePlan, intent }).intent,
      intent,
    );
  }
});

test("migration protege privacidade, rate limit e leitura de placas", () => {
  const sql = read(
    "supabase/migrations/20260807210000_phase10_security_privacy_operational_memory.sql",
  );

  assert.match(sql, /alter table public\.privacy_requests enable row level security/i);
  assert.match(sql, /consume_api_rate_limit_v1/i);
  assert.match(sql, /from public, anon, authenticated/i);
  assert.match(sql, /assistant_queue_analysis_v1/i);
  assert.match(sql, /block_plate_suggestions_v1/i);
  assert.match(sql, /raise exception 'advanced plate reading is disabled/i);
});

test("health público não revela configuração nem modelos", () => {
  const route = read("app/api/health/route.ts");
  assert.doesNotMatch(route, /configuration:/);
  assert.doesNotMatch(route, /VISION_MODEL|OPENAI_API_KEY|GROQ_API_KEY/);
});

test("artefatos públicos de LGPD estão publicados e ligados no sitemap", () => {
  const sitemap = read("app/sitemap.ts");
  for (const path of [
    "retencao",
    "subprocessadores",
    "dpa",
    "resposta-a-incidentes",
    "aviso-de-monitoramento",
  ]) {
    assert.match(sitemap, new RegExp(`/${path}`));
    assert.match(read(`app/${path}/page.tsx`), /MarketingPage/);
  }
});
