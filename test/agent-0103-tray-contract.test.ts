import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("tray 24/7 consulta o serviço sem assumir o papel do serviço", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/tray.c",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /OpenServiceW/);
  assert.match(source, /SERVICE_QUERY_STATUS/);
  assert.match(source, /Shell_NotifyIconW/);
  assert.match(source, /MonitorIAAgent/);

  // Fechar o tray não pode parar a captura 24/7.
  assert.doesNotMatch(
    source,
    /SERVICE_CONTROL_STOP/,
  );
  assert.match(
    source,
    /Fechar apenas este ícone NÃO interrompe o serviço 24\/7/,
  );
});

test("reinício do serviço exige elevação explícita", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/tray.c",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /L"runas"/);
  assert.match(
    source,
    /monitoria-service\.exe/,
  );
  assert.match(source, /L"restart"/);
});

test("edição 24/7 ganha Menu Iniciar e autostart de tray", async () => {
  const installer = await readFile(
    new URL(
      "../installer/monitoria-service-v103.iss",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    installer,
    /\[Icons\]/,
  );
  assert.match(
    installer,
    /\{autoprograms\}\\MonitorIA/,
  );
  assert.match(
    installer,
    /MonitorIATray/,
  );
  assert.match(
    installer,
    /CurrentVersion\\Run/,
  );
  assert.match(
    installer,
    /runasoriginaluser/,
  );

  // Esta edição continua sendo a edição Service/24x7.
  assert.match(
    installer,
    /#include "monitoria\.iss"/,
  );
});

test("tray é asInvoker e não exige UAC para simplesmente existir", async () => {
  const manifest = await readFile(
    new URL(
      "../agent/native/tray.manifest",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    manifest,
    /level="asInvoker"/,
  );
  assert.doesNotMatch(
    manifest,
    /requireAdministrator/,
  );
});
