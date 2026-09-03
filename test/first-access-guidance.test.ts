import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { withCredentials } from "../agent/src/discovery/onvif.js";
import {
  CURRENT_AGENT_VERSION,
  DEFAULT_INSTALLER_URLS,
  installerUrlFor,
} from "../src/lib/installer-data.js";

test("onboarding salva o local e deixa a câmera para depois da descoberta", async () => {
  const [page, actions, dashboard] = await Promise.all([
    readFile(new URL("../app/onboarding/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/onboarding/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /name="camera_name"/);
  assert.doesNotMatch(page, /name="monitoring_goals"/);
  assert.doesNotMatch(actions, /pendingCameraValues/);
  assert.doesNotMatch(actions, /\.from\("cameras"\)\.insert/);
  assert.match(dashboard, /if \(firstRun\.stage < 5\)/);
  assert.match(dashboard, /FirstRunSetup/);
});

test("primeiro acesso mostra download junto do código", async () => {
  const [guide, pairing] = await Promise.all([
    readFile(new URL("../app/dashboard/first-run-setup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/cameras/pairing-result.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(guide, /Baixar MonitorIA para Windows/);
  assert.match(guide, /SitePairingCode/);
  assert.match(pairing, /\/api\/installer\/windows/);
});

test("download oficial usa release versionada atual", () => {
  assert.equal(CURRENT_AGENT_VERSION, "1.0.3");
  assert.equal(installerUrlFor("windows"), DEFAULT_INSTALLER_URLS.windows);
  assert.match(
    installerUrlFor("windows"),
    new RegExp(`/releases/download/agent-v${CURRENT_AGENT_VERSION}/MonitorIA-Setup\\.exe$`),
  );
  assert.match(
    installerUrlFor("linux-x64"),
    new RegExp(`/releases/download/agent-v${CURRENT_AGENT_VERSION}/monitoria-agent-linux-x64\\.tar\\.gz$`),
  );
  assert.match(
    installerUrlFor("linux-arm64"),
    new RegExp(`/releases/download/agent-v${CURRENT_AGENT_VERSION}/monitoria-agent-linux-arm64\\.tar\\.gz$`),
  );
  assert.doesNotMatch(installerUrlFor("windows"), /\/releases\/latest\/download\//);
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
