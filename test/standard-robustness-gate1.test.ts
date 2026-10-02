import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveCameraProductState } from "../src/camera/product-state.js";

const base = {
  id: "camera-1",
  name: "Entrada",
  siteId: "site-1",
  siteName: "Matriz",
  sourceKind: "live_camera" as const,
  cameraOnline: true,
  cameraPaired: true,
  imageReceived: true,
  planReady: true,
  planCode: "standard",
  profileReady: true,
  agentMapped: true,
  agentEnabled: true,
  agentOnline: true,
  agentHeartbeatRecent: true,
  monitorActive: true,
  pipelineIssue: false,
  visualHealthStatus: "healthy",
  latestAnalysisAt: "2026-10-02T18:00:00.000Z",
  latestImageAt: "2026-10-02T18:00:00.000Z",
};

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("estado compartilhado usa CTA padrão por default", () => {
  const state = deriveCameraProductState({ ...base, profileReady: false });
  assert.equal(state.status, "needs_configuration");
  assert.match(state.action.href, /^\/dashboard\/cameras\//);
  assert.match(state.action.href, /setup=guided/);
});

test("mesmo motor mantém CTA VIP quando solicitado", () => {
  const state = deriveCameraProductState(
    { ...base, profileReady: false },
    { experience: "vip" },
  );
  assert.equal(state.status, "needs_configuration");
  assert.match(state.action.href, /^\/vip\/onboarding/);
});

test("standard mostra Monitorando apenas com monitor local ativo", () => {
  assert.equal(deriveCameraProductState(base).status, "monitoring");
  assert.equal(
    deriveCameraProductState({ ...base, monitorActive: false }).status,
    "ready_to_monitor",
  );
});

test("página padrão usa o agregador de estado real", async () => {
  const page = await read("app/dashboard/cameras/page.tsx");
  assert.match(page, /getOrganizationCameraProductHealth/);
  assert.match(page, /experience: "standard"/);
  assert.match(page, /StandardCameraHealth/);
  assert.doesNotMatch(page, /cameraHasRecentSignal/);
});

test("onboarding padrão usa perfil guiado aprovado no VIP", async () => {
  const context = await read("app/dashboard/onboarding-camera-context.tsx");
  assert.match(context, /const guidedExperience = true/);
  assert.match(context, /GuidedCameraProfile/);
  assert.doesNotMatch(context, /pathname\.startsWith\("\/vip\/"\)/);
  assert.doesNotMatch(context, /<CameraProfilePanel/);
});

test("detalhe da câmera oferece configuração guiada quando perfil falta", async () => {
  const page = await read("app/dashboard/cameras/[cameraId]/page.tsx");
  assert.match(page, /guidedSetup/);
  assert.match(page, /GuidedCameraProfile/);
  assert.match(page, /id="perfil-inteligente"/);
});

test("Multi-Site explícito vale para padrão e VIP", async () => {
  const [component, action] = await Promise.all([
    read("app/dashboard/site-pairing-code.tsx"),
    read("app/dashboard/site-pairing-actions.ts"),
  ]);
  assert.match(component, /Onde este computador está instalado/);
  assert.match(component, /getSitePairingOptionsAction/);
  assert.match(component, /name="site_id"/);
  assert.doesNotMatch(component, /usePathname/);
  assert.doesNotMatch(component, /vipExperience/);
  assert.match(action, /Escolha o Local onde este computador está instalado/);
  assert.doesNotMatch(action, /: sites\[0\] \?\? null/);
});

test("nenhum arquivo do Agent é necessário", async () => {
  const state = await read("src/camera/product-state.ts");
  assert.doesNotMatch(state, /runtime_revision/);
  assert.doesNotMatch(state, /camera_monitor_self_recovered/);
});
