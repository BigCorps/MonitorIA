import { closePrompt, promptSecret, promptText } from "./cli.js";
import { readFile, rm } from "node:fs/promises";
import { loadConfig, removeConfig } from "./config.js";
import { protectSecret, revealSecret } from "./secret-store.js";
import {
  AgentAccessDeniedError,
  AgentNotRunningError,
  callAgent,
} from "./ipc-client.js";
import {
  discoverDeviceStreams,
  discoverDevices,
} from "./discovery/index.js";
import { macForHost } from "./discovery/mac.js";
import { AdaptiveMotionCalibration } from "./motion-calibration.js";
import { calculateMotion } from "./motion.js";
import { forgetPaths, PermissionError, resolvePaths } from "./paths.js";
import { AGENT_VERSION, AgentService, DEFAULT_API_URL } from "./service.js";

/**
 * Dois papéis num único executável.
 *
 * `service` é o processo longo, iniciado pelo Windows. Todos os outros
 * comandos são a interface local: conectam ao serviço pelo canal e imprimem
 * a resposta. Nenhum deles toca a configuração diretamente — o serviço é o
 * único dono dos segredos, e existe um caminho de código só, tanto para o
 * instalador quanto para o operador.
 */

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function argumentValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function bytes(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function usage() {
  console.log("Uso:");
  console.log("  monitoria-agent service              Executa o serviço (uso do Windows)");
  console.log("  monitoria-agent pair --code 12345678 Pareia este computador");
  console.log("  monitoria-agent camera --id <id>     Informa o endereço RTSP de uma câmera");
  console.log("  monitoria-agent discover             Procura câmeras na rede local");
  console.log("  monitoria-agent status               Situação do serviço");
  console.log("  monitoria-agent diagnose             Diagnóstico local, funciona sem internet");
  console.log("  monitoria-agent scan-report          Relatório de rede e canais, para análise");
  console.log("  monitoria-agent sync                 Força sincronização com o painel");
  console.log("  monitoria-agent unpair               Remove o pareamento");
  console.log("  monitoria-agent self-test            Testa DPAPI e segmentação de movimento");
  console.log("  monitoria-agent reset                Apaga a configuração local");
}

// ------------------------------------------------------------------ modo serviço

async function runService(foreground: boolean) {
  const service = new AgentService({ mirrorToConsole: foreground });
  await service.start();

  // O processo é mantido vivo pelos timers e pelo canal local. O
  // encerramento acontece via SIGINT/SIGTERM, tratados dentro do serviço.
  await new Promise<void>(() => {});
}

// -------------------------------------------------------------- interface local

async function commandPair() {
  const code = argumentValue("--code") ?? (await promptText("Código de pareamento"));
  const apiBaseUrl = argumentValue("--url") ?? DEFAULT_API_URL;
  const agentName = argumentValue("--name");

  if (!code?.trim()) throw new Error("O código de pareamento é obrigatório.");

  const payload: Record<string, unknown> = { code: code.trim(), apiBaseUrl };
  if (agentName) payload.agentName = agentName;

  const result = await callAgent("pair", payload);

  console.log(`\nPareado com sucesso.`);
  console.log(`Agent: ${String(result.agentName)}`);
  console.log(`Câmera: ${String(result.cameraName)}`);
  console.log(`\nInforme o endereço RTSP com:`);
  console.log(`  monitoria-agent camera --id ${String(result.cameraId)}`);
}

class SetupError extends Error {
  constructor(
    message: string,
    readonly kind: "camera" | "input",
  ) {
    super(message);
    this.name = "SetupError";
  }
}

type SetupInput = {
  code?: string;
  apiBaseUrl?: string;
  /**
   * Usuário das câmeras. Opcional desde que a busca passou para o painel.
   *
   * O instalador atual manda só o código de pareamento. Instaladores antigos
   * ainda mandam usuário e senha, e continuam funcionando: quando o campo
   * vem preenchido, a busca roda como antes.
   */
  username?: string;
  password?: string;
};

function setupInput(value: unknown): SetupInput {
  if (!value || typeof value !== "object") {
    throw new SetupError("Arquivo de configuração inválido.", "input");
  }

  const candidate = value as Record<string, unknown>;
  const username =
    typeof candidate.username === "string"
      ? candidate.username.trim()
      : "";

  return {
    username,
    password:
      typeof candidate.password === "string"
        ? candidate.password
        : "",
    code:
      typeof candidate.code === "string"
        ? candidate.code.trim()
        : "",
    apiBaseUrl:
      typeof candidate.apiBaseUrl === "string"
        ? candidate.apiBaseUrl.trim()
        : DEFAULT_API_URL,
  };
}

/** Configuração não interativa usada exclusivamente pelo assistente gráfico. */
async function commandSetup() {
  const file = argumentValue("--file");
  if (!file) {
    throw new SetupError("O arquivo temporário não foi informado.", "input");
  }

  let input: SetupInput;

  try {
    const raw = await readFile(file, "utf8");
    if (Buffer.byteLength(raw, "utf8") > 64 * 1024) {
      throw new SetupError("Arquivo de configuração muito grande.", "input");
    }
    input = setupInput(JSON.parse(raw) as unknown);
  } catch (error) {
    if (error instanceof SetupError) throw error;
    throw new SetupError("Não foi possível ler a configuração inicial.", "input");
  } finally {
    // A senha da câmera nunca permanece no disco depois da leitura.
    await rm(file, { force: true }).catch(() => undefined);
  }

  const status = await callAgent("status");

  if (!status.paired) {
    if (!input.code) {
      throw new SetupError("O código de pareamento é obrigatório.", "input");
    }

    await callAgent("pair", {
      code: input.code,
      apiBaseUrl: input.apiBaseUrl ?? DEFAULT_API_URL,
    });
  }

  // Sem usuário de câmera não há busca a fazer: o instalador só conecta o
  // computador ao painel e o cliente adiciona as câmeras por lá, sem janela
  // travada e sem precisar do eletricista no mesmo dia.
  if (!input.username) {
    console.log("Computador conectado ao painel.");
    return;
  }

  let configured: Record<string, unknown>;

  try {
    configured = await callAgent("discovery.configure", {
      username: input.username,
      password: input.password ?? "",
      channels: [1],
    });
  } catch (error) {
    throw new SetupError(
      `Não foi possível procurar as câmeras: ${errorMessage(error)}`,
      "camera",
    );
  }

  const connected = Number(configured.connected ?? 0);
  const alreadyConnected = Number(configured.alreadyConnected ?? 0);
  if (
    !Number.isFinite(connected) ||
    !Number.isFinite(alreadyConnected) ||
    connected + alreadyConnected < 1
  ) {
    throw new SetupError(
      "Nenhuma câmera nova aceitou estes dados. Confira o usuário, a senha e se ONVIF/RTSP estão habilitados.",
      "camera",
    );
  }

  console.log(
    connected > 0
      ? `${connected} câmera(s) configurada(s) com sucesso.`
      : `${alreadyConnected} câmera(s) já estava(m) configurada(s) e foi(ram) confirmada(s).`,
  );
}

async function commandCheckReady(requireCamera: boolean) {
  const status = await callAgent("status");
  if (!status.paired) {
    process.exitCode = EXIT.CONFIGURACAO_INCOMPLETA;
    return;
  }

  if (!requireCamera) return;
  if (Number(status.camerasConfiguredLocal ?? 0) < 1) {
    process.exitCode = EXIT.CONFIGURACAO_INCOMPLETA;
  }
}

async function commandCamera() {
  const cameraId = argumentValue("--id") ?? (await promptText("ID da câmera"));

  if (!cameraId?.trim()) throw new Error("O ID da câmera é obrigatório.");

  const inline = argumentValue("--rtsp");
  const rtspUrl = inline ?? (await promptSecret("URL RTSP (usuário e senha inclusos)"));

  await callAgent("camera.set-rtsp", {
    cameraId: cameraId.trim(),
    rtspUrl: rtspUrl.trim(),
  });

  console.log("Endereço gravado e protegido. O monitoramento inicia em instantes.");
}

async function commandDiscover() {
  const username = argumentValue("--user") ?? (await promptText("Usuário da câmera", "admin"));
  const password = argumentValue("--password") ?? (await promptSecret("Senha da câmera"));

  console.log("\nProcurando câmeras na rede local. Isso pode levar até um minuto...\n");

  const result = await callAgent("discovery.scan", {
    username: username.trim(),
    password,
  });

  const devices = Array.isArray(result.devices) ? result.devices : [];

  if (devices.length === 0) {
    console.log("Nenhum aparelho encontrado na rede local.");
    return;
  }

  for (const raw of devices) {
    const device = raw as Record<string, unknown>;
    const streams = Array.isArray(device.streams) ? device.streams : [];

    console.log(`Aparelho ${String(device.host)}`);
    console.log(`  Fabricante: ${String(device.vendor ?? "não identificado")}`);
    console.log(`  Modelo:     ${String(device.model ?? "não identificado")}`);
    console.log(`  ONVIF:      ${device.onvifSupported ? "sim" : "não"}`);
    console.log(`  ID:         ${String(device.deviceId)}`);

    if (streams.length === 0) {
      const failure = device.failure as Record<string, unknown> | null;
      console.log(`  Sem vídeo:  ${String(failure?.message ?? "nenhum stream validado")}`);
      console.log("");
      continue;
    }

    for (const rawStream of streams) {
      const stream = rawStream as Record<string, unknown>;
      console.log(
        `  [${String(stream.index)}] ${String(stream.stream)} · ` +
          `${String(stream.codec ?? "?")} ${String(stream.width ?? "?")}x${String(stream.height ?? "?")} · ` +
          `${String(stream.level)}`,
      );
    }

    console.log("");
    console.log("  Para vincular a uma câmera do painel:");
    console.log(
      `    monitoria-agent bind --device ${String(device.deviceId)} --camera <id-da-camera>`,
    );
    console.log("");
  }
}

async function commandBind() {
  const deviceId = argumentValue("--device") ?? (await promptText("ID do aparelho"));
  const cameraId = argumentValue("--camera") ?? (await promptText("ID da câmera no painel"));
  const streamIndex = Number(argumentValue("--stream") ?? "0");

  const result = await callAgent("discovery.bind", {
    deviceId: deviceId.trim(),
    cameraId: cameraId.trim(),
    streamIndex: Number.isFinite(streamIndex) ? streamIndex : 0,
  });

  console.log("Câmera vinculada.");
  console.log(`Caminho: ${String(result.displayPath)}`);
  console.log(
    `Vídeo:   ${String(result.codec ?? "?")} ${String(result.width ?? "?")}x${String(result.height ?? "?")}`,
  );
}

async function commandStatus() {
  const status = await callAgent("status");
  const queue = (status.queue ?? {}) as Record<string, unknown>;

  console.log(`\nMonitorIA Agent v${String(status.version)}`);
  console.log(`Serviço no ar desde: ${String(status.startedAt)}`);
  console.log(`Pareado: ${status.paired ? "sim" : "não"}`);

  if (status.unauthorized) {
    console.log(
      status.everAuthenticated
        ? "\nATENÇÃO: o token foi recusado pelo servidor. Se o pareamento foi " +
            "removido no painel, gere um novo código."
        : "\nATENÇÃO: o servidor recusou o token e este Agent nunca autenticou. " +
            "Isso costuma ser endereço de servidor errado, não token revogado. " +
            "Confira o --url usado no pareamento.",
    );
  }

  if (status.paired) {
    console.log(`Nome: ${String(status.agentName)}`);
    console.log(`Servidor: ${String(status.apiBaseUrl)}`);
    console.log(`Último heartbeat: ${String(status.lastHeartbeatAt ?? "nunca")}`);
    console.log(`Última sincronização: ${String(status.lastSyncAt ?? "nunca")}`);
    console.log(
      `Câmeras: ${String(status.camerasRunning)} monitorando de ${String(status.camerasKnown)}`,
    );
  }

  console.log(`\nFila: ${String(queue.pending ?? 0)} evento(s), ${bytes(queue.totalBytes)}`);

  if (Number(queue.dropped ?? 0) > 0) {
    console.log(`Descartados por limite de disco ou idade: ${String(queue.dropped)}`);
  }

  if (Number(queue.rejected ?? 0) > 0) {
    console.log(`Recusados pelo servidor: ${String(queue.rejected)}`);
  }
}

/**
 * Relatório de rede para levar à visita ao cliente.
 *
 * Existe porque descobrir por que uma câmera não entrou exigia hoje ler o
 * log bruto do serviço. Num cliente com gravador, isso significa sair da
 * loja sem resposta. O relatório mostra o que respondeu, em que porta, e o
 * que o ONVIF disse — que é o suficiente para saber se o caso é porta
 * fechada, credencial recusada ou canal não enumerado.
 *
 * Não imprime senha nem URL completa.
 */
async function commandScanReport() {
  const host = argumentValue("--host");
  const username = argumentValue("--username") ?? "admin";
  const password = argumentValue("--password") ?? "";

  console.log("Procurando aparelhos na rede...");

  const devices = await discoverDevices({
    log: (message) => console.log(`  ${message}`),
    ...(host ? { hosts: [host] } : {}),
  });

  if (devices.length === 0) {
    console.log("Nenhum aparelho respondeu. Verifique se está na mesma rede.");
    return;
  }

  console.log(`\n${devices.length} aparelho(s) encontrado(s).\n`);

  for (const device of devices) {
    const mac = await macForHost(device.host);

    console.log(`=== ${device.host} ===`);
    console.log(`  origem:  ${device.source}`);
    console.log(`  mac:     ${mac ?? "não encontrado na tabela ARP"}`);
    console.log(`  nome:    ${device.nameHint ?? "-"}`);

    const resultado = await discoverDeviceStreams({
      device,
      credentials: { username, password },
      channels: [1, 2, 3, 4, 5, 6, 7, 8],
      log: (message: string) => console.log(`    ${message}`),
    });

    console.log(`  onvif:   ${resultado.onvifSupported ? "sim" : "não"}`);
    console.log(`  marca:   ${resultado.information?.manufacturer ?? "-"}`);
    console.log(`  modelo:  ${resultado.information?.model ?? "-"}`);

    const canais = new Set(
      resultado.streams
        .filter((item) => item.validation.success)
        .map((item) => item.channel),
    );

    console.log(`  canais com vídeo: ${canais.size > 0 ? [...canais].join(", ") : "nenhum"}`);

    for (const stream of resultado.streams) {
      const estado = stream.validation.success
        ? `ok ${stream.validation.width ?? "?"}x${stream.validation.height ?? "?"} ${stream.validation.codec ?? ""}`
        : (stream.validation.errorCode ?? "falhou");
      console.log(
        `    canal ${stream.channel} porta ${stream.port} ${stream.stream}: ${estado}`,
      );
    }

    if (resultado.failure) {
      console.log(`  falha:   ${resultado.failure.code} — ${resultado.failure.message}`);
    }

    console.log("");
  }

  console.log("Copie tudo acima e envie para análise.");
}

async function commandDiagnose() {
  const report = await callAgent("diagnose");
  const queue = (report.queue ?? {}) as Record<string, unknown>;
  const logs = (report.logs ?? {}) as Record<string, unknown>;

  const ok = (value: boolean) => (value ? "OK" : "FALHA");

  console.log(`\nDiagnóstico do MonitorIA Agent v${String(report.version)}\n`);
  console.log(`Pasta de dados      ${String(report.dataDirectory)}`);
  console.log(
    `Permissões da pasta ${
      report.aclRestricted === null
        ? "não verificadas (só o serviço gerencia)"
        : ok(Boolean(report.aclRestricted))
    }`,
  );
  console.log(`Configuração        ${ok(Boolean(report.configPresent))}`);

  const tokenState = String(report.tokenState ?? "missing");
  const tokenTexto =
    tokenState === "ok"
      ? report.unauthorized
        ? "FALHA · recusado pelo servidor"
        : "OK"
      : tokenState === "locked"
        ? "FALHA · não foi possível decifrar nesta máquina"
        : "FALHA · nenhum token gravado";

  console.log(`Token               ${tokenTexto}`);

  if (report.unauthorized && !report.everAuthenticated) {
    console.log(
      "                    (nunca autenticou: verifique o endereço do servidor)",
    );
  }
  console.log(
    `FFmpeg              ${report.ffmpeg ? `OK · ${String(report.ffmpeg)}` : `FALHA · ${String(report.ffmpegError)}`}`,
  );
  console.log(`Canal local         ${String(report.transport ?? "—")}`);
  console.log(
    `Fila                ${String(queue.pending ?? 0)} pendente(s), ${bytes(queue.totalBytes)}`,
  );
  console.log(
    `Logs                ${String(logs.files ?? 0)} arquivo(s), ${bytes(logs.totalBytes)}`,
  );

  const falhas = Array.isArray(report.cameraFailures) ? report.cameraFailures : [];

  if (falhas.length > 0) {
    console.log("\nCâmeras com problema:");

    for (const item of falhas) {
      const falha = item as Record<string, unknown>;
      console.log(`  ${String(falha.cameraId)} · ${String(falha.code)}`);
      console.log(`    ${String(falha.message)}`);
      console.log(`    Nova tentativa: ${String(falha.nextAttemptAt)}`);
    }
  }

  if (report.aclRestricted === false) {
    console.log(
      "\nA pasta de dados não está protegida. Reinstale o MonitorIA como administrador.",
    );
  }
}

async function commandSync() {
  const result = await callAgent("sync");
  console.log(`Sincronizado. ${String(result.cameras)} câmera(s) conhecidas.`);
}

async function commandUnpair() {
  const confirmation = await promptText(
    'Isto apaga o pareamento deste computador. Digite "remover" para confirmar',
  );

  if (confirmation.trim().toLowerCase() !== "remover") {
    console.log("Operação cancelada.");
    return;
  }

  await callAgent("unpair");
  console.log("Pareamento removido. Gere um novo código no painel para parear de novo.");
}

// ------------------------------------------------------------------- autoteste

async function runSelfTest() {
  const sample = "MonitorIA DPAPI autoteste: çã 🔐";
  const protectedValue = await protectSecret(sample);
  const restored = await revealSecret(protectedValue);

  if (restored.value !== sample) {
    throw new Error("O autoteste do DPAPI devolveu um valor diferente do original.");
  }

  const previous = Buffer.alloc(100, 0);
  const current = Buffer.alloc(100, 0);
  current.fill(255, 0, 25);

  const motion = calculateMotion(previous, current);
  if (Math.abs(motion.changedPixelPercent - 25) > 0.001) {
    throw new Error("O autoteste de movimento não calculou 25% de alteração.");
  }

  const mask = Buffer.alloc(100, 0);
  mask.fill(1, 0, 25);

  if (calculateMotion(previous, current, 20, mask).changedPixelPercent !== 0) {
    throw new Error("O autoteste da máscara de movimento falhou.");
  }

  const calibration = new AdaptiveMotionCalibration();
  for (let index = 0; index < 40; index += 1) calibration.observe(1.2, 1, true);

  const calibrated = calibration.snapshot(1, 0.25, true);

  if (!calibrated.ready || calibrated.effectiveStartThreshold <= 1) {
    throw new Error("O autoteste da calibração adaptativa falhou.");
  }

  const layout = await resolvePaths();

  console.log("Autoteste concluído com sucesso.");
  console.log(`Pasta de dados: ${layout.root}`);
  console.log(`Permissões restritas: ${layout.restricted ? "sim" : "não"}`);
}

async function commandReset() {
  const existing = await loadConfig();

  if (!existing) {
    console.log("Não há configuração local para remover.");
    return;
  }

  const confirmation = await promptText(
    'Isto apaga a configuração local. Digite "remover" para confirmar',
  );

  if (confirmation.trim().toLowerCase() !== "remover") {
    console.log("Operação cancelada.");
    return;
  }

  await removeConfig();
  forgetPaths();
  console.log("Configuração local removida.");
}

// ----------------------------------------------------------------------- main

async function main() {
  const command = process.argv[2]?.toLowerCase() ?? "status";

  switch (command) {
    case "service":
      await runService(false);
      return;
    case "run":
      // Mesmo runtime, com log espelhado no console. Para depuração local.
      await runService(true);
      return;
    case "pair":
      await commandPair();
      return;
    case "setup":
      await commandSetup();
      return;
    case "paired-check":
      await commandCheckReady(false);
      return;
    case "ready-check":
      await commandCheckReady(true);
      return;
    case "camera":
      await commandCamera();
      return;
    case "discover":
      await commandDiscover();
      return;
    case "bind":
      await commandBind();
      return;
    case "status":
      await commandStatus();
      return;
    case "diagnose":
      await commandDiagnose();
      return;
    case "scan-report":
      await commandScanReport();
      return;
    case "sync":
      await commandSync();
      return;
    case "unpair":
      await commandUnpair();
      return;
    case "self-test":
      await runSelfTest();
      return;
    case "reset":
      await commandReset();
      return;
    case "version":
      console.log(AGENT_VERSION);
      return;
    default:
      usage();
  }
}

/**
 * Códigos de saída, consumidos pelo instalador.
 *
 * O instalador não consegue ler a saída de texto, só o código de retorno.
 * Sem distinguir os casos, ele atribuía toda falha de pareamento a "código
 * expirado" — inclusive quando a causa era falta de permissão, o que mandava
 * o operador gerar códigos novos indefinidamente sem resolver nada.
 */
const EXIT = {
  ERRO_GERAL: 1,
  SERVICO_PARADO: 4,
  SEM_PERMISSAO: 5,
  PAREAMENTO_RECUSADO: 6,
  CONFIGURACAO_INCOMPLETA: 7,
  CAMERA_NAO_CONFIGURADA: 8,
  ENTRADA_INVALIDA: 9,
} as const;

function exitCodeFor(error: unknown) {
  if (error instanceof AgentNotRunningError) return EXIT.SERVICO_PARADO;
  if (error instanceof AgentAccessDeniedError) return EXIT.SEM_PERMISSAO;
  if (error instanceof PermissionError) return EXIT.SEM_PERMISSAO;
  if (error instanceof SetupError) {
    return error.kind === "camera"
      ? EXIT.CAMERA_NAO_CONFIGURADA
      : EXIT.ENTRADA_INVALIDA;
  }

  if (error instanceof Error && error.message.startsWith("Pareamento recusado")) {
    return EXIT.PAREAMENTO_RECUSADO;
  }

  return EXIT.ERRO_GERAL;
}

main()
  .catch((error: unknown) => {
    console.error(`Erro: ${errorMessage(error)}`);
    process.exitCode = exitCodeFor(error);
  })
  .finally(() => {
    closePrompt();
  });
