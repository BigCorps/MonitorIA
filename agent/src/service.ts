import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ApiError,
  closeCaptureSession,
  completeClipRequest,
  completeDiscoveryRun,
  fetchAgentConfig,
  reportDiscoveryProgress,
  pairAgent,
  registerDiscoveredCamera,
  sendCameraStatus,
  sendHeartbeat,
  startCaptureSession,
  submitCameraEvent,
  uploadClipToSignedUrl,
  uploadSnapshot,
} from "./api.js";
import {
  loadConfig,
  removeConfig,
  resolveConfigDirectory,
  saveConfig,
  type StoredAgentConfigV2,
} from "./config.js";
import { classifyCameraFailure, retryDelayMs } from "./camera-failure.js";
import { captureFrame, resolveFfmpeg } from "./ffmpeg.js";
import { IpcError, type IpcHandlerMap } from "./ipc-protocol.js";
import { startIpcServer, type IpcServerHandle } from "./ipc-server.js";
import { createLogger, logDiskUsage, type Logger } from "./logger.js";
import { enableAclManagement, resolvePaths } from "./paths.js";
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
import { CircularClipBuffer } from "./clip-buffer.js";
import type {
  ClipUploadRequest,
  DiscoveryRequest,
  RemoteCamera,
} from "./types.js";

export const AGENT_VERSION = "0.10.7";

export type TokenState = "ok" | "locked" | "missing";

/**
 * Ter um agent.json não significa que o computador ainda esteja pareado.
 *
 * Se o DPAPI não consegue abrir o token (por exemplo, após uma migração de
 * cofre) ou se o servidor o revogou, o instalador precisa pedir um código
 * novo. Tratar apenas a presença do arquivo como pareamento deixava o Agent
 * preso: ele pulava a tela do código, mas também não conseguia autenticar.
 */
export function hasUsablePairing(
  configPresent: boolean,
  tokenState: TokenState,
  unauthorized: boolean,
) {
  return configPresent && tokenState === "ok" && !unauthorized;
}
/**
 * Domínio canônico.
 *
 * O apex responde 308 para www, e seguir esse redirecionamento removia o
 * cabeçalho Authorization. O `api.ts` agora trata isso, mas apontar direto
 * para o destino final economiza um salto em toda requisição.
 */
export const DEFAULT_API_URL = "https://www.monitoria.cam";

const HEARTBEAT_INTERVAL_MS = 60_000;
const CAMERA_CHECK_INTERVAL_MS = 5 * 60_000;
/**
 * Intervalo entre consultas de configuração.
 *
 * Era um minuto fixo. Com a busca de câmeras no painel, um minuto vira uma
 * tela parada enquanto o cliente olha: ele clicou em "Procurar câmeras" e
 * nada acontece. O servidor agora devolve `pollSeconds` em cada resposta —
 * curto quando há busca em andamento, folgado quando não há. Os valores
 * abaixo são só o piso e o teto do que se aceita do servidor.
 */
const CONFIG_SYNC_INTERVAL_MS = 20_000;
const CONFIG_SYNC_MIN_MS = 3_000;
const CONFIG_SYNC_MAX_MS = 120_000;
const QUEUE_TICK_MS = 3_000;

/** Relato de etapa durante uma busca de câmeras. */
type DiscoveryProgress = (update: {
  step: "starting" | "scanning" | "testing" | "saving" | "done";
  percent: number;
  message?: string;
  found?: number;
}) => Promise<void>;

type CameraRuntime = {
  signature: string;
  sessionId: string;
  monitor: CameraEventMonitor;
  clipBuffer: CircularClipBuffer | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Assinatura que decide se o monitor precisa ser recriado.
 *
 * `localRtsp` entrou depois de um caso real: trocar o endereço RTSP pelo
 * canal local gravava a configuração, respondia "o monitoramento inicia em
 * instantes" e não reiniciava nada — a assinatura só olhava a configuração
 * vinda do painel. O monitor antigo seguia rodando no endereço antigo até
 * alguém reiniciar o serviço. É o hash do valor protegido, então nenhuma
 * credencial entra na comparação.
 */
function cameraSignature(camera: RemoteCamera, localRtsp: string | null) {
  return JSON.stringify({
    localRtsp: localRtsp
      ? createHash("sha256").update(localRtsp).digest("hex").slice(0, 16)
      : null,
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
    maximumAnalysisFrames: camera.maximumAnalysisFrames,
    clipEnabled: camera.clipEnabled,
    clipDurationSeconds: camera.clipDurationSeconds,
  });
}

function requireString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IpcError("bad_request", `O campo "${key}" é obrigatório.`);
  }

  return value.trim();
}

function privateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some(
      (part) =>
        !Number.isInteger(part) || part < 0 || part > 255,
    )
  ) {
    return false;
  }

  const [first, second] = parts;
  return (
    first === 10 ||
    (first === 172 && (second ?? 0) >= 16 && (second ?? 0) <= 31) ||
    (first === 192 && second === 168)
  );
}

function ipv4Order(value: string) {
  return value
    .split(".")
    .map(Number)
    .reduce((total, part) => total * 256 + part, 0);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      if (value === undefined) continue;
      results[index] = await mapper(value);
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, limit), values.length) },
      () => worker(),
    ),
  );

  return results;
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
  private unauthorizedSince: number | null = null;
  private everAuthenticated = false;
  private tokenState: TokenState = "missing";
  private readonly cameraBackoff = new Map<
    string,
    { attempts: number; nextAttemptAt: number; code: string; message: string }
  >();
  private shuttingDown = false;
  private lastSyncAt: string | null = null;
  private discovery: DiscoveryResult[] = [];
  private discoveryRunningAt: string | null = null;
  private configSyncIntervalMs = CONFIG_SYNC_INTERVAL_MS;
  private configTimer: NodeJS.Timeout | null = null;
  /** Pedido em execução vindo do painel. Impede busca dupla. */
  private serverDiscoveryRunId: string | null = null;
  private lastHeartbeatAt: string | null = null;
  private startedAt = new Date().toISOString();

  constructor(private readonly options: { mirrorToConsole: boolean }) {}

  // ---------------------------------------------------------------- ciclo

  async start() {
    // Só o serviço tem autoridade sobre as permissões da pasta de dados.
    enableAclManagement();

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

    if (layout.restricted === false) {
      this.logger.warn(
        "A pasta de dados não pôde ser protegida por ACL. Execute o serviço como SYSTEM ou administrador.",
      );
    }

    this.config = await loadConfig();
    this.ipc = await startIpcServer(this.handlers(), this.logger.log);

    if (this.config) {
      await this.bootstrap();
    } else {
      this.logger.info("Serviço iniciado sem pareamento. Aguardando código.");
    }

    this.timers.push(setInterval(() => void this.tickQueue(), QUEUE_TICK_MS));
    this.timers.push(setInterval(() => void this.tickHeartbeat(), HEARTBEAT_INTERVAL_MS));
    this.timers.push(setInterval(() => void this.tickCameras(), CAMERA_CHECK_INTERVAL_MS));
    this.scheduleConfigSync();

    process.once("SIGINT", () => void this.stop());
    process.once("SIGTERM", () => void this.stop());
  }

  /** Prepara token, FFmpeg e monitores após haver configuração válida. */
  private async bootstrap() {
    const config = this.config;
    if (!config) return;

    try {
      this.token = await this.vault.open(config.protectedAgentToken);
      this.tokenState = "ok";
    } catch (error) {
      this.tokenState = "locked";
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
    this.unauthorizedSince = null;
    await this.syncConfiguration();
  }

  async stop() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    for (const timer of this.timers) clearInterval(timer);
    this.timers = [];

    if (this.configTimer) {
      clearTimeout(this.configTimer);
      this.configTimer = null;
    }

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
      await runtime.clipBuffer?.stop();
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
      const signature = cameraSignature(
        camera,
        config.cameras[camera.id]?.protectedRtsp ?? null,
      );

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

      // Câmera que falhou recentemente não é reiniciada a cada ciclo. Sem
      // isso, credencial errada gerava uma tentativa por minuto, e cada
      // reinício descartava a calibração de movimento já acumulada.
      const backoff = this.cameraBackoff.get(camera.id);

      if (backoff && Date.now() < backoff.nextAttemptAt) continue;

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
            const failure = classifyCameraFailure(error.message);
            const anterior = this.cameraBackoff.get(camera.id);
            const attempts = (anterior?.attempts ?? 0) + 1;

            this.cameraBackoff.set(camera.id, {
              attempts,
              nextAttemptAt: Date.now() + retryDelayMs(failure, attempts),
              code: failure.code,
              message: failure.message,
            });

            this.logger.error(
              `Monitor de "${camera.name}" falhou (${failure.code}): ${failure.message}`,
            );

            // O texto cru fica no log em nível warn, não debug: com debug
            // desligado por padrão, a causa das falhas desaparecia e o
            // suporte remoto ficava sem nada para analisar. O painel segue
            // recebendo apenas a mensagem amigável.
            this.logger.warn(`Detalhe técnico de "${camera.name}": ${error.message}`);

            void sendCameraStatus(config.apiBaseUrl, token, camera.id, {
              status: "error",
              errorCode: failure.code,
              errorMessage: failure.message,
            }).catch(() => undefined);
          },
        });

        let clipBuffer: CircularClipBuffer | null = null;

        if (camera.clipEnabled === true) {
          try {
            clipBuffer = new CircularClipBuffer({
              cameraId: camera.id,
              cameraName: camera.name,
              ffmpegPath,
              rtspUrl,
              log: (message) => this.logger.info(message),
            });
            await clipBuffer.start();
          } catch (clipError) {
            clipBuffer = null;
            this.logger.warn(
              `O monitoramento continuará sem clipe em "${camera.name}": ${errorMessage(clipError)}`,
            );
          }
        }

        this.runtimes.set(camera.id, {
          signature,
          sessionId: session.sessionId,
          monitor,
          clipBuffer,
        });

        this.cameraBackoff.delete(camera.id);

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

  /**
   * 401 do servidor.
   *
   * Antes isso suspendia o Agent em definitivo, até alguém reiniciar o
   * serviço na loja. Em produção a causa nem era revogação: era o cabeçalho
   * de autorização perdido num redirecionamento, e a mensagem mandava o
   * operador gerar código novo várias vezes sem resolver nada.
   *
   * Agora o estado é temporário: o monitoramento para, a fila é preservada e
   * a autenticação é retentada periodicamente. A mensagem também distingue os
   * dois cenários, porque a ação do operador é diferente em cada um.
   */
  private handleUnauthorized() {
    if (this.unauthorized) return;

    this.unauthorized = true;
    this.unauthorizedSince = Date.now();

    this.logger.error(
      this.everAuthenticated
        ? "O token do Agent foi recusado pelo servidor. O monitoramento foi " +
            "suspenso e a fila preservada. Se o pareamento foi removido no " +
            "painel, gere um novo código."
        : "O servidor recusou o token e este Agent nunca autenticou com " +
            `sucesso em ${this.config?.apiBaseUrl ?? "(sem servidor)"}. ` +
            "Isso costuma indicar endereço de servidor incorreto, e não token " +
            "revogado. Verifique o parâmetro --url usado no pareamento.",
    );

    void (async () => {
      for (const cameraId of [...this.runtimes.keys()]) {
        await this.stopRuntime(cameraId, "token_revoked");
      }
    })();
  }

  /** Espaçamento das retentativas enquanto não autorizado. */
  private shouldRetryAuthorization() {
    if (!this.unauthorized) return false;
    if (this.unauthorizedSince === null) return true;
    return Date.now() - this.unauthorizedSince >= 5 * 60_000;
  }

  private async syncConfiguration() {
    const config = this.config;
    const token = this.token;

    if (!config || !token) return;

    if (this.unauthorized) {
      if (!this.shouldRetryAuthorization()) return;

      this.logger.info("Tentando autenticar novamente com o servidor...");
      this.unauthorizedSince = Date.now();
    }

    try {
      const remote = await fetchAgentConfig(config.apiBaseUrl, token);
      this.cameras = remote.cameras;
      this.lastSyncAt = new Date().toISOString();
      this.everAuthenticated = true;
      this.applyPollInterval(remote.pollSeconds);

      if (this.unauthorized) {
        this.unauthorized = false;
        this.unauthorizedSince = null;
        this.logger.info("Autenticação restabelecida. Retomando o monitoramento.");
      }

      await this.syncMonitoring();

      // A busca roda fora desta sincronização: pode levar dezenas de
      // segundos e não pode segurar o ciclo de configuração.
      if (remote.discovery) {
        void this.runServerDiscovery(remote.discovery);
      }
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

      const failure = classifyCameraFailure(errorMessage(error));
      this.logger.warn(`Falha na câmera "${camera.name}": ${failure.message}`);
      this.logger.warn(`Detalhe técnico de "${camera.name}": ${errorMessage(error)}`);

      try {
        await sendCameraStatus(config.apiBaseUrl, token, camera.id, {
          status: "error",
          errorCode: failure.code,
          errorMessage: failure.message,
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
    const ffmpegPath = this.ffmpegPath;

    if (!config || !token || !ffmpegPath || this.unauthorized) return;

    this.queueBusy = true;

    try {
      const entry = await this.queue.next();
      if (!entry) return;

      const submitted = await submitCameraEvent(
        config.apiBaseUrl,
        token,
        entry.event,
        ffmpegPath,
      );

      if (submitted.clipRequest) {
        await this.processClipRequest(
          entry.event.cameraId,
          submitted.clipRequest,
        );
      }

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

  private async processClipRequest(
    cameraId: string,
    request: ClipUploadRequest,
  ) {
    const config = this.config;
    const token = this.token;
    const buffer = this.runtimes.get(cameraId)?.clipBuffer;

    if (!config || !token) return;

    if (!buffer) {
      await completeClipRequest(
        config.apiBaseUrl,
        token,
        request.requestId,
        {
          status: "failed",
          assetId: request.assetId,
          byteSize: 0,
          contentSha256: null,
          durationSeconds: null,
          generationMs: 0,
          segmentsUsed: 0,
          errorCode: "clip_buffer_unavailable",
          errorMessage:
            "O buffer local não estava disponível para este evento.",
        },
      ).catch(() => undefined);
      return;
    }

    let built: Awaited<ReturnType<CircularClipBuffer["buildClip"]>> | null = null;

    try {
      built = await buffer.buildClip(request);
      const uploaded = await uploadClipToSignedUrl(
        request.signedUrl,
        built.path,
      );

      await completeClipRequest(
        config.apiBaseUrl,
        token,
        request.requestId,
        {
          status: "ready",
          assetId: request.assetId,
          byteSize: uploaded.byteSize,
          contentSha256: uploaded.contentSha256,
          durationSeconds: built.durationSeconds,
          generationMs: built.generationMs,
          segmentsUsed: built.segmentsUsed,
          errorCode: null,
          errorMessage: null,
        },
      );

      this.logger.info(
        `Clipe do evento ${request.eventId} enviado diretamente ao Storage.`,
      );
    } catch (error) {
      this.logger.warn(
        `O evento foi salvo, mas o clipe falhou: ${errorMessage(error)}`,
      );

      await completeClipRequest(
        config.apiBaseUrl,
        token,
        request.requestId,
        {
          status: "failed",
          assetId: request.assetId,
          byteSize: 0,
          contentSha256: null,
          durationSeconds: null,
          generationMs: built?.generationMs ?? 0,
          segmentsUsed: built?.segmentsUsed ?? 0,
          errorCode: "clip_generation_or_upload_failed",
          errorMessage: errorMessage(error).slice(0, 900),
        },
      ).catch(() => undefined);
    } finally {
      if (built?.path) {
        await rm(path.dirname(built.path), {
          recursive: true,
          force: true,
        });
      }
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

  /**
   * Reagenda a próxima consulta em vez de usar intervalo fixo.
   *
   * O servidor decide o ritmo: durante uma busca de câmeras ele pede
   * segundos, no resto do tempo pede o intervalo folgado. O piso e o teto
   * existem para que um servidor com resposta estranha não transforme o
   * Agent em uma máquina de requisições.
   */
  private scheduleConfigSync() {
    if (this.shuttingDown) return;

    if (this.configTimer) clearTimeout(this.configTimer);

    this.configTimer = setTimeout(() => {
      void this.tickConfig().finally(() => this.scheduleConfigSync());
    }, this.configSyncIntervalMs);
  }

  private applyPollInterval(seconds: unknown) {
    const parsed = Number(seconds);
    if (!Number.isFinite(parsed) || parsed <= 0) return;

    this.configSyncIntervalMs = Math.min(
      CONFIG_SYNC_MAX_MS,
      Math.max(CONFIG_SYNC_MIN_MS, Math.round(parsed * 1000)),
    );
  }

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
      "discovery.configure": async (payload) =>
        this.autoConfigureDiscovered(payload),
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
        this.unauthorizedSince = null;
        this.everAuthenticated = false;
        this.tokenState = "missing";
        this.cameraBackoff.clear();
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
    if (
      hasUsablePairing(Boolean(this.config), this.tokenState, this.unauthorized)
    ) {
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

    // O código só substitui uma configuração anterior depois que o servidor
    // o aceitou e o novo token já está protegido localmente. Se o código for
    // inválido, a configuração antiga permanece intacta para diagnóstico.
    for (const cameraId of [...this.runtimes.keys()]) {
      await this.stopRuntime(cameraId, "repaired");
    }

    this.vault.clear();
    this.token = null;
    this.cameras = [];
    this.cameraBackoff.clear();
    this.unauthorized = false;
    this.unauthorizedSince = null;
    this.everAuthenticated = false;

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

  /**
   * Busca pedida pelo painel.
   *
   * Diferente da busca do instalador em dois pontos: relata etapa por etapa
   * enquanto trabalha, e sempre encerra o pedido no servidor — inclusive
   * quando falha. É o encerramento que apaga a senha guardada; sair sem
   * avisar deixaria a credencial parada no banco até expirar.
   */
  private async runServerDiscovery(request: DiscoveryRequest) {
    const config = this.config;
    const token = this.token;

    if (!config || !token) return;
    if (this.serverDiscoveryRunId) return;

    this.serverDiscoveryRunId = request.id;

    let abandoned = false;

    const report: DiscoveryProgress = async (update) => {
      if (abandoned) return;

      try {
        const active = await reportDiscoveryProgress(
          config.apiBaseUrl,
          token,
          {
            runId: request.id,
            step: update.step,
            percent: update.percent,
            ...(update.message ? { message: update.message } : {}),
            ...(typeof update.found === "number"
              ? { found: update.found }
              : {}),
          },
        );

        // O cliente cancelou ou o pedido expirou. Não vale terminar.
        if (!active) abandoned = true;
      } catch (error) {
        this.logger.warn(
          `Não foi possível relatar o progresso da busca: ${errorMessage(error)}`,
        );
      }
    };

    this.logger.info(`Busca de câmeras solicitada pelo painel (${request.id}).`);

    try {
      await report({
        step: "starting",
        percent: 10,
        message: "Preparando a busca.",
      });

      // "Quantas câmeras você tem?" vira teto de canais a sondar. Os canais
      // acima de 1 só entram no plano B, para aparelhos sem ONVIF.
      const channels = Array.from(
        { length: Math.min(Math.max(request.cameraCountHint, 1), 64) },
        (_, index) => index + 1,
      );

      const summary = await this.autoConfigureDiscovered(
        {
          username: request.username,
          password: request.password,
          channels,
        },
        report,
      );

      const connectedHosts = await this.configuredHosts();
      const devices = this.discovery.map((entry) => ({
        ...this.summarizeDiscovery(entry),
        connected: connectedHosts.has(entry.device.host),
      }));

      await completeDiscoveryRun(config.apiBaseUrl, token, {
        runId: request.id,
        status: "completed",
        found: summary.found,
        connected: summary.connected,
        alreadyConnected: summary.alreadyConnected,
        devices,
      });

      this.logger.info(
        `Busca concluída: ${summary.found} encontrado(s), ` +
          `${summary.connected} conectado(s).`,
      );
    } catch (error) {
      if (classifyError(error) === "unauthorized") {
        this.handleUnauthorized();
        this.serverDiscoveryRunId = null;
        return;
      }

      const detail = errorMessage(error);

      // Uma varredura local já em curso não é falha: é hora errada. Antes
      // isto encerrava o pedido como "não terminou" e o cliente via um erro
      // que sumiria sozinho em um minuto. Agora o pedido volta para a fila e
      // o próprio Agent tenta de novo na consulta seguinte.
      if (error instanceof IpcError && error.code === "busy") {
        this.logger.info(
          "Busca adiada: já há uma varredura em andamento neste computador.",
        );

        try {
          await completeDiscoveryRun(config.apiBaseUrl, token, {
            runId: request.id,
            status: "deferred",
            found: 0,
            connected: 0,
            alreadyConnected: 0,
            devices: [],
          });
        } catch (deferError) {
          this.logger.warn(
            `Não foi possível adiar a busca: ${errorMessage(deferError)}`,
          );
        }

        this.serverDiscoveryRunId = null;
        return;
      }

      this.logger.warn(`Falha na busca pedida pelo painel: ${detail}`);

      try {
        await completeDiscoveryRun(config.apiBaseUrl, token, {
          runId: request.id,
          status: "failed",
          found: this.discovery.length,
          connected: 0,
          alreadyConnected: 0,
          devices: this.discovery.map((entry) =>
            this.summarizeDiscovery(entry),
          ),
          failure: {
            code: "discovery_failed",
            // O que vai para a tela do cliente. O detalhe fica só no registro.
            message:
              "A busca não terminou. Confira se as câmeras estão ligadas " +
              "e no mesmo roteador do computador, e tente de novo.",
            detail,
          },
        });
      } catch (reportError) {
        this.logger.warn(
          `Não foi possível encerrar a busca no servidor: ${errorMessage(reportError)}`,
        );
      }
    } finally {
      this.serverDiscoveryRunId = null;
    }
  }

  private summarizeDiscovery(entry: DiscoveryResult) {
    const ranked = rankStreams(entry.streams.filter((item) => item.validation.success));

    return {
      deviceId: entry.device.id,
      host: entry.device.host,
      name: entry.device.nameHint,
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
  private async runDiscovery(
    payload: Record<string, unknown>,
    onProgress?: DiscoveryProgress,
  ) {
    if (this.discoveryRunningAt) {
      throw new IpcError("busy", "Já existe uma varredura em andamento.");
    }

    const credentials = this.credentialsFrom(payload);
    const channels = Array.isArray(payload.channels)
      ? payload.channels.filter((value): value is number => typeof value === "number")
      : [1];
    const requestedHosts = Array.isArray(payload.hosts)
      ? payload.hosts.filter(
          (value): value is string =>
            typeof value === "string" && privateIpv4(value.trim()),
        )
      : [];

    if (Array.isArray(payload.hosts) && requestedHosts.length === 0) {
      throw new IpcError(
        "bad_request",
        "Informe um endereço IPv4 privado válido da câmera ou do gravador.",
      );
    }

    this.discoveryRunningAt = new Date().toISOString();

    try {
      const [ffmpegPath, ffprobePath] = await Promise.all([
        this.ffmpegPath ? Promise.resolve(this.ffmpegPath) : resolveFfmpeg(),
        resolveFfprobe(),
      ]);

      await onProgress?.({
        step: "scanning",
        percent: 15,
        message: "Procurando câmeras na rede da loja.",
      });

      const devices = await discoverDevices({
        log: (message) => this.logger.info(message),
        ...(requestedHosts.length > 0
          ? { hosts: requestedHosts }
          : {}),
      });

      this.logger.info(`Descoberta encontrou ${devices.length} aparelho(s).`);

      await onProgress?.({
        step: "testing",
        percent: 45,
        found: devices.length,
        message:
          devices.length === 1
            ? "Encontramos 1 aparelho. Testando a imagem."
            : `Encontramos ${devices.length} aparelhos. Testando a imagem de cada um.`,
      });

      // Um aparelho inválido não pode impedir a validação da câmera correta.
      // Quatro workers limitam o uso de FFmpeg sem voltar ao processamento
      // sequencial que levou quase cinco minutos na primeira conta real.
      const results = await mapWithConcurrency(
        devices,
        4,
        (device) =>
          discoverDeviceStreams({
            device,
            credentials,
            channels: channels.length > 0 ? channels : [1],
            tools: { ffmpegPath, ffprobePath },
            log: (message) => this.logger.info(message),
          }),
      );

      this.discovery = results;

      return {
        devices: results.map((entry) => this.summarizeDiscovery(entry)),
      };
    } finally {
      this.discoveryRunningAt = null;
    }
  }

  /** Hosts já protegidos no cofre local, sem usuário, senha ou caminho. */
  private async configuredHosts() {
    const hosts = new Set<string>();
    const config = this.config;
    if (!config) return hosts;

    for (const local of Object.values(config.cameras)) {
      try {
        const rtspUrl = await this.vault.open(local.protectedRtsp);
        const host = new URL(rtspUrl).hostname;
        if (host) hosts.add(host);
      } catch (error) {
        this.logger.warn(
          `Não foi possível comparar uma câmera já configurada: ${errorMessage(error)}`,
        );
      }
    }

    return hosts;
  }

  /**
   * Fluxo usado pelo instalador 0.10.7.
   *
   * Uma credencial pode abrir várias câmeras. O usuário repete a mesma tela
   * somente quando algum grupo usa outro usuário ou outra senha. Cada host já
   * vinculado é ignorado nas tentativas seguintes, evitando duplicatas.
   */
  private async autoConfigureDiscovered(
    payload: Record<string, unknown>,
    onProgress?: DiscoveryProgress,
  ) {
    const config = this.config;
    const token = this.token;

    if (!config || !token) {
      throw new IpcError("not_paired", "O Agent ainda não foi pareado.");
    }

    await this.runDiscovery(payload, onProgress);

    const configuredHosts = await this.configuredHosts();
    const alreadyConnected = this.discovery.filter(
      (entry) =>
        configuredHosts.has(entry.device.host) &&
        entry.streams.some((stream) => stream.validation.success),
    ).length;
    const entries = this.discovery
      .filter(
        (entry) =>
          !configuredHosts.has(entry.device.host) &&
          entry.streams.some((stream) => stream.validation.success),
      )
      .sort(
        (left, right) =>
          ipv4Order(left.device.host) - ipv4Order(right.device.host),
      );

    if (entries.length === 0) {
      return {
        connected: 0,
        alreadyConnected,
        configuredTotal: Object.keys(config.cameras).length,
        found: this.discovery.length,
      };
    }

    const availableCameraIds = this.cameras
      .filter((camera) => !config.cameras[camera.id]?.protectedRtsp)
      .map((camera) => camera.id);
    const assignments: Array<{
      entry: DiscoveryResult;
      cameraId: string;
    }> = [];
    let registrations = 0;

    for (const entry of entries) {
      let cameraId = availableCameraIds.shift() ?? null;

      if (!cameraId) {
        try {
          const registered = await registerDiscoveredCamera(
            config.apiBaseUrl,
            token,
            {
              suggestedName: entry.device.nameHint,
              vendor:
                entry.information?.manufacturer ?? entry.vendor ?? null,
              model:
                entry.information?.model ?? entry.device.hardwareHint ?? null,
            },
          );
          cameraId = registered.camera.id;
          registrations += 1;
        } catch (error) {
          this.logger.warn(
            `Não foi possível cadastrar a câmera encontrada: ${errorMessage(error)}`,
          );
          continue;
        }
      }

      assignments.push({ entry, cameraId });
    }

    await onProgress?.({
      step: "saving",
      percent: 80,
      found: this.discovery.length,
      message:
        assignments.length === 1
          ? "Salvando 1 câmera."
          : `Salvando ${assignments.length} câmeras.`,
    });

    if (registrations > 0) {
      // Torna as câmeras recém-cadastradas conhecidas antes de iniciar os
      // monitores. As URLs ainda não existem e permanecem só no cofre local.
      await this.syncConfiguration();
    }

    let connected = 0;

    for (const assignment of assignments) {
      try {
        await this.bindDiscovered({
          deviceId: assignment.entry.device.id,
          cameraId: assignment.cameraId,
          streamIndex: 0,
        });
        connected += 1;
      } catch (error) {
        this.logger.warn(
          `Não foi possível vincular ${assignment.entry.device.host}: ${errorMessage(error)}`,
        );
      }
    }

    return {
      connected,
      alreadyConnected,
      configuredTotal: Object.keys(config.cameras).length,
      found: this.discovery.length,
    };
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

    // O endereço já está protegido e persistido neste ponto. Falha ao abrir
    // o monitor agora deve aparecer no diagnóstico e ser retentada pelo
    // serviço, mas não pode fazer o instalador afirmar que nada foi salvo.
    try {
      await this.syncMonitoring();
    } catch (error) {
      this.logger.warn(
        `A câmera foi vinculada, mas o monitor iniciará em nova tentativa: ${errorMessage(error)}`,
      );
    }

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
      paired: hasUsablePairing(
        Boolean(this.config),
        this.tokenState,
        this.unauthorized,
      ),
      unauthorized: this.unauthorized,
      everAuthenticated: this.everAuthenticated,
      tokenState: this.tokenState,
      agentName: this.config?.agentName ?? null,
      apiBaseUrl: this.config?.apiBaseUrl ?? null,
      lastSyncAt: this.lastSyncAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      camerasKnown: this.cameras.length,
      camerasConfiguredLocal: this.config
        ? Object.keys(this.config.cameras).length
        : 0,
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
      // Reflete o estado real do cofre. A versão anterior mostrava o token
      // como aceito mesmo quando o DPAPI havia falhado ao abri-lo, porque só
      // considerava a resposta do servidor — que nunca chegou a ser feita.
      tokenState: this.tokenState,
      unauthorized: this.unauthorized,
      everAuthenticated: this.everAuthenticated,
      cameraFailures: [...this.cameraBackoff.entries()].map(([id, item]) => ({
        cameraId: id,
        code: item.code,
        message: item.message,
        attempts: item.attempts,
        nextAttemptAt: new Date(item.nextAttemptAt).toISOString(),
      })),
      ffmpeg,
      ffmpegError,
      queue: stats,
      logs,
      system: metrics,
      transport: this.ipc?.endpoint.transport ?? null,
    };
  }
}
