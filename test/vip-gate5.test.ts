import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Gate 5 cria host VIP com sessão compartilhada sem trocar o login canônico", async () => {
  const [proxy, sessionProxy, cookies] = await Promise.all([
    read("proxy.ts"),
    read("src/lib/supabase/proxy.ts"),
    read("src/lib/supabase/auth-cookie-options.ts"),
  ]);
  assert.match(proxy, /vipConfig\.domain/);
  assert.match(proxy, /return updateSession\(request\)/);
  assert.match(sessionProxy, /pathname\.startsWith\("\/vip\/dashboard"\)/);
  assert.match(sessionProxy, /cookie\.name\.startsWith\("sb-"\)/);
  assert.match(sessionProxy, /vipRedirectWithSharedSession/);
  assert.match(cookies, /\.monitoria\.cam/);
});

test("dashboard VIP é separado, preto e dourado, com Projetos e Pesquisa IA", async () => {
  const [page, css] = await Promise.all([
    read("app/vip/dashboard/page.tsx"),
    read("app/vip/dashboard/vip-dashboard.module.css"),
  ]);
  assert.match(page, /Visão executiva dos seus Projetos/);
  assert.match(page, /MOTOR MÁXIMO 2\.0/);
  assert.match(page, /\/vip\/dashboard\/projects\//);
  assert.match(css, /#050607/);
  assert.match(css, /#d4af37/);
});

test("entitlement VIP é por Projeto e não cria camera_subscriptions", async () => {
  const [foundation, runtime] = await Promise.all([
    read("supabase/migrations/20261002003111_monitoria_vip_gate5_entitlement_foundation.sql"),
    read("supabase/migrations/20261002003225_monitoria_vip_gate5_entitlement_runtime.sql"),
  ]);
  assert.match(foundation, /create table if not exists public\.vip_project_cameras/);
  assert.match(foundation, /vip_camera_capacity_exceeded/);
  assert.match(runtime, /v_source:='vip_contract'/);
  assert.match(runtime, /v_plan_code:='intensive'/);
  assert.doesNotMatch(foundation, /insert into public\.camera_subscriptions/i);
});

test("Pesquisa IA recebe entitlement e franquia mensal VIP", async () => {
  const [source, monthly, entitlement] = await Promise.all([
    read("supabase/migrations/20261002002928_monitoria_vip_gate5_assistant_source.sql"),
    read("supabase/migrations/20261002003656_monitoria_vip_gate5_assistant_monthly_refresh.sql"),
    read("supabase/migrations/20261002004905_monitoria_vip_gate5_assistant_entitlement.sql"),
  ]);
  assert.match(source, /vip_subscription/);
  assert.match(monthly, /interval '1 month'/);
  assert.match(monthly, /ensure_vip_assistant_allowance_internal/);
  assert.match(entitlement, /from public\.vip_contracts contract/);
  assert.match(entitlement, /project\.status='active'/);
});

test("Pix aceita subdomínio e reprocessa ativação VIP sem nova cobrança", async () => {
  const [createPix, checkPix, process] = await Promise.all([
    read("supabase/functions/monitoria-create-pix/index.ts"),
    read("supabase/functions/monitoria-check-pix/index.ts"),
    read("supabase/functions/monitoria-process-billing/index.ts"),
  ]);
  assert.match(createPix, /https:\/\/vip\.monitoria\.cam/);
  assert.match(checkPix, /activate_paid_vip_contract_v1/);
  assert.match(checkPix, /paid_pending_activation/);
  assert.match(process, /paid_pending_activation/);
  assert.match(process, /vipActivations/);
});

test("Laboratório VIP usa flags por Projeto", async () => {
  const [foundation, page, actions] = await Promise.all([
    read("supabase/migrations/20261002003111_monitoria_vip_gate5_entitlement_foundation.sql"),
    read("app/vip/dashboard/beta/page.tsx"),
    read("app/vip/dashboard/projects/[projectId]/actions.ts"),
  ]);
  assert.match(foundation, /vip_feature_catalog/);
  assert.match(foundation, /vip_project_features/);
  assert.match(page, /LABORATÓRIO VIP/);
  assert.match(actions, /set_vip_project_feature_v1/);
});

test("Gate 5 bloqueia dupla cobrança câmera padrão + VIP", async () => {
  const sql = await read("supabase/migrations/20261002004946_monitoria_vip_gate5_double_billing_guard.sql");
  assert.match(sql, /vip_camera_has_standard_subscription/);
  assert.match(sql, /subscription\.status<>'cancelled'/);
  assert.match(sql, /vip_project_camera_standard_subscription_guard/);
});
