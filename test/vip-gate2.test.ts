import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  readinessAction,
  vipNextAction,
  vipProgressPercent,
  vipStepForStatus,
} from "../src/vip/onboarding";

test("Gate 2 mantém o usuário em uma sequência de implantação explícita", () => {
  assert.equal(vipStepForStatus("installing"), "install");
  assert.equal(vipStepForStatus("calibrating"), "context");
  assert.equal(vipStepForStatus("ready_for_trial"), "ready");
  assert.equal(vipStepForStatus("trial_running"), "trial");
  assert.equal(vipProgressPercent("active"), 100);
});

test("próxima ação é objetiva para os principais pontos de abandono", () => {
  assert.match(vipNextAction("install_agent").title, /computador/i);
  assert.match(vipNextAction("discover_cameras").title, /câmeras/i);
  assert.match(vipNextAction("configure_camera_context").title, /contexto/i);
  assert.match(vipNextAction("ready_to_start").description, /relógio ainda não começou/i);
});

test("pendências de câmera possuem destino de resolução", () => {
  assert.match(
    readinessAction("active_profile_required", "00000000-0000-4000-8000-000000000001").href,
    /^\/vip\/onboarding/,
  );
  assert.equal(
    readinessAction("agent_offline", null).href,
    "/vip/onboarding#readiness-help",
  );
});

test("migration Gate 2 consolida readiness sem expor a RPC ao cliente", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261001162012_monitoria_vip_gate2_onboarding_readiness.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /create or replace function public\.refresh_vip_onboarding_v1/);
  assert.match(migration, /private\.monitoria_trial_readiness/);
  assert.match(migration, /onboarding_last_activity_at/);
  assert.match(migration, /onboarding_attention_code/);
  assert.match(migration, /onboarding_snapshot/);
  assert.match(
    migration,
    /revoke all on function public\.refresh_vip_onboarding_v1\(uuid, boolean\)[\s\S]*from public, anon, authenticated/,
  );
  assert.match(migration, /grant execute[\s\S]*to service_role/);
});

test("onboarding VIP reutiliza componentes maduros e não inicia o relógio no Gate 2", async () => {
  const [page, actions] = await Promise.all([
    readFile(new URL("../app/vip/onboarding/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/vip/onboarding/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /InstallerPlatformActions/);
  assert.match(page, /DiscoveryPanel/);
  assert.match(page, /OnboardingCameraContext/);
  assert.match(page, /SalesCameraSelection/);
  assert.match(page, /PRÓXIMA AÇÃO/);
  assert.doesNotMatch(actions, /start_sales_monitoria_trial/);
  assert.match(actions, /prepare_sales_monitoria_trial/);
  assert.match(actions, /refresh_sales_monitoria_trial/);
});

test("Clarity: convite existente não força login por senha e VIP retorna ao onboarding", async () => {
  const [page, actions] = await Promise.all([
    readFile(new URL("../app/lead/[token]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lead/[token]/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /mesma forma que já usava/i);
  assert.match(page, /\/login\?next=/);
  assert.match(page, /não crie outra conta/i);
  assert.match(actions, /continuationPath/);
  assert.match(actions, /\/vip\/onboarding/);
});

test("Clarity: login padrão explica métodos e desencoraja conta duplicada", async () => {
  const page = await readFile(
    new URL("../app/login/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /mesma forma de acesso/i);
  assert.match(page, /Google/);
  assert.match(page, /Somente se você criou ou definiu uma senha/);
  assert.match(page, /não crie outra conta/i);
  assert.match(page, /link por e-mail/i);
});


test("VIP em implantação é impedido de escapar para o dashboard padrão", async () => {
  const layout = await readFile(
    new URL("../app/dashboard/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layout, /getVipProjectForOrganization/);
  assert.match(layout, /redirect\("\/vip\/onboarding"\)/);
  assert.match(layout, /vipProject\.status !== "active"/);
});


test("área VIP preserva a exigência de MFA do dashboard", async () => {
  const layout = await readFile(
    new URL("../app/vip/layout.tsx", import.meta.url),
    "utf8",
  );

  assert.match(layout, /effective_mfa_required/);
  assert.match(layout, /claims\.aal/);
  assert.match(layout, /\/auth\/mfa/);
  assert.match(layout, /\/vip\/onboarding/);
});
