import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("VIP usa estado de produto em vez de Online isolado", async () => {
  const [page, component, data] = await Promise.all([
    read("app/vip/dashboard/page.tsx"),
    read("src/components/vip-camera-health.tsx"),
    read("src/lib/camera-product-state-data.ts"),
  ]);

  assert.match(page, /getOrganizationCameraProductHealth/);
  assert.match(page, /MONITORANDO AGORA/);
  assert.match(component, /Conectada não basta/);
  assert.match(component, /etapa\(s\) restante\(s\)/);
  assert.match(component, /Ver diagnóstico avançado/);
  assert.match(data, /camera_entitlements/);
  assert.match(data, /camera_profiles/);
  assert.match(data, /capture_sessions/);
  assert.match(data, /camera_evidence_gaps/);
  assert.match(data, /vip_project_cameras/);
  assert.match(data, /vip_project_sites/);
  assert.doesNotMatch(data, /sessionHasNoFrames/);
});

test("VIP possui seletor de Local sem mudar a experiência padrão", async () => {
  const [component, action] = await Promise.all([
    read("app/dashboard/site-pairing-code.tsx"),
    read("app/dashboard/site-pairing-actions.ts"),
  ]);

  assert.match(component, /pathname\.startsWith\("\/vip\/"\)/);
  assert.match(component, /Onde este computador está instalado/);
  assert.match(component, /name="site_id"/);
  assert.match(component, /\+ Criar novo Local/);
  assert.match(component, /new_site_name/);
  assert.match(action, /requestedSiteId/);
  assert.match(action, /sites\.find/);
  assert.match(action, /createRepairPairingCodeAction/);
  assert.match(action, /: sites\[0\] \?\? null/);
});

test("VIP gera perfil automaticamente e mantém edição avançada opcional", async () => {
  const [context, guided] = await Promise.all([
    read("app/dashboard/onboarding-camera-context.tsx"),
    read("app/dashboard/cameras/guided-camera-profile.tsx"),
  ]);

  assert.match(context, /vipExperience/);
  assert.match(context, /GuidedCameraProfile/);
  assert.match(guided, /analysisFormRef\.current\?\.requestSubmit/);
  assert.match(guided, /router\.refresh\(\)/);
  assert.match(guided, /Aprovar e iniciar monitoramento/);
  assert.match(guided, /Editar configuração avançada/);
  assert.match(guided, /CameraProfilePanel/);
});

test("convite corporativo tem cooldown e não cai em remetente sandbox em produção", async () => {
  const [actions, notification] = await Promise.all([
    read("app/join/[token]/actions.ts"),
    read("src/lib/team-notification.ts"),
  ]);

  assert.match(actions, /ACCESS_CODE_RESEND_COOLDOWN_SECONDS = 60/);
  assert.match(actions, /access_code_sent_at/);
  assert.match(actions, /Aguarde \$\{remaining\} segundo/);
  assert.match(actions, /team_invite_code_verified/);
  assert.match(notification, /VERCEL_ENV === "production"/);
  assert.match(notification, /resend_from_not_configured/);
  assert.match(notification, /onboarding@resend\.dev/);
});

test("nenhum arquivo do Agent é necessário neste Gate", async () => {
  const page = await read("app/vip/dashboard/page.tsx");
  assert.doesNotMatch(page, /runtime_revision/);
  assert.doesNotMatch(page, /camera_monitor_self_recovered/);
});
