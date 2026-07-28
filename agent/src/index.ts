import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ApiError,
  fetchAgentConfig,
  pairAgent,
  sendCameraStatus,
  sendHeartbeat,
  uploadSnapshot,
} from "./api.js";
import { closePrompt, promptSecret, promptText } from "./cli.js";
import {
  configPath,
  loadConfig,
  removeConfig,
  resolveConfigDirectory,
  saveConfig,
} from "./config.js";
import { protectSecret, unprotectSecret } from "./dpapi.js";
import { captureFrame, resolveFfmpeg } from "./ffmpeg.js";
import { platformMetadata, systemMetrics } from "./system.js";
import type {
  RemoteCamera,
  StoredAgentConfig,
} from "./types.js";

const AGENT_VERSION = "0.5.3";
const DEFAULT_API_URL = "https://monitoria.bigcorps.com.br";
const HEARTBEAT_INTERVAL_MS = 60_000;
const CAMERA_CHECK_INTERVAL_MS = 5 * 60_000;
const CONFIG_SYNC_INTERVAL_MS = 5 * 60_000;

function log(message: string) {
  console.log(`[${new Date().toLocaleString("pt-BR")}] ${message}`);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function setupAgent(): Promise<StoredAgentConfig> {
  console.log("\nMonitorIA Agent — configuração inicial\n");

  const apiBaseUrl = await promptText("Endereço do MonitorIA", DEFAULT_API_URL);
  const code = await promptText("Código de pareamento");
  const defaultName = `Agent ${os.hostname()}`;
  const agentName = await promptText("Nome do Agent", defaultName);

  if (!code) throw new Error("O código de pareamento é obrigatório.");

  log("Validando código de pareamento...");
  const paired = await pairAgent(apiBaseUrl, {
    code,
    agentName,
    platform: process.platform,
    architecture: process.arch,
    version: AGENT_VERSION,
    metadata: platformMetadata(),
  });

  const rtspUrl = await promptSecret(
    `URL RTSP da câmera "${paired.camera.name}"`,
  );
  if (!rtspUrl.toLowerCase().startsWith("rtsp://")) {
    throw new Error("A URL precisa começar com rtsp://");
  }

  const protectedAgentToken = await protectSecret(paired.agent.token);
  const protectedRtsp = await protectSecret(rtspUrl);

  const config: StoredAgentConfig = {
    schemaVersion: 1,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    agentId: paired.agent.id,
    agentName,
    protectedAgentToken,
    pairedAt: new Date().toISOString(),
    cameras: {
      [paired.camera.id]: {
        protectedRtsp,
        configuredAt: new Date().toISOString(),
      },
    },
  };

  const savedAt = await saveConfig(config);
  log(`Configuração protegida salva em: ${savedAt}`);
  return config;
}

async function ensureCameraSecrets(
  config: StoredAgentConfig,
  cameras: RemoteCamera[],
) {
  let changed = false;

  for (const camera of cameras) {
    if (config.cameras[camera.id]?.protectedRtsp) continue;

    if (!process.stdin.isTTY) {
      log(`A câmera "${camera.name}" ainda não possui RTSP local configurado.`);
      continue;
    }

    const rtspUrl = await promptSecret(`URL RTSP da câmera "${camera.name}"`);
    if (!rtspUrl.toLowerCase().startsWith("rtsp://")) {
      log(`URL ignorada para "${camera.name}": precisa começar com rtsp://.`);
      continue;
    }

    config.cameras[camera.id] = {
      protectedRtsp: await protectSecret(rtspUrl),
      configuredAt: new Date().toISOString(),
    };
    changed = true;
  }

  if (changed) {
    await saveConfig(config);
  }
}

async function checkCamera(
  config: StoredAgentConfig,
  token: string,
  ffmpegPath: string,
  camera: RemoteCamera,
  uploadFirstFrame: boolean,
) {
  const local = config.cameras[camera.id];
  if (!local) return;

  let framePath: string | null = null;

  try {
    const rtspUrl = await unprotectSecret(local.protectedRtsp);
    log(`Testando câmera "${camera.name}"...`);
    const frame = await captureFrame(ffmpegPath, rtspUrl, camera.id);
    framePath = frame.path;

    if (uploadFirstFrame) {
      const response = await uploadSnapshot(
        config.apiBaseUrl,
        token,
        camera.id,
        frame,
        "stream0",
      );
      local.lastSnapshotUploadedAt = response.capturedAt;
      await saveConfig(config);
      log(
        `Primeiro frame de "${camera.name}" enviado (${frame.width ?? "?"}x${frame.height ?? "?"}, ${frame.byteSize} bytes).`,
      );
    } else {
      await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
        status: "online",
        streamLabel: "stream0",
        metadata: {
          width: frame.width,
          height: frame.height,
          byteSize: frame.byteSize,
        },
      });
      log(`Câmera "${camera.name}" está online.`);
    }
  } catch (error) {
    const message = errorMessage(error);
    log(`Falha na câmera "${camera.name}": ${message}`);

    try {
      await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
        status: "error",
        errorCode: "rtsp_capture_failed",
        errorMessage: message,
      });
    } catch (statusError) {
      log(`Não foi possível informar o erro ao servidor: ${errorMessage(statusError)}`);
    }
  } finally {
    if (framePath) {
      await rm(framePath, { force: true });
    }
  }
}

async function sendCurrentHeartbeat(
  config: StoredAgentConfig,
  token: string,
) {
  const directory = await resolveConfigDirectory();
  const metrics = await systemMetrics(directory);

  await sendHeartbeat(config.apiBaseUrl, token, {
    version: AGENT_VERSION,
    platform: process.platform,
    architecture: process.arch,
    ...metrics,
    metadata: platformMetadata(),
  });
}

async function runAgent(config: StoredAgentConfig) {
  const token = await unprotectSecret(config.protectedAgentToken);
  const ffmpegPath = await resolveFfmpeg();

  log(`FFmpeg localizado: ${ffmpegPath}`);
  log("Carregando configuração das câmeras...");

  let remote = await fetchAgentConfig(config.apiBaseUrl, token);
  await ensureCameraSecrets(config, remote.cameras);

  for (const camera of remote.cameras) {
    const firstFrameMissing = !config.cameras[camera.id]?.lastSnapshotUploadedAt;
    await checkCamera(config, token, ffmpegPath, camera, firstFrameMissing);
  }

  await sendCurrentHeartbeat(config, token);
  log("Agent online. Heartbeat a cada 60 segundos.");

  let heartbeatRunning = false;
  let cameraCheckRunning = false;
  let configSyncRunning = false;

  const heartbeatTimer = setInterval(async () => {
    if (heartbeatRunning) return;
    heartbeatRunning = true;
    try {
      await sendCurrentHeartbeat(config, token);
      log("Heartbeat enviado.");
    } catch (error) {
      log(`Falha no heartbeat: ${errorMessage(error)}`);
    } finally {
      heartbeatRunning = false;
    }
  }, HEARTBEAT_INTERVAL_MS);

  const cameraTimer = setInterval(async () => {
    if (cameraCheckRunning) return;
    cameraCheckRunning = true;

    try {
      for (const camera of remote.cameras) {
        await checkCamera(config, token, ffmpegPath, camera, false);
      }
    } finally {
      cameraCheckRunning = false;
    }
  }, CAMERA_CHECK_INTERVAL_MS);

  const configTimer = setInterval(async () => {
    if (configSyncRunning) return;
    configSyncRunning = true;

    try {
      remote = await fetchAgentConfig(config.apiBaseUrl, token);
      await ensureCameraSecrets(config, remote.cameras);
      log(`Configuração sincronizada: ${remote.cameras.length} câmera(s).`);
    } catch (error) {
      log(`Falha ao sincronizar configuração: ${errorMessage(error)}`);
    } finally {
      configSyncRunning = false;
    }
  }, CONFIG_SYNC_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(heartbeatTimer);
    clearInterval(cameraTimer);
    clearInterval(configTimer);

    log("Encerrando o Agent...");
    for (const camera of remote.cameras) {
      try {
        await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
          status: "offline",
          metadata: { reason: "agent_shutdown" },
        });
      } catch {
        // O encerramento não deve ficar preso por falha de rede.
      }
    }

    closePrompt();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise(() => {
    // Mantém o processo em execução.
  });
}

async function showStatus(config: StoredAgentConfig) {
  const token = await unprotectSecret(config.protectedAgentToken);
  const remote = await fetchAgentConfig(config.apiBaseUrl, token);

  console.log(`\nAgent: ${remote.agent.name}`);
  console.log(`ID: ${remote.agent.id}`);
  console.log(`API: ${config.apiBaseUrl}`);
  console.log(`Configuração: ${await configPath()}`);
  console.log(`Câmeras: ${remote.cameras.length}`);

  for (const camera of remote.cameras) {
    console.log(
      `- ${camera.name}: servidor=${camera.status}, RTSP local=${
        config.cameras[camera.id] ? "configurado" : "ausente"
      }`,
    );
  }
}

async function main() {
  const command = process.argv[2]?.toLowerCase() ?? "run";

  if (command === "reset") {
    await removeConfig();
    console.log("Configuração local removida. Gere um novo código de pareamento.");
    return;
  }

  let config = await loadConfig();

  if (command === "setup") {
    if (config) {
      throw new Error(
        'Já existe uma configuração. Execute "monitoria-agent reset" antes de parear novamente.',
      );
    }
    config = await setupAgent();
  } else if (!config) {
    config = await setupAgent();
  }

  if (command === "status") {
    await showStatus(config);
    return;
  }

  if (command !== "run" && command !== "setup") {
    console.log("Uso:");
    console.log("  monitoria-agent           Inicia ou configura o Agent");
    console.log("  monitoria-agent run       Inicia o Agent");
    console.log("  monitoria-agent status    Mostra a configuração remota");
    console.log("  monitoria-agent reset     Remove a configuração local");
    return;
  }

  await runAgent(config);
}

main()
  .catch((error) => {
    if (error instanceof ApiError && error.status === 401) {
      console.error(
        "Token do Agent recusado. Gere outro código de pareamento e execute o comando reset.",
      );
    } else {
      console.error(`Erro: ${errorMessage(error)}`);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    closePrompt();
  });
