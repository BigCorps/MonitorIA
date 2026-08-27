import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Desktop Host usa LOCALAPPDATA e nunca ProgramData", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/desktop-host.c",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /CSIDL_LOCAL_APPDATA/,
  );
  assert.match(
    source,
    /MONITORIA_DESKTOP_MODE/,
  );
  assert.match(
    source,
    /MONITORIA_CONFIG_DIR/,
  );
  assert.doesNotMatch(
    source,
    /PROGRAMDATA/,
  );
});

test("Desktop Host executa o mesmo Core 1.0.3 em modo run", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/desktop-host.c",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /monitoria-agent\.exe/,
  );
  assert.match(
    source,
    /L"\\"%s\\" run"/,
  );
  assert.match(
    source,
    /CreateProcessW/,
  );
  assert.match(
    source,
    /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/,
  );
});

test("Store Desktop Host não usa NT Service, WinSW ou sc.exe", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/desktop-host.c",
      import.meta.url,
    ),
    "utf8",
  );

  for (const forbidden of [
    /OpenSCManager/i,
    /OpenService/i,
    /CreateService/i,
    /SERVICE_CONTROL/i,
    /winsw/i,
    /sc\.exe/i,
    /MonitorIAAgent/,
  ]) {
    assert.doesNotMatch(
      source,
      forbidden,
    );
  }
});

test("fechar a edição Store encerra o Core, diferente do tray 24x7", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/desktop-host.c",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /Sair do MonitorIA/,
  );
  assert.match(
    source,
    /StopAgentCore/,
  );
  assert.match(
    source,
    /TerminateProcess/,
  );
});

test("paths preserva ACL do usuário no Desktop Host sem alterar Service/Linux", async () => {
  const source = await readFile(
    new URL(
      "../agent/src/paths.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /isWindowsDesktopHost/,
  );
  assert.match(
    source,
    /LOCALAPPDATA/,
  );
  assert.match(
    source,
    /await runIcacls\(root\)/,
  );
  assert.match(
    source,
    /await restrictPosix\(root\)/,
  );

  // Desktop Host não pode remover a herança da pasta do usuário.
  const desktopBranch =
    source.slice(
      source.indexOf(
        "const restricted",
      ),
      source.indexOf(
        "const layout",
      ),
    );

  assert.match(
    desktopBranch,
    /isWindowsDesktopHost\(\)/,
  );
  assert.match(
    desktopBranch,
    /\? true/,
  );
});

test("Desktop Host é asInvoker", async () => {
  const source = await readFile(
    new URL(
      "../agent/native/desktop-host.manifest",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    source,
    /level="asInvoker"/,
  );
  assert.doesNotMatch(
    source,
    /requireAdministrator/,
  );
});
