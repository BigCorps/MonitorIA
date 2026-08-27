import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("instalador Store é por usuário e possui método visível de abertura", async () => {
  const source = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );

  assert.match(source, /PrivilegesRequired=lowest/);
  assert.match(source, /DefaultDirName=\{localappdata\}\\Programs\\MonitorIA/);
  assert.match(source, /\[Icons\]/);
  assert.match(source, /\{autoprograms\}\\MonitorIA/);
  assert.match(source, /monitoria-desktop\.exe/);
  assert.match(source, /Root: HKCU/);
  assert.match(source, /CurrentVersion\\Run/);
});

test("instalação Store não depende de tela interativa para parear", async () => {
  const installer = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );
  const host = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(installer, /CreateInputQueryPage/);
  assert.doesNotMatch(installer, /PairingPage/);
  assert.match(installer, /skipifsilent/);
  assert.match(host, /Conecte este computador ao MonitorIA/);
  assert.match(host, /paired-check/);
});

test("instalador Store não empacota componentes da edição 24x7", async () => {
  const source = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );

  for (const forbidden of [
    "monitoria-service.exe",
    "monitoria-service.xml",
    "OpenSCManager",
    "CreateService",
    "MonitorIAAgent",
  ]) {
    assert.equal(
      source.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `Encontrou item proibido no instalador Store: ${forbidden}`,
    );
  }
});

test("upgrade Store preserva dados até desinstalação explícita", async () => {
  const source = await readFile(
    new URL("../installer/monitoria-store-v103.iss", import.meta.url),
    "utf8",
  );

  assert.match(source, /UsePreviousAppDir=yes/);
  assert.match(source, /\[UninstallDelete\]/);
  assert.match(source, /\{localappdata\}\\MonitorIA/);
  assert.doesNotMatch(source, /PrepareToInstall.*MonitorIA\\agent\.json/s);
});

test("dashboard explica as duas edições sem prometer ausência de análise de segurança", async () => {
  const source = await readFile(
    new URL("../app/dashboard/installer/page.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /MonitorIA 24\/7/);
  assert.match(source, /MonitorIA via Microsoft Store/);
  assert.match(source, /Monitora antes do login/);
  assert.match(source, /Começa após o login/);
  assert.match(source, /programas de segurança ainda podem analisar/);
  assert.match(source, /não é necessário desativar a proteção/);
});

test("Store pública só é habilitada com link oficial apps.microsoft.com", async () => {
  const source = await readFile(
    new URL("../src/lib/installer-data.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /MONITORIA_STORE_PUBLIC_URL/);
  assert.match(source, /apps\.microsoft\.com/);
  assert.match(source, /storeDistribution/);
});
