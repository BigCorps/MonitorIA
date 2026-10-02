import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("listagem de câmeras preserva contexto do teste sem chamar conexão de monitoramento", async () => {
  const [page, health] = await Promise.all([
    readFile(new URL("../app/dashboard/cameras/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/standard-camera-health.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Período de teste em andamento/);
  assert.match(page, /getRunningTrialCameraState/);
  assert.match(page, /estado real abaixo/);
  assert.match(page, /StandardCameraHealth/);
  assert.match(health, /Conectada não basta/);
  assert.match(health, /Monitoramento iniciado/);
  assert.doesNotMatch(page, /cameraHasRecentSignal/);
});

test("Local aparece explicitamente no estado operacional", async () => {
  const health = await readFile(
    new URL("../src/components/standard-camera-health.tsx", import.meta.url),
    "utf8",
  );

  assert.match(health, /\{camera\.siteName\}/);
  assert.match(health, /Todos os locais/);
  assert.match(health, /name="site"/);
});

test("acontecimentos prioriza a câmera ativa do teste no card de referência", async () => {
  const page = await readFile(
    new URL("../app/dashboard/events/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /activeTrialCameraIds/);
  assert.match(page, /CÂMERA ATIVA NO TESTE/);
  assert.match(page, /\{starterFrame\.cameraName\} está pronta/);
  assert.doesNotMatch(page, /Perfil da câmera salvo/);
});
