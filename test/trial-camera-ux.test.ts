import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("listagem de câmeras diferencia conexão de ativação no teste", async () => {
  const page = await readFile(
    new URL("../app/dashboard/cameras/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /ATIVA NO TESTE/);
  assert.match(page, /AGUARDANDO ATIVAÇÃO/);
  assert.match(page, /Monitorando agora/);
  assert.match(page, /getRunningTrialCameraState/);
});

test("nome do local não aparece como número solto quando só existe um local", async () => {
  const page = await readFile(
    new URL("../app/dashboard/cameras/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /const showSiteName = sites\.length > 1/);
  assert.match(page, /LOCAL · \{camera\.siteName\}/);
  assert.doesNotMatch(page, /<span>\{camera\.siteName\}<\/span>/);
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
