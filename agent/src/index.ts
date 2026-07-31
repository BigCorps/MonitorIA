import { rm } from "node:fs/promises";
import os from "node:os";
import {
  ApiError,
  closeCaptureSession,
  fetchAgentConfig,
  pairAgent,
  sendCameraStatus,
  sendHeartbeat,
  startCaptureSession,
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
import { EventSubmissionQueue } from "./event-queue.js";
import {
  startCameraEventMonitor,
  type CameraEventMonitor,
} from "./event-monitor.js";
import { captureFrame, resolveFfmpeg } from "./ffmpeg.js";
import { calculateMotion } from "./motion.js";
import { AdaptiveMotionCalibration } from "./motion-calibration.js";
import { platformMetadata, systemMetrics } from "./system.js";
import type {
  RemoteCamera,
  StoredAgentConfig,
} from "./types.js";

const AGENT_VERSION = "0.8.1";
const DEFAULT_API_URL = "https://monitoria.cam";
const HEARTBEAT_INTERVAL_MS = 60_000;
const CAMERA_CHECK_INTERVAL_MS = 5 * 60_000;
const CONFIG_SYNC_INTERVAL_MS = 5 * 60_000;

type CameraRuntime = {
  signature: string;
  sessionId: string;
  monitor: CameraEventMonitor;
};

function log(message: string) {
  console.log(
    `[${new Date().toLocaleString("pt-BR")}] ${message}`,
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function cameraSignature(camera: RemoteCamera) {
  return JSON.stringify({
    profile: camera.activeProfileId,
    profileVersion: camera.activeProfileVersion,
    plan: camera.plan,
    capture: camera.captureIntervalSeconds,
    consolidation: camera.consolidationIntervalSeconds,
    start: camera.motionStartThreshold,
    continue: camera.motionContinueThreshold,
    close: camera.eventCloseAfterSeconds,
    adaptive: camera.motionAdaptiveEnabled,
    overlay: camera.motionOverlayMask,
    startFrames: camera.motionStartConsecutiveFrames,
    endFrames: camera.motionEndConsecutiveFrames,
    cooldown: camera.motionCooldownSeconds,
    schedule: camera.monitoringSchedule,
    ignore: camera.motionIgnorePolygons,
  });
}

async function setupAgent(): Promise<StoredAgentConfig> {
  console.log("\nMonitorIA Agent — configuração inicial\n");

  log("Verificando proteção segura do Windows...");
  await runSelfTest();

  const apiBaseUrl = await promptText(
    "Endereço do MonitorIA",
    DEFAULT_API_URL,
  );
  const code = await promptText("Código de pareamento");
  const defaultName = `Agent ${os.hostname()}`;
  const agentName = await promptText(
    "Nome do Agent",
    defaultName,
  );

  if (!code) {
    throw new Error("O código de pareamento é obrigatório.");
  }

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

  const config: StoredAgentConfig = {
    schemaVersion: 1,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
    agentId: paired.agent.id,
    agentName,
    protectedAgentToken: await protectSecret(
      paired.agent.token,
    ),
    pairedAt: new Date().toISOString(),
    cameras: {
      [paired.camera.id]: {
        protectedRtsp: await protectSecret(rtspUrl),
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
      log(
        `A câmera "${camera.name}" ainda não possui RTSP local configurado.`,
      );
      continue;
    }

    const rtspUrl = await promptSecret(
      `URL RTSP da câmera "${camera.name}"`,
    );

    if (!rtspUrl.toLowerCase().startsWith("rtsp://")) {
      log(
        `URL ignorada para "${camera.name}": precisa começar com rtsp://.`,
      );
      continue;
    }

    config.cameras[camera.id] = {
      protectedRtsp: await protectSecret(rtspUrl),
      configuredAt: new Date().toISOString(),
    };
    changed = true;
  }

  if (changed) await saveConfig(config);
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

    const frame = await captureFrame(
      ffmpegPath,
      rtspUrl,
      camera.id,
      { prefix: "health" },
    );
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
      await sendCameraStatus(
        config.apiBaseUrl,
        token,
        camera.id,
        {
          status: "online",
          streamLabel: "stream0",
          metadata: {
            width: frame.width,
            height: frame.height,
            byteSize: frame.byteSize,
          },
        },
      );

      log(`Câmera "${camera.name}" está online.`);
    }
  } catch (error) {
    const message = errorMessage(error);
    log(`Falha na câmera "${camera.name}": ${message}`);

    try {
      await sendCameraStatus(
        config.apiBaseUrl,
        token,
        camera.id,
        {
          status: "error",
          errorCode: "rtsp_capture_failed",
          errorMessage: message,
        },
      );
    } catch (statusError) {
      log(
        `Não foi possível informar o erro ao servidor: ${errorMessage(statusError)}`,
      );
    }
  } finally {
    if (framePath) await rm(framePath, { force: true });
  }
}

async function sendCurrentHeartbeat(
  config: StoredAgentConfig,
  token: string,
  queuedEvents: number,
) {
  const directory = await resolveConfigDirectory();
  const metrics = await systemMetrics(directory, queuedEvents);

  await sendHeartbeat(config.apiBaseUrl, token, {
    version: AGENT_VERSION,
    platform: process.platform,
    architecture: process.arch,
    ...metrics,
    metadata: platformMetadata(),
  });
}

async function runAgent(config: StoredAgentConfig) {
  const token = await unprotectSecret(
    config.protectedAgentToken,
  );
  const ffmpegPath = await resolveFfmpeg();

  log(`FFmpeg localizado: ${ffmpegPath}`);
  log("Carregando configuração das câmeras...");

  let remote = await fetchAgentConfig(
    config.apiBaseUrl,
    token,
  );

  await ensureCameraSecrets(config, remote.cameras);

  for (const camera of remote.cameras) {
    const firstFrameMissing =
      !config.cameras[camera.id]?.lastSnapshotUploadedAt;

    await checkCamera(
      config,
      token,
      ffmpegPath,
      camera,
      firstFrameMissing,
    );
  }

  const eventQueue = new EventSubmissionQueue({
    baseUrl: config.apiBaseUrl,
    token,
    log,
    limit: 10,
  });

  const runtimes = new Map<string, CameraRuntime>();

  const stopRuntime = async (
    cameraId: string,
    reason: string,
  ) => {
    const runtime = runtimes.get(cameraId);
    if (!runtime) return;

    runtimes.delete(cameraId);

    try {
      await runtime.monitor.stop(reason);
    } catch (error) {
      log(
        `Falha ao parar monitor ${cameraId}: ${errorMessage(error)}`,
      );
    }

    try {
      await closeCaptureSession(
        config.apiBaseUrl,
        token,
        cameraId,
        runtime.sessionId,
        reason,
      );
    } catch (error) {
      log(
        `Falha ao encerrar sessão ${runtime.sessionId}: ${errorMessage(error)}`,
      );
    }
  };

  const syncMonitoring = async (
    cameras: RemoteCamera[],
  ) => {
    const configuredIds = new Set(
      cameras.map((camera) => camera.id),
    );

    for (const cameraId of [...runtimes.keys()]) {
      if (!configuredIds.has(cameraId)) {
        await stopRuntime(cameraId, "camera_removed");
      }
    }

    for (const camera of cameras) {
      const existing = runtimes.get(camera.id);
      const signature = cameraSignature(camera);

      if (
        !camera.monitoringEnabled ||
        !camera.activeProfileId ||
        !camera.activeProfileVersion
      ) {
        if (existing) {
          await stopRuntime(
            camera.id,
            "active_profile_removed",
          );
        }

        log(
          `Monitoramento de "${camera.name}" aguardando perfil ativo.`,
        );
        continue;
      }

      const local = config.cameras[camera.id];
      if (!local?.protectedRtsp) continue;

      if (
        existing &&
        existing.signature === signature &&
        existing.monitor.isRunning()
      ) {
        continue;
      }

      if (existing) {
        await stopRuntime(
          camera.id,
          "configuration_changed",
        );
      }

      try {
        const rtspUrl = await unprotectSecret(
          local.protectedRtsp,
        );

        const session = await startCaptureSession(
          config.apiBaseUrl,
          token,
          camera.id,
          {
            agentVersion: AGENT_VERSION,
            profileId: camera.activeProfileId,
            profileVersion: camera.activeProfileVersion,
            planCode: camera.plan,
            captureIntervalSeconds:
              camera.captureIntervalSeconds,
            consolidationIntervalSeconds:
              camera.consolidationIntervalSeconds,
            motionAdaptiveEnabled:
              camera.motionAdaptiveEnabled,
            motionOverlayMask:
              camera.motionOverlayMask,
            monitoringSchedule:
              camera.monitoringSchedule,
          },
        );

        const monitor = startCameraEventMonitor({
          camera,
          ffmpegPath,
          rtspUrl,
          sessionId: session.sessionId,
          enqueue: (event) => eventQueue.enqueue(event),
          log,
          onFatalError: (error) => {
            log(
              `Monitor contínuo de "${camera.name}" falhou: ${error.message}`,
            );

            void sendCameraStatus(
              config.apiBaseUrl,
              token,
              camera.id,
              {
                status: "error",
                errorCode: "continuous_monitor_failed",
                errorMessage: error.message,
              },
            ).catch(() => {});
          },
        });

        runtimes.set(camera.id, {
          signature,
          sessionId: session.sessionId,
          monitor,
        });

        log(
          `Monitoramento ${camera.plan} iniciado em "${camera.name}" · perfil v${camera.activeProfileVersion}. Calibração inicial em andamento.`,
        );
      } catch (error) {
        log(
          `Não foi possível iniciar o monitor de "${camera.name}": ${errorMessage(error)}`,
        );
      }
    }
  };

  await syncMonitoring(remote.cameras);
  await sendCurrentHeartbeat(
    config,
    token,
    eventQueue.size(),
  );

  log(
    "Agent online. Heartbeat a cada 60 segundos, segmentação adaptativa e capítulos de atividade ativos.",
  );

  let heartbeatRunning = false;
  let cameraCheckRunning = false;
  let configSyncRunning = false;
  let shuttingDown = false;

  const heartbeatTimer = setInterval(async () => {
    if (heartbeatRunning || shuttingDown) return;

    heartbeatRunning = true;

    try {
      await sendCurrentHeartbeat(
        config,
        token,
        eventQueue.size(),
      );
      log("Heartbeat enviado.");
    } catch (error) {
      log(`Falha no heartbeat: ${errorMessage(error)}`);
    } finally {
      heartbeatRunning = false;
    }
  }, HEARTBEAT_INTERVAL_MS);

  const cameraTimer = setInterval(async () => {
    if (cameraCheckRunning || shuttingDown) return;

    cameraCheckRunning = true;

    try {
      await syncMonitoring(remote.cameras);

      for (const camera of remote.cameras) {
        const runtime = runtimes.get(camera.id);

        if (runtime?.monitor.isRunning()) {
          const calibration =
            runtime.monitor.calibrationSnapshot();

          await sendCameraStatus(
            config.apiBaseUrl,
            token,
            camera.id,
            {
              status: "online",
              streamLabel: "stream0",
              metadata: {
                continuousMonitoring: true,
                activeProfileVersion:
                  camera.activeProfileVersion,
                planCode: camera.plan,
                framesObserved:
                  runtime.monitor.framesObserved(),
                calibration,
              },
            },
          );
        } else {
          await checkCamera(
            config,
            token,
            ffmpegPath,
            camera,
            false,
          );
        }
      }
    } finally {
      cameraCheckRunning = false;
    }
  }, CAMERA_CHECK_INTERVAL_MS);

  const configTimer = setInterval(async () => {
    if (configSyncRunning || shuttingDown) return;

    configSyncRunning = true;

    try {
      remote = await fetchAgentConfig(
        config.apiBaseUrl,
        token,
      );

      await ensureCameraSecrets(config, remote.cameras);
      await syncMonitoring(remote.cameras);

      log(
        `Configuração sincronizada: ${remote.cameras.length} câmera(s).`,
      );
    } catch (error) {
      log(
        `Falha ao sincronizar configuração: ${errorMessage(error)}`,
      );
    } finally {
      configSyncRunning = false;
    }
  }, CONFIG_SYNC_INTERVAL_MS);

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    clearInterval(heartbeatTimer);
    clearInterval(cameraTimer);
    clearInterval(configTimer);

    log("Encerrando o Agent...");

    for (const cameraId of [...runtimes.keys()]) {
      await stopRuntime(cameraId, "agent_shutdown");
    }

    await eventQueue.stop(20_000);

    for (const camera of remote.cameras) {
      try {
        await sendCameraStatus(
          config.apiBaseUrl,
          token,
          camera.id,
          {
            status: "offline",
            metadata: { reason: "agent_shutdown" },
          },
        );
      } catch {}
    }

    closePrompt();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await new Promise(() => {});
}

async function showStatus(config: StoredAgentConfig) {
  const token = await unprotectSecret(
    config.protectedAgentToken,
  );
  const remote = await fetchAgentConfig(
    config.apiBaseUrl,
    token,
  );

  console.log(`\nAgent: ${remote.agent.name}`);
  console.log(`ID: ${remote.agent.id}`);
  console.log(`Versão local: ${AGENT_VERSION}`);
  console.log(`API: ${config.apiBaseUrl}`);
  console.log(`Configuração: ${await configPath()}`);
  console.log(`Câmeras: ${remote.cameras.length}`);

  for (const camera of remote.cameras) {
    console.log(
      `- ${camera.name}: servidor=${camera.status}, RTSP local=${
        config.cameras[camera.id]
          ? "configurado"
          : "ausente"
      }, monitoramento=${
        camera.monitoringEnabled
          ? `ativo (${camera.plan}, perfil v${camera.activeProfileVersion})`
          : "aguardando perfil"
      }`,
    );
  }
}

async function runSelfTest() {
  const sample = "MonitorIA DPAPI autoteste: çã 🔐";
  const protectedValue = await protectSecret(sample);
  const restoredValue = await unprotectSecret(
    protectedValue,
  );

  if (restoredValue !== sample) {
    throw new Error(
      "O autoteste do DPAPI devolveu um valor diferente do original.",
    );
  }

  const previous = Buffer.alloc(100, 0);
  const current = Buffer.alloc(100, 0);
  current.fill(255, 0, 25);

  const motion = calculateMotion(previous, current);
  if (Math.abs(motion.changedPixelPercent - 25) > 0.001) {
    throw new Error(
      "O autoteste de movimento não calculou 25% de alteração.",
    );
  }

  const mask = Buffer.alloc(100, 0);
  mask.fill(1, 0, 25);
  const masked = calculateMotion(previous, current, 20, mask);

  if (masked.changedPixelPercent !== 0) {
    throw new Error(
      "O autoteste da máscara de movimento falhou.",
    );
  }

  const calibration = new AdaptiveMotionCalibration();
  for (let index = 0; index < 40; index += 1) {
    calibration.observe(1.2, 1, true);
  }

  const calibrated = calibration.snapshot(
    1,
    0.25,
    true,
  );

  if (
    !calibrated.ready ||
    calibrated.effectiveStartThreshold <= 1
  ) {
    throw new Error(
      "O autoteste da calibração adaptativa falhou.",
    );
  }

  console.log(
    "Autoteste do DPAPI, máscara e calibração de movimento concluído com sucesso.",
  );
}

async function main() {
  const command =
    process.argv[2]?.toLowerCase() ?? "run";

  if (command === "self-test") {
    await runSelfTest();
    return;
  }

  if (command === "reset") {
    await removeConfig();
    console.log(
      "Configuração local removida. Gere um novo código de pareamento.",
    );
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
    console.log("  monitoria-agent self-test Testa DPAPI e segmentação");
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
