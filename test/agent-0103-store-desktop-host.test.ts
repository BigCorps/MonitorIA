import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Desktop Host usa LOCALAPPDATA e nunca ProgramData", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.match(source, /CSIDL_LOCAL_APPDATA/);
  assert.match(source, /MONITORIA_DESKTOP_MODE/);
  assert.match(source, /MONITORIA_CONFIG_DIR/);
  assert.doesNotMatch(source, /PROGRAMDATA/);
});

test("Desktop Host executa o mesmo Core 1.0.3 em modo run", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.match(source, /monitoria-agent\.exe/);
  assert.match(source, /L"\\"%s\\" run"/);
  assert.match(source, /CreateProcessW/);
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
});

test("Store Desktop Host não usa componentes da edição 24x7", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
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
    assert.doesNotMatch(source, forbidden);
  }
});

test("fechar a edição Store encerra o Core pelo Job Object", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.match(source, /Sair do MonitorIA/);
  assert.match(source, /StopAgentCore/);
  assert.match(source, /TerminateProcess/);
  assert.match(source, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
});

test("primeira execução possui pareamento gráfico fora do instalador", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.match(source, /Conecte este computador ao MonitorIA/);
  assert.match(source, /Conectar computador/);
  assert.match(source, /paired-check/);
  assert.match(source, /setup --file/);
  assert.match(source, /PairWithCode/);
  assert.match(source, /EXIT_NOT_PAIRED/);
});

test("pareamento reparável reaparece se o token deixar de ser utilizável", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.match(source, /previous == 1/);
  assert.match(source, /g_pair_state == 0/);
  assert.match(source, /g_pair_prompt_dismissed = FALSE/);
});

test("código de pareamento não é persistido no diretório do MonitorIA", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.c", import.meta.url),
    "utf8",
  );

  assert.match(source, /GetTempPathW/);
  assert.match(source, /GetTempFileNameW/);
  assert.match(source, /DeleteFileW/);
  assert.doesNotMatch(source, /agent\.json.*code/i);
});

test("paths preserva ACL do usuário no Desktop Host sem alterar os outros hosts", async () => {
  const source = await readFile(
    new URL("../agent/src/paths.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /isWindowsDesktopHost/);
  assert.match(source, /LOCALAPPDATA/);
  assert.match(source, /await runIcacls\(root\)/);
  assert.match(source, /await restrictPosix\(root\)/);

  const desktopBranch = source.slice(
    source.indexOf("const restricted"),
    source.indexOf("const layout"),
  );

  assert.match(desktopBranch, /isWindowsDesktopHost\(\)/);
  assert.match(desktopBranch, /\? true/);
});

test("Desktop Host é asInvoker", async () => {
  const source = await readFile(
    new URL("../agent/native/desktop-host.manifest", import.meta.url),
    "utf8",
  );

  assert.match(source, /level="asInvoker"/);
  assert.doesNotMatch(source, /requireAdministrator/);
});
