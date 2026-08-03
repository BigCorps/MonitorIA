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
  submitCameraEvent,
  uploadSnapshot,
} from "./api.js";
import {
  loadConfig,
  removeConfig,
  resolveConfigDirectory,
  saveConfig,
  type StoredAgentConfigV2,
} from "./config.js";
import { captureFrame, resolveFfmpeg } from "./ffmpeg.js";
import { IpcError, type IpcHandlerMap } from "./ipc-protocol.js";
import { startIpcServer, type IpcServerHandle } from "./ipc-server.js";
import { createLogger, logDiskUsage, type Logger } from "./logger.js";
import { resolvePaths } from "./paths.js";
import { PersistentEventQueue } from "./queue.js";
import { platformMetadata, systemMetrics } from "./system.js";
import { SecretVault } from "./vault.js";
import {
  startCameraEventMonitor,
  type CameraEventMonitor,
} from "./event-monitor.js";
import { resolveFfprobe } from "./discovery/binaries.js";
import {
  compatibilityRecordFrom,
  discoverDeviceStreams,
  discoverDevices,
  rankStreams,
  type DiscoveryResult,
} from "./discovery/index.js";
import type { Credentials } from "./discovery/types.js";
import type { RemoteCamera } from "./types.js";

export const AGENT_VERSION = "0.9.0";
export const DEFAULT_API_URL = "https://monitoria.cam";

const HEARTBEAT_INTERVAL_MS = 60_000;
const CAMERA_CHECK_INTERVAL_MS = 5 * 60_000;
/** O plano de produção pede sincronização de configuração a cada minuto. */
const CONFIG_SYNC_INTERVAL_MS = 60_000;
const QUEUE_TICK_MS = 3_000;

type CameraRuntime = {
  signature: string;
  sessionId: string;
  monitor: CameraEventMonitor;
};

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

function requireString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IpcError("bad_request", `O campo "${key}" é obrigatório.`);
  }

  return value.trim();
}

/**
 * Decide se vale a pena tentar de novo.
 *
 * 401 é tratado à parte: o token foi revogado ou expirou, e repetir com o
 * mesmo token só gera ruído. O evento fica na fila, o monitoramento para, e
 * o serviço passa a estado "não autorizado" até novo pareamento — em vez do
 * loop infinito de 401 que a versão anterior fazia.
 */
function classifyError(error: unknown): "retry" | "reject" | "unauthorized" {
  if (!(error instanceof ApiError)) return "retry";
  if (error.status === 401) return "unauthorized";
  if (error.status === 409 || error.status === 429) return "retry";
  if (error.status >= 500) return "retry";
  if (error.status >= 400) return "reject";
  return "retry";
}

export class AgentService {
  private logger!: Logger;
  private vault!: SecretVault;
  private queue!: PersistentEventQueue;
  private ipc: IpcServerHandle | null = null;

  private config: StoredAgentConfigV2 | null = null;
  private token: string | null = null;
  private ffmpegPath: string | null = null;
  private cameras: RemoteCamera[] = [];
  private readonly runtimes = new Map<string, CameraRuntime>();

  private timers: NodeJS.Timeout[] = [];
  private unauthorized = false;
  private shuttingDown = false;
  private lastSyncAt: string | null = null;
  private discovery: DiscoveryResult[] = [];
  private discoveryRunningAt: string | null = null;
  private lastHeartbeatAt: string | null = null;
  private startedAt = new Date().toISOString();

  constructor(private readonly options: { mirrorToConsole: boolean }) {}

  // ---------------------------------------------------------------- ciclo

  async start() {
    this.logger = await createLogger({ mirrorToConsole: this.options.mirrorToConsole });

    // O cofre reprotege segredos legados assim que consegue abri-los, e
    // devolve a configuração atualizada para gravação.
    this.vault = new SecretVault(async (previous, next) => {
      const config = this.config;
      if (!config) return;

      if (config.protectedAgentToken === previous) {
        config.protectedAgentToken = next;
      }

      for (const entry of Object.values(config.cameras)) {
        if (entry.protectedRtsp === previous) entry.protectedRtsp = next;
      }

      config.secretScope = "local-machine";
      await saveConfig(config);
      this.logger.info("Segredos migrados para o escopo de máquina.");
    });

    this.queue = new PersistentEventQueue({ log: (message) => this.logger.info(message) });
    await this.queue.open();

    const layout = await resolvePaths();

    if (!layout.restricted) {
      this.logger.warn(
        "A pasta de dados não pôde ser protegida por ACL. Execute o serviço como SYSTEM ou administrador.",
      );
    }

    this.ipc = await startIpcServer(this.handlers(), this.logger.log);

    this.config = await loadConfig();

    if (this.config) {
      await this.bootstrap();
    } else {
      this.logger.info("Serviço iniciado sem pareamento. Aguardando código.");
    }

    this.timers.push(setInterval(() => void this.tickQueue(), QUEUE_TICK_MS));
    this.timers.push(setInterval(() => void this.tickHeartbeat(), HEARTBEAT_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.tickCameras(), CAMERA_CHECK_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.tickConfig(), CONFIG_SYNC_INTERVAL_MS));

    process.once("SIGINT", () => void this.stop());
    process.once("SIGTERM", () => void this.stop());
  }

  /** Prepara token, FFmpeg e monitores após haver configuração válida. */
  private async bootstrap() {
    const config = this.config;
    if (!config) return;

    try {
      this.token = await this.vault.open(config.protectedAgentToken);
    } catch (error) {
      this.logger.error(
        `Não foi possível abrir o token do Agent: ${errorMessage(error)}. ` +
          "Se a pasta de dados foi copiada de outro computador, é preciso parear novamente.",
      );
      return;
    }

    try {
      this.ffmpegPath = await resolveFfmpeg();
      this.logger.info(`FFmpeg localizado: ${this.ffmpegPath}`);
    } catch (error) {
      this.logger.error(`FFmpeg indisponível: ${errorMessage(error)}`);
      return;
    }

    this.unauthorized = false;
    await this.syncConfiguration();
  }

  async stop() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];

    this.logger.info("Encerrando o serviço MonitorIA...");

    for (const cameraId of [...this.runtimes.keys()]) {
      await this.stopRuntime(cameraId, "agent_shutdown");
    }

    const config = this.config;

    if (config && this.token && !this.unauthorized) {
      for (const camera of this.cameras) {
        try {
          await sendCameraStatus(config.apiBaseUrl, this.token, camera.id, {
            status: "offline",
            metadata: { reason: "agent_shutdown" },
          });
        } catch {
          // Servidor inacessível no desligamento não é acionável.
        }
      }
    }

    await this.ipc?.close();
    await this.logger.flush();
  }

  // ------------------------------------------------------------ monitores

  private async stopRuntime(cameraId: string, reason: string) {
    const runtime = this.runtimes.get(cameraId);
    if (!runtime) return;

    this.runtimes.delete(cameraId);

    try {
      await runtime.monitor.stop(reason);
    } catch (error) {
      this.logger.warn(`Falha ao parar monitor ${cameraId}: ${errorMessage(error)}`);
    }

    const config = this.config;
    if (!config || !this.token) return;

    try {
      await closeCaptureSession(
        config.apiBaseUrl,
        this.token,
        cameraId,
        runtime.sessionId,
        reason,
      );
    } catch (error) {
      this.logger.warn(
        `Falha ao encerrar sessão ${runtime.sessionId}: ${errorMessage(error)}`,
      );
    }
  }

  private async syncMonitoring() {
    const config = this.config;
    const token = this.token;
    const ffmpegPath = this.ffmpegPath;

    if (!config || !token || !ffmpegPath || this.unauthorized) return;

    const knownIds = new Set(this.cameras.map((camera) => camera.id));

    for (const cameraId of [...this.runtimes.keys()]) {
      if (!knownIds.has(cameraId)) await this.stopRuntime(cameraId, "camera_removed");
    }

    for (const camera of this.cameras) {
      const existing = this.runtimes.get(camera.id);
      const signature = cameraSignature(camera);

      if (
        !camera.monitoringEnabled ||
        !camera.activeProfileId ||
        !camera.activeProfileVersion
      ) {
        if (existing) await this.stopRuntime(camera.id, "active_profile_removed");
        continue;
      }

      const local = config.cameras[camera.id];

      if (!local?.protectedRtsp) {
        // Sem prompt interativo: um serviço não tem console. A URL entra
        // pelo canal local, via comando camera.set-rtsp.
        this.logger.info(
          `A câmera "${camera.name}" aguarda o endereço RTSP ser informado.`,
        );
        continue;
      }

      if (existing && existing.signature === signature && existing.monitor.isRunning()) {
        continue;
      }

      if (existing) await this.stopRuntime(camera.id, "configuration_changed");

      try {
        const rtspUrl = await this.vault.open(local.protectedRtsp);

        const session = await startCaptureSession(config.apiBaseUrl, token, camera.id, {
          agentVersion: AGENT_VERSION,
          profileId: camera.activeProfileId,
          profileVersion: camera.activeProfileVersion,
          planCode: camera.plan,
          captureIntervalSeconds: camera.captureIntervalSeconds,
          consolidationIntervalSeconds: camera.consolidationIntervalSeconds,
          motionAdaptiveEnabled: camera.motionAdaptiveEnabled,
          motionOverlayMask: camera.motionOverlayMask,
          monitoringSchedule: camera.monitoringSchedule,
        });

        const monitor = startCameraEventMonitor({
          camera,
          ffmpegPath,
          rtspUrl,
          sessionId: session.sessionId,
          // A gravação em disco é assíncrona, mas o monitor espera resposta
          // imediata. A contrapressão real é o teto de disco da fila, não
          // este retorno.
          enqueue: (event) => {
            void this.queue.enqueue(event).catch((error: unknown) => {
              this.logger.error(
                `Falha ao gravar evento ${event.eventId} na fila: ${errorMessage(error)}`,
              );
            });
            return true;
          },
          log: (message: string) => this.logger.info(message),
          onFatalError: (error: Error) => {
            this.logger.error(
              `Monitor contínuo de "${camera.name}" falhou: ${error.message}`,
            );

            void sendCameraStatus(config.apiBaseUrl, token, camera.id, {
              status: "error",
              errorCode: "continuous_monitor_failed",
              errorMessage: error.message,
            }).catch(() => undefined);
          },
        });

        this.runtimes.set(camera.id, {
          signature,
          sessionId: session.sessionId,
          monitor,
        });

        this.logger.info(
          `Monitoramento ${camera.plan} iniciado em "${camera.name}" · perfil v${camera.activeProfileVersion}.`,
        );
      } catch (error) {
        if (classifyError(error) === "unauthorized") {
          this.handleUnauthorized();
          return;
        }

        this.logger.error(
          `Não foi possível iniciar o monitor de "${camera.name}": ${errorMessage(error)}`,
        );
      }
    }
  }

  private handleUnauthorized() {
    if (this.unauthorized) return;

    this.unauthorized = true;
    this.logger.error(
      "O token do Agent foi recusado pelo servidor. O monitoramento foi suspenso " +
        "e a fila preservada. Gere um novo código de pareamento no painel.",
    );

    void (async () => {
      for (const cameraId of [...this.runtimes.keys()]) {
        await this.stopRuntime(cameraId, "token_revoked");
      }
    })();
  }

  private async syncConfiguration() {
    const config = this.config;
    const token = this.token;

    if (!config || !token || this.unauthorized) return;

    try {
      const remote = await fetchAgentConfig(config.apiBaseUrl, token);
      this.cameras = remote.cameras;
      this.lastSyncAt = new Date().toISOString();
      await this.syncMonitoring();
    } catch (error) {
      if (classifyError(error) === "unauthorized") {
        this.handleUnauthorized();
        return;
      }

      this.logger.warn(`Falha ao sincronizar configuração: ${errorMessage(error)}`);
    }
  }

  private async checkCamera(camera: RemoteCamera, uploadFirstFrame: boolean) {
    const config = this.config;
    const token = this.token;
    const ffmpegPath = this.ffmpegPath;

    if (!config || !token || !ffmpegPath) return;

    const local = config.cameras[camera.id];
    if (!local) return;

    let framePath: string | null = null;

    try {
      const rtspUrl = await this.vault.open(local.protectedRtsp);
      const frame = await captureFrame(ffmpegPath, rtspUrl, camera.id, {
        prefix: "health",
      });
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
        this.logger.info(`Primeiro frame de "${camera.name}" enviado.`);
        return;
      }

      await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
        status: "online",
        streamLabel: "stream0",
        metadata: {
          width: frame.width,
          height: frame.height,
          byteSize: frame.byteSize,
        },
      });
    } catch (error) {
      if (classifyError(error) === "unauthorized") {
        this.handleUnauthorized();
        return;
      }

      const message = errorMessage(error);
      this.logger.warn(`Falha na câmera "${camera.name}": ${message}`);

      try {
        await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
          status: "error",
          errorCode: "rtsp_capture_failed",
          errorMessage: message,
        });
      } catch {
        // Sem rede, o heartbeat seguinte já reflete o estado.
      }
    } finally {
      if (framePath) await rm(framePath, { force: true });
    }
  }

  // --------------------------------------------------------------- timers

  private queueBusy = false;

  private async tickQueue() {
    if (this.queueBusy || this.shuttingDown) return;

    const config = this.config;
    const token = this.token;

    if (!config || !token || this.unauthorized) return;

    this.queueBusy = true;

    try {
      const entry = await this.queue.next();
      if (!entry) return;

      await submitCameraEvent(config.apiBaseUrl, token, entry.event);
      await this.queue.complete(entry.id);
      this.logger.info(`Evento ${entry.id} enviado.`);
    } catch (error) {
      const message = errorMessage(error);
      const kind = classifyError(error);

      const entry = await this.queue.next().catch(() => null);

      if (kind === "unauthorized") {
        this.handleUnauthorized();
      } else if (entry && kind === "reject") {
        await this.queue.reject(entry.id, message);
      } else if (entry) {
        await this.queue.defer(entry.id, message);
      }
    } finally {
      this.queueBusy = false;
    }
  }

  private heartbeatBusy = false;

  private async tickHeartbeat() {
    if (this.heartbeatBusy || this.shuttingDown) return;

    const config = this.config;
    const token = this.token;

    if (!config || !token || this.unauthorized) return;

    this.heartbeatBusy = true;

    try {
      const stats = await this.queue.stats();
      const directory = await resolveConfigDirectory();
      const metrics = await systemMetrics(directory, stats.pending);

      await sendHeartbeat(config.apiBaseUrl, token, {
        version: AGENT_VERSION,
        platform: process.platform,
        architecture: process.arch,
        ...metrics,
        metadata: {
          ...platformMetadata(),
          queueBytes: stats.totalBytes,
          queueDropped: stats.dropped,
          queueRejected: stats.rejected,
          queueOldestAt: stats.oldestCreatedAt,
        },
      });

      this.lastHeartbeatAt = new Date().toISOString();
    } catch (error) {
      if (classifyError(error) === "unauthorized") this.handleUnauthorized();
      else this.logger.warn(`Falha no heartbeat: ${errorMessage(error)}`);
    } finally {
      this.heartbeatBusy = false;
    }
  }

  private camerasBusy = false;

  private async tickCameras() {
    if (this.camerasBusy || this.shuttingDown || this.unauthorized) return;

    this.camerasBusy = true;

    try {
      await this.syncMonitoring();

      const config = this.config;
      const token = this.token;
      if (!config || !token) return;

      for (const camera of this.cameras) {
        const runtime = this.runtimes.get(camera.id);

        if (runtime?.monitor.isRunning()) {
          await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
            status: "online",
            streamLabel: "stream0",
            metadata: {
              continuousMonitoring: true,
              activeProfileVersion: camera.activeProfileVersion,
              planCode: camera.plan,
              framesObserved: runtime.monitor.framesObserved(),
              calibration: runtime.monitor.calibrationSnapshot(),
            },
          });
          continue;
        }

        await this.checkCamera(
          camera,
          !config.cameras[camera.id]?.lastSnapshotUploadedAt,
        );
      }
    } catch (error) {
      this.logger.warn(`Falha na verificação de câmeras: ${errorMessage(error)}`);
    } finally {
      this.camerasBusy = false;
    }
  }

  private configBusy = false;

  private async tickConfig() {
    if (this.configBusy || this.shuttingDown) return;

    this.configBusy = true;

    try {
      await this.queue.prune();
      await this.syncConfiguration();
    } finally {
      this.configBusy = false;
    }
  }

  // ------------------------------------------------------- canal local

  private handlers(): IpcHandlerMap {
    return {
      status: async () => this.statusPayload(),
      diagnose: async () => this.diagnosePayload(),
      sync: async () => {
        await this.syncConfiguration();
        return { synced: true, cameras: this.cameras.length };
      },
      "queue.stats": async () => ({ ...(await this.queue.stats()) }),
      "camera.list": async () => ({
        cameras: this.cameras.map((camera) => ({
          id: camera.id,
          name: camera.name,
          plan: camera.plan,
          monitoringEnabled: camera.monitoringEnabled,
          rtspConfigured: Boolean(this.config?.cameras[camera.id]?.protectedRtsp),
          running: this.runtimes.get(camera.id)?.monitor.isRunning() ?? false,
        })),
      }),
      "discovery.scan": async (payload) => this.runDiscovery(payload),
      "discovery.results": async () => ({
        runningSince: this.discoveryRunningAt,
        devices: this.discovery.map((entry) => this.summarizeDiscovery(entry)),
      }),
      "discovery.bind": async (payload) => this.bindDiscovered(payload),
      pair: async (payload) => this.pair(payload),
      unpair: async () => {
        for (const cameraId of [...this.runtimes.keys()]) {
          await this.stopRuntime(cameraId, "unpaired");
        }

        await removeConfig();
        this.config = null;
        this.token = null;
        this.cameras = [];
        this.unauthorized = false;
        this.vault.clear();

        this.logger.info("Pareamento removido por solicitação local.");
        return { unpaired: true };
      },
      "camera.set-rtsp": async (payload) => {
        const config = this.config;
        if (!config) throw new IpcError("not_paired", "O Agent ainda não foi pareado.");

        const cameraId = requireString(payload, "cameraId");
        const rtspUrl = requireString(payload, "rtspUrl");

        if (!rtspUrl.toLowerCase().startsWith("rtsp://")) {
          throw new IpcError("bad_request", "O endereço precisa começar com rtsp://");
        }

        config.cameras[cameraId] = {
          protectedRtsp: await this.vault.seal(rtspUrl),
          configuredAt: new Date().toISOString(),
        };

        await saveConfig(config);
        await this.syncMonitoring();

        this.logger.info(`Endereço RTSP gravado para a câmera ${cameraId}.`);
        return { cameraId, configured: true };
      },
    };
  }

  private async pair(payload: Record<string, unknown>) {
    if (this.config) {
      throw new IpcError(
        "bad_request",
        'Este computador já está pareado. Use "unpair" antes de parear novamente.',
      );
    }

    const code = requireString(payload, "code");
    const apiBaseUrl =
      typeof payload.apiBaseUrl === "string" && payload.apiBaseUrl.trim().length > 0
        ? payload.apiBaseUrl.trim()
        : DEFAULT_API_URL;
    const agentName =
      typeof payload.agentName === "string" && payload.agentName.trim().length > 0
        ? payload.agentName.trim()
        : `Agent ${os.hostname()}`;

    let paired;

    try {
      paired = await pairAgent(apiBaseUrl, {
        code,
        agentName,
        platform: process.platform,
        architecture: process.arch,
        version: AGENT_VERSION,
        metadata: platformMetadata(),
      });
    } catch (error) {
      throw new IpcError(
        "bad_request",
        `Pareamento recusado: ${errorMessage(error)}. ` +
          "Confira o código e gere outro se já tiver passado de 15 minutos.",
      );
    }

    const config: StoredAgentConfigV2 = {
      schemaVersion: 2,
      secretScope: "local-machine",
      apiBaseUrl: apiBaseUrl.replace(/\/+$/, ""),
      agentId: paired.agent.id,
      agentName,
      protectedAgentToken: await this.vault.seal(paired.agent.token),
      pairedAt: new Date().toISOString(),
      cameras: {},
    };

    await saveConfig(config);
    this.config = config;

    this.logger.info(`Agent pareado com a câmera "${paired.camera.name}".`);

    await this.bootstrap();

    return {
      agentId: paired.agent.id,
      agentName,
      cameraId: paired.camera.id,
      cameraName: paired.camera.name,
    };
  }

  // ------------------------------------------------------------ descoberta

  private summarizeDiscovery(entry: DiscoveryResult) {
    const ranked = rankStreams(entry.streams.filter((item) => item.validation.success));

    return {
      deviceId: entry.device.id,
      host: entry.device.host,
      source: entry.device.source,
      onvifSupported: entry.onvifSupported,
      vendor: entry.information?.manufacturer ?? entry.vendor,
      model: entry.information?.model ?? entry.device.hardwareHint,
      firmware: entry.information?.firmwareVersion ?? null,
      failure: entry.failure,
      // A URL com credencial nunca sai do serviço. A interface escolhe pelo
      // índice; quem precisa da URL é só o próprio Agent.
      streams: ranked.map((item, index) => ({
        index,
        displayPath: item.displayPath,
        port: item.port,
        stream: item.stream,
        level: item.level,
        codec: item.validation.codec ?? null,
        width: item.validation.width ?? null,
        height: item.validation.height ?? null,
        fps: item.validation.fps ?? null,
      })),
    };
  }

  private credentialsFrom(payload: Record<string, unknown>): Credentials {
    return {
      username: requireString(payload, "username"),
      password: typeof payload.password === "string" ? payload.password : "",
    };
  }

  /**
   * Varredura completa. Pode levar dezenas de segundos, por isso o cliente do
   * canal local usa tempo de resposta longo e a interface mostra progresso.
   */
  private async runDiscovery(payload: Record<string, unknown>) {
    if (this.discoveryRunningAt) {
      throw new IpcError("busy", "Já existe uma varredura em andamento.");
    }

    const credentials = this.credentialsFrom(payload);
    const channels = Array.isArray(payload.channels)
      ? payload.channels.filter((value): value is number => typeof value === "number")
      : [1];

    this.discoveryRunningAt = new Date().toISOString();

    try {
      const [ffmpegPath, ffprobePath] = await Promise.all([
        this.ffmpegPath ? Promise.resolve(this.ffmpegPath) : resolveFfmpeg(),
        resolveFfprobe(),
      ]);

      const devices = await discoverDevices({ log: (message) => this.logger.info(message) });

      this.logger.info(`Descoberta encontrou ${devices.length} aparelho(s).`);

      const results: DiscoveryResult[] = [];

      for (const device of devices) {
        results.push(
          await discoverDeviceStreams({
            device,
            credentials,
            channels: channels.length > 0 ? channels : [1],
            tools: { ffmpegPath, ffprobePath },
            log: (message) => this.logger.info(message),
          }),
        );
      }

      this.discovery = results;

      return {
        devices: results.map((entry) => this.summarizeDiscovery(entry)),
      };
    } finally {
      this.discoveryRunningAt = null;
    }
  }

  /**
   * Vincula um stream já validado a uma câmera do painel.
   *
   * Só aceita índice de resultado, nunca URL vinda de fora: assim é
   * impossível gravar um endereço que não passou pela validação.
   */
  private async bindDiscovered(payload: Record<string, unknown>) {
    const config = this.config;
    if (!config) throw new IpcError("not_paired", "O Agent ainda não foi pareado.");

    const cameraId = requireString(payload, "cameraId");
    const deviceId = requireString(payload, "deviceId");
    const streamIndex = typeof payload.streamIndex === "number" ? payload.streamIndex : 0;

    const entry = this.discovery.find((item) => item.device.id === deviceId);
    if (!entry) {
      throw new IpcError("bad_request", "Aparelho não encontrado na última varredura.");
    }

    const ranked = rankStreams(entry.streams.filter((item) => item.validation.success));
    const chosen = ranked[streamIndex];

    if (!chosen) {
      throw new IpcError("bad_request", "Nenhum stream validado neste índice.");
    }

    config.cameras[cameraId] = {
      protectedRtsp: await this.vault.seal(chosen.rtspUrl),
      configuredAt: new Date().toISOString(),
    };

    await saveConfig(config);
    await this.syncMonitoring();

    // A base de compatibilidade recebe fabricante, modelo e caminho
    // normalizado. Nunca a senha, nunca o IP.
    void this.reportCompatibility(entry, chosen);

    this.logger.info(`Câmera ${cameraId} vinculada ao aparelho ${entry.device.host}.`);

    return {
      cameraId,
      displayPath: chosen.displayPath,
      codec: chosen.validation.codec ?? null,
      width: chosen.validation.width ?? null,
      height: chosen.validation.height ?? null,
    };
  }

  private async reportCompatibility(
    entry: DiscoveryResult,
    chosen: DiscoveryResult["streams"][number],
  ) {
    const config = this.config;
    const token = this.token;
    if (!config || !token) return;

    const record = compatibilityRecordFrom(entry, chosen, AGENT_VERSION);

    try {
      const response = await fetch(`${config.apiBaseUrl}/api/agent/compatibility`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(record),
      });

      if (!response.ok) {
        this.logger.warn(`Registro de compatibilidade recusado: ${response.status}`);
      }
    } catch (error) {
      // Telemetria de compatibilidade nunca bloqueia a instalação.
      this.logger.warn(`Falha ao registrar compatibilidade: ${errorMessage(error)}`);
    }
  }

  private async statusPayload() {
    const stats = await this.queue.stats();

    return {
      version: AGENT_VERSION,
      startedAt: this.startedAt,
      paired: Boolean(this.config),
      unauthorized: this.unauthorized,
      agentName: this.config?.agentName ?? null,
      apiBaseUrl: this.config?.apiBaseUrl ?? null,
      lastSyncAt: this.lastSyncAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      camerasKnown: this.cameras.length,
      camerasRunning: [...this.runtimes.values()].filter((runtime) =>
        runtime.monitor.isRunning(),
      ).length,
      queue: stats,
    };
  }

  /**
   * Diagnóstico que funciona sem rede. É o comando que o suporte pede quando
   * a loja diz "não está funcionando" e ninguém sabe por onde começar.
   */
  private async diagnosePayload() {
    const layout = await resolvePaths();
    const stats = await this.queue.stats();
    const logs = await logDiskUsage();

    let ffmpeg: string | null = null;
    let ffmpegError: string | null = null;

    try {
      ffmpeg = this.ffmpegPath ?? (await resolveFfmpeg());
    } catch (error) {
      ffmpegError = errorMessage(error);
    }

    const metrics = await systemMetrics(layout.root, stats.pending).catch(() => null);

    return {
      version: AGENT_VERSION,
      dataDirectory: layout.root,
      aclRestricted: layout.restricted,
      configPresent: Boolean(this.config),
      secretScope: this.config?.secretScope ?? null,
      unauthorized: this.unauthorized,
      ffmpeg,
      ffmpegError,
      queue: stats,
      logs,
      system: metrics,
      transport: this.ipc?.endpoint.transport ?? null,
    };
  }
}
