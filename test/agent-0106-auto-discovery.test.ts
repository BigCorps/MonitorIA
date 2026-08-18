import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("instalador 1.0.0 só pede o código de pareamento", async () => {
  const [installer, cli] = await Promise.all([
    readFile(new URL("../installer/monitoria.iss", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/index.ts", import.meta.url), "utf8"),
  ]);

  // A busca de câmeras saiu do instalador e foi para o painel. O que este
  // teste protege agora é a ausência: nenhuma tela de credencial, nenhuma
  // varredura travando a janela, nenhum laço de "outra senha?".
  assert.doesNotMatch(installer, /CameraPage/);
  assert.doesNotMatch(installer, /DiscoveryStatusLabel/);
  assert.doesNotMatch(installer, /Encontrar câmeras automaticamente/);
  assert.doesNotMatch(installer, /cameraHost/);
  assert.match(installer, /Código de pareamento/);

  // O comando setup aceita pareamento sem credencial de câmera, e continua
  // aceitando instaladores antigos que ainda mandam usuário e senha.
  assert.match(cli, /if \(!input\.username\)/);
  assert.match(cli, /callAgent\("discovery\.configure"/);
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

  // A unidade virou o canal, não o aparelho: um gravador de oito canais
  // precisa virar oito câmeras. Comparar por host fazia o canal 1 marcar os
  // outros sete como já conectados.
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
