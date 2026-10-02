import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("VIP continua usando estado de produto em vez de Online isolado", async () => {
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
  assert.match(data, /options\.vipOnly \? "vip" : "standard"/);
  assert.doesNotMatch(data, /sessionHasNoFrames/);
});

test("seleção explícita de Local vale para VIP e padrão", async () => {
  const [component, action] = await Promise.all([
    read("app/dashboard/site-pairing-code.tsx"),
    read("app/dashboard/site-pairing-actions.ts"),
  ]);

  assert.match(component, /Onde este computador está instalado/);
  assert.match(component, /name="site_id"/);
  assert.match(component, /\+ Criar novo Local/);
  assert.match(component, /new_site_name/);
  assert.doesNotMatch(component, /vipExperience/);
  assert.doesNotMatch(component, /usePathname/);
  assert.match(action, /requestedSiteId/);
  assert.match(action, /sites\.find/);
  assert.match(action, /createRepairPairingCodeAction/);
  assert.match(action, /Escolha o Local onde este computador está instalado/);
  assert.doesNotMatch(action, /: sites\[0\] \?\? null/);
});

test("perfil guiado aprovado no VIP agora é compartilhado com o padrão", async () => {
  const [context, guided] = await Promise.all([
    read("app/dashboard/onboarding-camera-context.tsx"),
    read("app/dashboard/cameras/guided-camera-profile.tsx"),
  ]);

  assert.match(context, /const guidedExperience = true/);
  assert.match(context, /GuidedCameraProfile/);
  assert.doesNotMatch(context, /pathname\.startsWith\("\/vip\/"\)/);
  assert.match(guided, /analysisFormRef\.current\?\.requestSubmit/);
  assert.match(guided, /router\.refresh\(\)/);
  assert.match(guided, /Aprovar e iniciar monitoramento/);
  assert.match(guided, /Editar configuração avançada/);
  assert.match(guided, /CameraProfilePanel/);
});

test("convite corporativo mantém cooldown e remetente seguro em produção", async () => {
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
  const state = await read("src/camera/product-state.ts");
  assert.doesNotMatch(state, /runtime_revision/);
  assert.doesNotMatch(state, /camera_monitor_self_recovered/);
});
