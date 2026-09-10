import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("instalador não coleta câmeras nem credenciais e o pareamento fica no onboarding", async () => {
  const [installer, cli, firstRun] = await Promise.all([
    readFile(new URL("../installer/monitoria.iss", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/dashboard/first-run-setup.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(installer, /CameraPage/);
  assert.doesNotMatch(installer, /DiscoveryStatusLabel/);
  assert.doesNotMatch(installer, /Encontrar câmeras automaticamente/);
  assert.doesNotMatch(installer, /cameraHost/);
  assert.match(firstRun, /SitePairingCode/);
  assert.match(firstRun, /Gere o código quando o instalador estiver aberto/);
  assert.match(cli, /if \(!input\.username\)/);
  assert.match(cli, /callAgent\("discovery\.configure"/);
});

test("descoberta combina ONVIF e varredura TCP mesmo quando ONVIF responde", async () => {
  const discovery = await readFile(new URL("../agent/src/discovery/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(discovery, /byHost\.size > 0 \|\| options\?\.skipScan/);
  assert.match(discovery, /for \(const device of await scanLocalNetwork/);
  assert.match(discovery, /if \(!byHost\.has\(device\.host\)\)/);
});

test("cadastro automático preserva segredos localmente e limita o Agent", async () => {
  const [route, service] = await Promise.all([
    readFile(new URL("../app/api/agent/cameras/discovered/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/service.ts", import.meta.url), "utf8"),
  ]);
  assert.match(route, /MAX_CAMERAS_PER_AGENT = 32/);
  assert.match(route, /\\b\(\?:\\d\{1,3\}\\\.\)\{3\}\\d\{1,3\}\\b/);
  assert.match(route, /agent_pairing_codes/);
  assert.match(route, /pairing_status: "paired"/);
  assert.doesNotMatch(route, /rtspUrl|cameraHost|password/);
  assert.match(service, /configuredHosts/);
  assert.match(service, /registerDiscoveredCamera/);
  assert.match(service, /configuradas\.has\(this\.streamKey\(stream\.rtspUrl\)\)/);
  assert.doesNotMatch(service, /configuredHosts\.has\(entry\.device\.host\)/);
});

test("descoberta não deixa aparelho inválido bloquear a câmera correta", async () => {
  const [service, discovery, client] = await Promise.all([
    readFile(new URL("../agent/src/service.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/discovery/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/ipc-client.ts", import.meta.url), "utf8"),
  ]);
  assert.match(service, /mapWithConcurrency/);
  assert.match(service, /alreadyConnected/);
  assert.match(discovery, /nonRtspPorts/);
  assert.match(discovery, /não respondeu como RTSP/);
  assert.match(client, /DISCOVERY_RESPONSE_TIMEOUT_MS = 75_000/);
});

test("Agent antecipa a primeira imagem sem remover o fallback periódico", async () => {
  const service = await readFile(new URL("../agent/src/service.ts", import.meta.url), "utf8");
  assert.match(service, /const connectedCameraIds: string\[\] = \[\]/);
  assert.match(service, /connectedCameraIds\.push\(assignment\.cameraId\)/);
  assert.match(service, /mapWithConcurrency\(\s*connectedCameraIds,\s*2,\s*async \(cameraId\)/s);
  assert.match(service, /await this\.checkCamera\(camera, true\)/);
  assert.match(service, /const CAMERA_CHECK_INTERVAL_MS = 5 \* 60_000/);
  assert.match(service, /!config\.cameras\[camera\.id\]\?\.lastSnapshotUploadedAt/);
});
