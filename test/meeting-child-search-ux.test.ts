import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Pesquisa IA oferece filtro visual criança/adulto sem alegar menoridade", () => {
  const chat = read("app/dashboard/search/assistant-chat.tsx");
  const route = read("app/api/assistant/query/route.ts");
  const contracts = read("src/assistant/v2-contracts.ts");

  assert.match(chat, /Provável criança/);
  assert.match(chat, /Provável adulto/);
  assert.match(route, /ageGroup: z\.enum\(\["child", "adult"\]\)\.nullable\(\)/);
  assert.match(contracts, /apparentAgeGroup/);
});

test("Pesquisa estruturada usa RPC v3 e limiar conservador", () => {
  const executor = read("src/assistant/executor-v2.ts");
  const migration = read(
    "supabase/migrations/20261009123000_assistant_age_group_search_v3.sql",
  );

  assert.match(executor, /assistant_structured_event_search_v3/);
  assert.match(migration, /apparentAgeGroupConfidence/);
  assert.match(migration, />= 0\.60/);
  assert.match(migration, /private\.is_org_member/);
});

test("seletor compartilhado permite isolar uma câmera", () => {
  const selector = read("app/dashboard/camera-multi-select.tsx");
  assert.match(selector, /Somente esta/);
  assert.match(selector, /selectOnly/);
});

test("marcador interno de proteção infantil fica oculto e é preservado", () => {
  const data = read("src/lib/camera-profile-data.ts");
  const actions = read("app/dashboard/cameras/profile-actions.ts");
  assert.match(data, /publicMonitoringGoals/);
  assert.match(actions, /mergeMonitoringGoals/);
  assert.match(actions, /CHILD_SAFETY_MONITORING_GOAL/);
});

test("editor avisa antes de reduzir zonas do perfil", () => {
  const editor = read(
    "app/dashboard/cameras/\[cameraId\]/camera-profile-panel.tsx",
  );
  assert.match(editor, /perfil atual possui/);
  assert.match(editor, /window\.confirm/);
});

test("todo período disponível é resolvido pelo registro mais antigo", () => {
  const planner = read("src/assistant/deterministic-v2.ts");
  const route = read("app/api/assistant/query/route.ts");
  assert.match(planner, /period:available/);
  assert.match(route, /earliestAvailableDate/);
});
