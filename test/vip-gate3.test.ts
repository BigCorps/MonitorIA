import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Gate 3 inicia o VIP somente pelo trial assistido já validado", async () => {
  const [actions, page] = await Promise.all([
    read("app/vip/onboarding/actions.ts"),
    read("app/vip/onboarding/page.tsx"),
  ]);

  assert.match(actions, /start_sales_monitoria_trial/);
  assert.match(actions, /refreshVipOnboarding/);
  assert.match(page, /startVipTrialAction/);
  assert.match(page, /Iniciar os 60 minutos agora/);
  assert.match(page, /TrialCountdown/);
  assert.match(page, /VipLiveRefresh/);
  assert.match(page, /VipAssistantPanel/);
  assert.match(page, /PILOTO VIP EM ANDAMENTO/);
  assert.match(page, /CAPTURA CONCLUÍDA/);
});

test("Gate 3 mantém um único relógio autoritativo", async () => {
  const [page, migration] = await Promise.all([
    read("app/vip/onboarding/page.tsx"),
    read("supabase/migrations/20261001171911_monitoria_vip_gate3_trial_state_sync.sql"),
  ]);

  assert.match(page, /captureEndsAt/);
  assert.doesNotMatch(page, /setInterval\([^)]*60\s*\*\s*60/);
  assert.match(migration, /trial_runs_sync_vip_project_state_v1/);
  assert.match(migration, /'trial_running'/);
  assert.match(migration, /'trial_completed'/);
  assert.match(migration, /new\.capture_ends_at/);
});

test("snapshot ao vivo não busca segredos de câmera", async () => {
  const live = await read("src/vip/live.ts");

  assert.match(live, /events/);
  assert.match(live, /assistant_allowances/);
  assert.match(live, /last_heartbeat_at/);
  assert.doesNotMatch(live, /rtsp_url|rtsp_password|camera_password|camera_username|credentials?/i);
});

test("vendedor acompanha o mesmo piloto sem consumir a Pesquisa IA", async () => {
  const [page, panel] = await Promise.all([
    read("app/dashboard/admin/customers/trials/[trialId]/results/page.tsx"),
    read("app/dashboard/admin/customers/trials/[trialId]/results/vip-seller-live.tsx"),
  ]);

  assert.match(page, /getVipTrialLiveSnapshotByTrialId/);
  assert.match(page, /VipSellerLivePanel/);
  assert.match(panel, /TrialCountdown/);
  assert.match(panel, /VipLiveRefresh/);
  assert.match(panel, /credenciais nunca são exibidas ao vendedor/i);
  assert.doesNotMatch(panel, /\/api\/assistant\/query/);
});

test("Pesquisa IA permanece dentro do onboarding VIP", async () => {
  const panel = await read("app/vip/onboarding/vip-assistant-panel.tsx");

  assert.match(panel, /\/api\/assistant\/query/);
  assert.match(panel, /Motor Máximo/i);
  assert.match(panel, /Continue explorando o que foi capturado/);
  assert.doesNotMatch(panel, /href=["']\/dashboard\/search/);
});
