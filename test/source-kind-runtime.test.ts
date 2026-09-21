import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(path: string) {
  return fs.readFileSync(path, "utf8");
}

test("RC9 define modo da organização sem usar Agent como tipo de fonte", () => {
  const sourceMode = read("src/lib/source-mode.ts");
  const sourceContext = read("src/lib/source-context.ts");

  assert.match(sourceMode, /"recordings_only"/);
  assert.match(sourceMode, /"live_only"/);
  assert.match(sourceMode, /"hybrid"/);
  assert.match(sourceContext, /source_kind/);
  assert.match(sourceContext, /agentOnlineCount/);
});

test("RC9 torna source_kind imutável", () => {
  const migration = read(
    "supabase/migrations/20260921140959_source_kind_runtime_separation.sql",
  );

  assert.match(migration, /source_kind_immutable/);
  assert.match(migration, /before update of source_kind/i);
});

test("RC9 impede saúde e offline em gravações", () => {
  const migration = read(
    "supabase/migrations/20260921140959_source_kind_runtime_separation.sql",
  );

  assert.match(
    migration,
    /health_intelligence_enabled :=\s*new\.source_kind = 'live_camera'/,
  );
  assert.match(
    migration,
    /c\.source_kind = ''live_camera'' and c\.health_intelligence_enabled/,
  );
  assert.match(
    migration,
    /c\.source_kind = ''live_camera''[\s\S]*c\.status::text <> ''disabled''/,
  );
});

test("RC9 mantém rotina histórica mas limita avaliação do agora a live_camera", () => {
  const migration = read(
    "supabase/migrations/20260921140959_source_kind_runtime_separation.sql",
  );

  assert.match(
    migration,
    /camera\.source_kind = ''live_camera'' and camera\.routine_intelligence_enabled/,
  );
});

test("RC9 não cria alertas inteligentes atuais para arquivos históricos", () => {
  const migration = read(
    "supabase/migrations/20260921140959_source_kind_runtime_separation.sql",
  );

  assert.match(migration, /source_camera\.source_kind = ''live_camera''/);
  assert.match(migration, /recording_source_not_live/);
});

test("RC9 linguagem do realtime não chama sincronização de Ao vivo", () => {
  for (const path of [
    "app/dashboard/events/events-realtime-refresh.tsx",
    "app/dashboard/sessions/sessions-realtime-refresh.tsx",
    "app/dashboard/routines/routines-realtime-refresh.tsx",
    "app/dashboard/processes/processes-realtime-refresh.tsx",
    "app/dashboard/operational-profiles/profiles-realtime-refresh.tsx",
    "app/dashboard/camera-health/camera-health-realtime-refresh.tsx",
    "app/dashboard/operations/alerts-realtime-refresh.tsx",
  ]) {
    const content = read(path);
    assert.doesNotMatch(content, /"Ao vivo"/);
    assert.match(content, /"Sincronizado"/);
  }
});

test("RC9 acontecimento conhece a origem visual", () => {
  const data = read("src/lib/event-search-data.ts");
  const page = read("app/dashboard/events/[eventId]/page.tsx");

  assert.match(data, /sourceKind: "live_camera" \| "local_recording"/);
  assert.match(data, /camera:cameras\(id,name,source_kind\)/);
  assert.match(page, /recordingEvent/);
});

test("RC9 Pesquisa IA recebe sourceKind", () => {
  const contracts = read("src/assistant/contracts.ts");
  const route = read("app/api/assistant/query/route.ts");
  const openai = read("src/assistant/openai.ts");

  assert.match(contracts, /sourceKind/);
  assert.match(route, /sourceKind: camera\.sourceKind/);
  assert.match(openai, /local_recording/);
  assert.match(openai, /horário do registro/);
});

test("RC9 planos não mostram ambiente de gravações como offline", () => {
  const selector = read("app/dashboard/plans/plan-selector.tsx");

  assert.match(selector, /camera\.sourceKind !== "local_recording"/);
  assert.match(selector, /Gravações/);
});

test("RC9 armazenamento conhece sourceKind e não promete clipe para gravação", () => {
  const data = read("src/lib/retention-data.ts");
  const page = read("app/dashboard/storage/page.tsx");

  assert.match(data, /sourceKind/);
  assert.match(page, /local_recording/);
  assert.match(page, /Arquivo original permanece com você/);
});

test("RC9 camera health lista apenas live_camera", () => {
  const health = read("src/lib/camera-health-data.ts");
  assert.match(health, /\.eq\("source_kind", "live_camera"\)/);
});
