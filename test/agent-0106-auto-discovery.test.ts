import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("instalador 0.10.6 procura a rede sem exigir endereço IP", async () => {
  const [installer, cli] = await Promise.all([
    readFile(new URL("../installer/monitoria.iss", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/index.ts", import.meta.url), "utf8"),
  ]);

  assert.match(installer, /Encontrar câmeras automaticamente/);
  assert.match(installer, /varre a rede local/);
  assert.doesNotMatch(installer, /CameraPage\.Add\('Endereço IP/);
  assert.doesNotMatch(installer, /cameraHost/);
  assert.match(cli, /callAgent\("discovery\.configure"/);
  assert.doesNotMatch(cli, /hosts: \[input\.cameraHost\]/);
});

test("descoberta combina ONVIF e varredura TCP mesmo quando ONVIF responde", async () => {
  const discovery = await readFile(
    new URL("../agent/src/discovery/index.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(discovery, /byHost\.size > 0 \|\| options\?\.skipScan/);
  assert.match(discovery, /for \(const device of await scanLocalNetwork/);
  assert.match(discovery, /if \(!byHost\.has\(device\.host\)\)/);
});

test("cadastro automático preserva segredos localmente e limita o Agent", async () => {
  const [route, service] = await Promise.all([
    readFile(
      new URL(
        "../app/api/agent/cameras/discovered/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../agent/src/service.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /MAX_CAMERAS_PER_AGENT = 32/);
  assert.match(route, /\\b\(\?:\\d\{1,3\}\\\.\)\{3\}\\d\{1,3\}\\b/);
  assert.match(route, /agent_pairing_codes/);
  assert.match(route, /pairing_status: "paired"/);
  assert.doesNotMatch(route, /rtspUrl|cameraHost|password/);
  assert.match(service, /configuredHosts/);
  assert.match(service, /registerDiscoveredCamera/);
  assert.match(service, /!configuredHosts\.has\(entry\.device\.host\)/);
});
