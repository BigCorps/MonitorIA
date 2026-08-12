import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { withCredentials } from "../agent/src/discovery/onvif.js";
import {
  DEFAULT_INSTALLER_URLS,
  installerUrlFor,
} from "../src/lib/installer-data.js";

test("onboarding salva local e primeira câmera sem pedir novamente", async () => {
  const [page, actions, dashboard] = await Promise.all([
    readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /name="camera_name"/);
  assert.match(page, /name="monitoring_goals"/);
  assert.match(actions, /pendingCameraValues/);
  assert.match(actions, /\.from\("cameras"\)\.insert/);
  // O guia deixou de sair de cena na primeira imagem: ele acompanha até a
  // primeira análise ser aprovada, que é a etapa que faz o produto servir
  // para alguma coisa.
  assert.match(dashboard, /if \(firstRun\.stage < 5\)/);
  assert.match(dashboard, /FirstRunSetup/);
});

test("primeiro acesso mostra download junto do código", async () => {
  const [guide, pairing] = await Promise.all([
    readFile(new URL("../app/dashboard/first-run-setup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/cameras/pairing-result.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(guide, /Baixar MonitorIA para Windows/);
  // O código de pareamento passou a nascer do local, não de uma câmera: sem
  // isso o passo 1 exigiria cadastrar câmera antes de instalar.
  assert.match(guide, /SitePairingCode/);
  assert.match(pairing, /\/api\/installer\/windows/);
});

test("download oficial usa endereço permanente da release", () => {
  const previous = process.env.AGENT_WINDOWS_DOWNLOAD_URL;

  try {
    process.env.AGENT_WINDOWS_DOWNLOAD_URL =
      "https://github.com/BigCorps/MonitorIA/releases/download/agent-v0.10.6/MonitorIA-Setup.exe";
    assert.equal(installerUrlFor("windows"), DEFAULT_INSTALLER_URLS.windows);
    assert.match(installerUrlFor("windows") ?? "", /releases\/latest\/download/);
  } finally {
    if (previous === undefined) delete process.env.AGENT_WINDOWS_DOWNLOAD_URL;
    else process.env.AGENT_WINDOWS_DOWNLOAD_URL = previous;
  }
});

test("ONVIF codifica credenciais especiais uma única vez", () => {
  const url = withCredentials("rtsp://192.168.0.140:8554/stream1", {
    username: "admin@loja",
    password: "senha@forte/2026",
  });

  assert.match(url, /admin%40loja/);
  assert.match(url, /senha%40forte%2F2026/);
  assert.doesNotMatch(url, /%25(?:40|2F)/i);
});
