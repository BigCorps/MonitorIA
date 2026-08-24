import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { AgentService, DEFAULT_API_URL, hasUsablePairing } from "../service.js";
import {
  ApiError,
  pairAgent,
  sendCameraStatus,
  sendHeartbeat,
  startCaptureSession,
  uploadClipToSignedUrl,
} from "../api.js";
import { resolveConfigDirectory, saveConfig } from "../config.js";
import { classifyCameraFailure, retryDelayMs } from "../camera-failure.js";
import { resolveFfmpeg } from "../ffmpeg.js";
import { resolveFfprobe } from "../discovery/binaries.js";
import { compatibilityRecordFrom, discoverDevices, discoverDeviceStreams, type DiscoveryResult } from "../discovery/index.js";
import { buildCandidateUrl, candidatesFor, normalizeForRegistry } from "../discovery/catalog.js";
import { openRtspPorts } from "../discovery/scan.js";
import { validateStream } from "../discovery/validate.js";
import { IpcError } from "../ipc-protocol.js";
import { startCameraEventMonitor } from "../event-monitor.js";
import { CircularClipBuffer } from "../clip-buffer.js";
import { platformMetadata, systemMetrics } from "../system.js";
import { AGENT_V102_VERSION } from "./version.js";
import {
  normalizeAgentApiBaseUrl,
  requestAgentJsonV102,
  submitCameraEventV102,
} from "./api.js";
import type { LocalMotionEvent } from "../types.js";

const proto = AgentService.prototype as any;
let installed = false;

type V102Service = any;

function classify(error: unknown): "retry" | "reject" | "unauthorized" {
  if (!(error instanceof ApiError)) return "retry";
  if (error.status === 401) return "unauthorized";
  if (error.status === 409 || error.status === 429 || error.status >= 500) return "retry";
  if (error.status >= 400) return "reject";
  return "retry";
}

function requireRuntimeString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new IpcError("bad_request", `O campo "${key}" é obrigatório.`);
  }
  return value.trim();
}

async function pairV102(this: V102Service, payload: Record<string, unknown>) {
  if (hasUsablePairing(Boolean(this.config), this.tokenState, this.unauthorized)) {
    throw new IpcError(
      "bad_request",
      'Este computador já está pareado. Use "unpair" antes de parear novamente.',
    );
  }

  const code = requireRuntimeString(payload, "code");
  const apiBaseUrl = normalizeAgentApiBaseUrl(
    typeof payload.apiBaseUrl === "string" && payload.apiBaseUrl.trim()
      ? payload.apiBaseUrl.trim()
      : DEFAULT_API_URL,
  );
  const agentName =
    typeof payload.agentName === "string" && payload.agentName.trim()
      ? payload.agentName.trim()
      : `Agent ${os.hostname()}`;

  let paired: any;
  try {
    paired = await pairAgent(apiBaseUrl, {
      code,
      agentName,
      platform: process.platform,
      architecture: process.arch,
      version: AGENT_V102_VERSION,
      metadata: {
        ...platformMetadata(),
        runtimeArchitecture: "monitoria-1.0.2",
      },
    });
  } catch (error) {
    throw new IpcError(
      "bad_request",
      `Pareamento recusado: ${error instanceof Error ? error.message : String(error)}. ` +
        "Confira o código e gere outro se já tiver passado de 15 minutos.",
    );
  }

  const nextConfig = {
    schemaVersion: 2 as const,
    secretScope: "local-machine" as const,
    apiBaseUrl,
    agentId: paired.agent.id,
    agentName,
    protectedAgentToken: await this.vault.seal(paired.agent.token),
    pairedAt: new Date().toISOString(),
    cameras: {},
  };

  // Só troca o estado local depois que o servidor aceitou o código e o novo
  // token já está protegido. Upgrade 1.0.1 -> 1.0.2 não toca neste caminho.
  // O wrapper do scheduler restaura os RTSPs locais depois de um reparo.
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

  await saveConfig(nextConfig);
  this.config = nextConfig;
  this.logger.info(
    paired.camera
      ? `Agent 1.0.2 pareado com a câmera "${paired.camera.name}".`
      : "Agent 1.0.2 pareado com o local. Aguardando a busca de câmeras pelo painel.",
  );
  await this.bootstrap();

  return {
    agentId: paired.agent.id,
    agentName,
    cameraId: paired.camera?.id ?? null,
    cameraName: paired.camera?.name ?? null,
  };
}

async function reportCompatibilityV102(
  this: V102Service,
  entry: DiscoveryResult,
  chosen: DiscoveryResult["streams"][number],
) {
  const config = this.config;
  const token = this.token;
  if (!config || !token) return;
  const record = compatibilityRecordFrom(entry, chosen, AGENT_V102_VERSION);

  try {
    await requestAgentJsonV102(
      config.apiBaseUrl,
      token,
      "/api/agent/compatibility",
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(record),
      },
    );
  } catch (error) {
    this.logger.warn(
      `Falha ao registrar compatibilidade 1.0.2: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function concurrencyFromResources(envName: string, fallbackDivisor: number, maximum: number) {
  const configured = Number(process.env[envName] ?? "");
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(maximum, Math.floor(configured)));
  }
  const cpus = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  return Math.max(2, Math.min(maximum, Math.ceil(cpus / fallbackDivisor)));
}

async function sendQueuedEntry(service: V102Service, entry: any) {
  const config = service.config;
  const token = service.token;
  const ffmpegPath = service.ffmpegPath;
  if (!config || !token || !ffmpegPath) {
    await service.queue.releaseLease(entry.id, entry.leaseToken);
    return;
  }

  try {
    await submitCameraEventV102(config.apiBaseUrl, token, entry.event, ffmpegPath);
    await service.queue.complete(entry.id, entry.leaseToken);
    service.__v102EventsSentTotal = Number(service.__v102EventsSentTotal ?? 0) + 1;
    service.logger.info(`Evento ${entry.id} entregue e persistido pelo backend 1.0.2.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const kind = classify(error);
    if (kind === "unauthorized") {
      await service.queue.releaseLease(entry.id, entry.leaseToken);
      service.handleUnauthorized();
    } else if (kind === "reject") {
      await service.queue.reject(entry.id, message, entry.leaseToken);
    } else {
      await service.queue.defer(entry.id, message, entry.leaseToken);
    }
  }
}

async function tickQueueV102(this: V102Service) {
  if (this.shuttingDown || this.unauthorized) return;
  if (!this.config || !this.token || !this.ffmpegPath) return;

  const workers: Set<Promise<void>> = this.__v102EventWorkers ??= new Set();
  const maxWorkers = concurrencyFromResources("MONITORIA_EVENT_UPLOAD_CONCURRENCY", 2, 12);
  const free = Math.max(0, maxWorkers - workers.size);
  if (!free) return;

  const entries = await this.queue.claimFair(free, 180_000);
  for (const entry of entries) {
    const task = sendQueuedEntry(this, entry).finally(() => workers.delete(task));
    workers.add(task);
  }
}

function cameraSignatureV102(camera: any, localRtsp: string | null) {
  return JSON.stringify({
    localRtsp: localRtsp ?? null,
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

/**
 * Substitui apenas o núcleo de monitoramento do service.ts 1.0.1.
 *
 * O restante do serviço (cofre, pareamento, IPC, recuperação de IP e
 * configuração) permanece literalmente o código já homologado. Aqui ficam
 * as garantias novas: timeline única, enqueue DURÁVEL aguardado e versão
 * correta da sessão. Não existe fire-and-forget para gravar acontecimento.
 */
async function syncMonitoringV102(this: V102Service) {
  const config = this.config;
  const token = this.token;
  const ffmpegPath = this.ffmpegPath;
  if (!config || !token || !ffmpegPath || this.unauthorized) return;

  const knownIds = new Set(this.cameras.map((camera: any) => camera.id));
  for (const cameraId of [...this.runtimes.keys()]) {
    if (!knownIds.has(cameraId)) await this.stopRuntime(cameraId, "camera_removed");
  }

  for (const camera of this.cameras) {
    const existing = this.runtimes.get(camera.id);
    const local = config.cameras[camera.id];
    const signature = cameraSignatureV102(camera, local?.protectedRtsp ?? null);

    if (!camera.monitoringEnabled || !camera.activeProfileId || !camera.activeProfileVersion) {
      if (existing) await this.stopRuntime(camera.id, "active_profile_removed");
      continue;
    }

    if (!local?.protectedRtsp) {
      this.logger.info(`A câmera "${camera.name}" aguarda o endereço RTSP ser informado.`);
      continue;
    }

    if (existing && existing.signature === signature && existing.monitor.isRunning()) continue;

    const backoff = this.cameraBackoff.get(camera.id);
    if (backoff && Date.now() < backoff.nextAttemptAt) continue;
    if (existing) await this.stopRuntime(camera.id, "configuration_changed");

    try {
      const rtspUrl = await this.vault.open(local.protectedRtsp);
      const session = await startCaptureSession(config.apiBaseUrl, token, camera.id, {
        agentVersion: AGENT_V102_VERSION,
        profileId: camera.activeProfileId,
        profileVersion: camera.activeProfileVersion,
        planCode: camera.plan,
        captureIntervalSeconds: camera.captureIntervalSeconds,
        consolidationIntervalSeconds: camera.consolidationIntervalSeconds,
        motionAdaptiveEnabled: camera.motionAdaptiveEnabled,
        motionOverlayMask: camera.motionOverlayMask,
        monitoringSchedule: camera.monitoringSchedule,
        runtimeArchitecture: "monitoria-1.0.2",
      });

      const monitor = startCameraEventMonitor({
        camera,
        ffmpegPath,
        rtspUrl,
        sessionId: session.sessionId,
        enqueue: async (event: LocalMotionEvent) => {
          await this.queue.enqueue(event);
          return true;
        },
        log: (message: string) => this.logger.info(message),
        onFatalError: (error: Error) => {
          const failure = classifyCameraFailure(error.message);
          const previous = this.cameraBackoff.get(camera.id);
          const attempts = Number(previous?.attempts ?? 0) + 1;
          this.cameraBackoff.set(camera.id, {
            attempts,
            nextAttemptAt: Date.now() + retryDelayMs(failure, attempts),
            code: failure.code,
            message: failure.message,
          });
          this.logger.error(`Monitor de "${camera.name}" falhou (${failure.code}): ${failure.message}`);
          this.logger.warn(`Detalhe técnico de "${camera.name}": ${error.message}`);
          if (attempts >= 3 && failure.code !== "unauthorized") {
            void this.recoverCameraAddress(camera.id, camera.name);
          }
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
            log: (message: string) => this.logger.info(message),
          });
          await clipBuffer.start();
        } catch (error) {
          clipBuffer = null;
          this.logger.warn(
            `O monitoramento continuará e preservará acontecimentos mesmo sem worker de vídeo em "${camera.name}": ` +
              `${error instanceof Error ? error.message : String(error)}`,
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
        `Monitoramento ${camera.plan} 1.0.2 iniciado em "${camera.name}" · perfil v${camera.activeProfileVersion}.`,
      );
    } catch (error) {
      if (classify(error) === "unauthorized") {
        this.handleUnauthorized();
        return;
      }
      this.logger.error(
        `Não foi possível iniciar o monitor 1.0.2 de "${camera.name}": ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

async function jsonRequest(
  base: string,
  token: string,
  pathName: string,
  init: RequestInit = {},
) {
  return requestAgentJsonV102<any>(base, token, pathName, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) ?? {}),
    },
  });
}

async function processClip(service: V102Service, request: any) {
  const config = service.config;
  const token = service.token;
  if (!config || !token) return;
  const buffer = service.runtimes.get(request.cameraId)?.clipBuffer;
  let built: any = null;
  let builtFromPreservedEvidence = false;

  try {
    if (!buffer) throw new Error("clip_timeline_unavailable");
    built = request.agentEventId
      ? await buffer.preservedClip(String(request.agentEventId))
      : null;
    builtFromPreservedEvidence = Boolean(built);
    if (!built) built = await buffer.buildClip(request);
    const uploaded = await uploadClipToSignedUrl(request.signedUrl, built.path);
    await jsonRequest(config.apiBaseUrl, token, `/api/agent/clips/${request.requestId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        status: "ready",
        assetId: request.assetId,
        claimToken: request.claimToken,
        byteSize: uploaded.byteSize,
        contentSha256: uploaded.contentSha256,
        durationSeconds: built.durationSeconds,
        generationMs: built.generationMs,
        cpuTimeMs: built.cpuTimeMs ?? 0,
        segmentsUsed: built.segmentsUsed,
        transcoded: Boolean(built.transcoded),
        sourceBitrateKbps: built.sourceBitrateKbps ?? null,
        outputBitrateKbps: built.outputBitrateKbps ?? null,
        segmentIds: Array.isArray(built.segmentIds) ? built.segmentIds : [],
        errorCode: null,
        errorMessage: null,
      }),
    });
    service.__v102ClipsSentTotal = Number(service.__v102ClipsSentTotal ?? 0) + 1;
    if (request.agentEventId) {
      await buffer.removePreservedClip(String(request.agentEventId)).catch(() => undefined);
    }
    service.logger.info(`Vídeo do acontecimento ${request.eventId} enviado (${built.transcoded ? "H.264 comprimido" : "H.264 passthrough"}).`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    service.logger.warn(`Vídeo independente falhou e será tentado novamente: ${message}`);
    await jsonRequest(config.apiBaseUrl, token, `/api/agent/clips/${request.requestId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        status: "failed",
        assetId: request.assetId,
        claimToken: request.claimToken,
        byteSize: 0,
        contentSha256: null,
        durationSeconds: null,
        generationMs: built?.generationMs ?? 0,
        cpuTimeMs: built?.cpuTimeMs ?? 0,
        segmentsUsed: built?.segmentsUsed ?? 0,
        transcoded: Boolean(built?.transcoded),
        sourceBitrateKbps: built?.sourceBitrateKbps ?? null,
        outputBitrateKbps: built?.outputBitrateKbps ?? null,
        segmentIds: Array.isArray(built?.segmentIds) ? built.segmentIds : [],
        errorCode: "clip_generation_or_upload_failed",
        errorMessage: message.slice(0, 900),
      }),
    }).catch(() => undefined);
  } finally {
    if (built?.path && !builtFromPreservedEvidence) {
      await rm(path.dirname(built.path), { recursive: true, force: true });
    }
  }
}

async function tickClipsV102(this: V102Service) {
  if (this.shuttingDown || this.unauthorized || !this.config || !this.token) return;
  const workers: Set<Promise<void>> = this.__v102ClipWorkers ??= new Set();
  const maxWorkers = concurrencyFromResources("MONITORIA_CLIP_CONCURRENCY", 4, 4);
  let free = Math.max(0, maxWorkers - workers.size);

  while (free > 0) {
    let payload: any;
    try {
      payload = await jsonRequest(this.config.apiBaseUrl, this.token, "/api/agent/v2/clips/pending", { method: "GET" });
    } catch (error) {
      if (classify(error) === "unauthorized") this.handleUnauthorized();
      return;
    }
    const request = payload?.request;
    if (!request) return;
    const task = processClip(this, request).finally(() => workers.delete(task));
    workers.add(task);
    free -= 1;
  }
}

async function tickHeartbeatV102(this: V102Service) {
  if (this.__v102HeartbeatBusy || this.shuttingDown || this.unauthorized) return;
  const config = this.config;
  const token = this.token;
  if (!config || !token) return;
  this.__v102HeartbeatBusy = true;
  try {
    const stats = await this.queue.stats();
    const directory = await resolveConfigDirectory();
    const metrics = await systemMetrics(directory, stats.pending);
    const runtimes = [...this.runtimes.values()];
    const active = runtimes.filter((r: any) => r.monitor?.isRunning?.()).length;
    const expectedActive = this.cameras.filter((camera: any) => camera.monitoringEnabled).length;
    const reconnects = runtimes.reduce((sum: number, r: any) => sum + Number(r.clipBuffer?.reconnectCount?.() ?? 0), 0);
    const videoRuntime = runtimes.find((runtime: any) => runtime.clipBuffer?.diskStats);
    const videoStats = videoRuntime ? await videoRuntime.clipBuffer.diskStats().catch(() => null) : null;
    const eventsTotal = Number(this.__v102EventsSentTotal ?? 0);
    const clipsTotal = Number(this.__v102ClipsSentTotal ?? 0);
    const reconnectsTotal = reconnects;
    const videoEvidenceEvictionsTotal = Number(videoStats?.evidenceEvictionsTotal ?? 0);
    const videoTimelineEvictionsTotal = Number(videoStats?.timelineEvictionsTotal ?? 0);
    const previousEvidenceEvictions = Number(this.__v102LastHeartbeatVideoEvidenceEvictionsTotal ?? 0);
    const previousTimelineEvictions = Number(this.__v102LastHeartbeatVideoTimelineEvictionsTotal ?? 0);
    const evidenceEvictionsDelta = videoEvidenceEvictionsTotal >= previousEvidenceEvictions
      ? videoEvidenceEvictionsTotal - previousEvidenceEvictions
      : videoEvidenceEvictionsTotal;
    const timelineEvictionsDelta = videoTimelineEvictionsTotal >= previousTimelineEvictions
      ? videoTimelineEvictionsTotal - previousTimelineEvictions
      : videoTimelineEvictionsTotal;
    const previousEvents = Number(this.__v102LastHeartbeatEventsSentTotal ?? 0);
    const previousClips = Number(this.__v102LastHeartbeatClipsSentTotal ?? 0);
    const previousReconnects = Number(this.__v102LastHeartbeatRtspReconnectsTotal ?? 0);
    const eventsDelta = eventsTotal >= previousEvents ? eventsTotal - previousEvents : eventsTotal;
    const clipsDelta = clipsTotal >= previousClips ? clipsTotal - previousClips : clipsTotal;
    const reconnectsDelta = reconnectsTotal >= previousReconnects
      ? reconnectsTotal - previousReconnects
      : reconnectsTotal;
    await sendHeartbeat(config.apiBaseUrl, token, {
      version: AGENT_V102_VERSION,
      platform: process.platform,
      architecture: process.arch,
      ...metrics,
      metadata: {
        ...platformMetadata(),
        runtimeArchitecture: "monitoria-1.0.2",
        queueBytes: stats.totalBytes,
        queueDropped: stats.dropped,
        queueRejected: stats.rejected,
        queueOldestAt: stats.oldestCreatedAt,
        queueAgeSeconds: stats.oldestAgeSeconds,
        queueLeased: stats.leased,
        camerasWithBacklog: stats.camerasPending,
        activeCameras: active,
        degradedCameras: Math.max(0, expectedActive - active),
        eventsSentTotal: eventsTotal,
        clipsSentTotal: clipsTotal,
        rtspReconnectsTotal: reconnectsTotal,
        eventsSentDelta: eventsDelta,
        clipsSentDelta: clipsDelta,
        rtspReconnectsDelta: reconnectsDelta,
        clipBacklog: Number(videoStats?.evidenceClips ?? 0),
        videoBytes: Number(videoStats?.totalBytes ?? 0),
        videoTimelineBytes: Number(videoStats?.timelineBytes ?? 0),
        videoEvidenceBytes: Number(videoStats?.evidenceBytes ?? 0),
        videoBudgetBytes: Number(videoStats?.maxVideoBytes ?? 0),
        videoEvidenceEvictionsTotal,
        videoTimelineEvictionsTotal,
        videoEvidenceEvictionsDelta: evidenceEvictionsDelta,
        videoTimelineEvictionsDelta: timelineEvictionsDelta,
      },
    });
    this.__v102LastHeartbeatEventsSentTotal = eventsTotal;
    this.__v102LastHeartbeatClipsSentTotal = clipsTotal;
    this.__v102LastHeartbeatRtspReconnectsTotal = reconnectsTotal;
    this.__v102LastHeartbeatVideoEvidenceEvictionsTotal = videoEvidenceEvictionsTotal;
    this.__v102LastHeartbeatVideoTimelineEvictionsTotal = videoTimelineEvictionsTotal;
    this.lastHeartbeatAt = new Date().toISOString();
  } catch (error) {
    if (classify(error) === "unauthorized") this.handleUnauthorized();
    else this.logger.warn(`Falha no heartbeat 1.0.2: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    this.__v102HeartbeatBusy = false;
  }
}

function privateIpv4(value: string) {
  const p = value.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    (p[0] === 10 || (p[0] === 172 && p[1]! >= 16 && p[1]! <= 31) || (p[0] === 192 && p[1] === 168));
}

async function mapConcurrency<T, R>(values: T[], limit: number, mapper: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const i = cursor++;
      if (values[i] !== undefined) results[i] = await mapper(values[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker));
  return results;
}

function mergeDiscovery(target: DiscoveryResult, incoming: DiscoveryResult) {
  const seen = new Set(target.streams.map((s) => `${s.channel}:${s.rtspUrl}`));
  for (const stream of incoming.streams) {
    const key = `${stream.channel}:${stream.rtspUrl}`;
    if (!seen.has(key)) { target.streams.push(stream); seen.add(key); }
  }
  if (!target.information && incoming.information) target.information = incoming.information;
  target.onvifSupported ||= incoming.onvifSupported;
  target.failure = target.streams.some((s) => s.validation.success) ? null : incoming.failure ?? target.failure;
}

async function discoverFallbackWinner(
  service: V102Service,
  device: any,
  credentials: any,
  tools: any,
  base: DiscoveryResult,
) {
  const candidates = candidatesFor({ vendor: base.vendor, includeGeneric: true })
    .filter((candidate) => /\{channel(?:2)?\}/.test(candidate.pathTemplate));
  const scannedPorts = await openRtspPorts(device.host).catch(() => [] as number[]);
  const advertisedPorts = base.streams
    .map((stream) => Number(stream.port))
    .filter((port) => Number.isFinite(port) && port > 0);
  const ports = [...new Set([...advertisedPorts, ...scannedPorts])];
  if (!ports.length) ports.push(554);

  for (const candidate of candidates) {
    const orderedPorts = [...ports].sort((left, right) => {
      if (left === candidate.defaultPort) return -1;
      if (right === candidate.defaultPort) return 1;
      return left - right;
    });

    for (const port of orderedPorts) {
      const rtspUrl = buildCandidateUrl({
        candidate,
        host: device.host,
        port,
        channel: 1,
        credentials,
      });
      const validation = await validateStream({
        ...tools,
        rtspUrl,
        credentials,
        log: () => undefined,
      });
      if (!validation.success) continue;

      service.logger.info(
        `Fallback multicanal provado em ${device.host}: ${candidate.pathTemplate} · porta ${port}.`,
      );
      return { candidate, port, validation, rtspUrl };
    }
  }
  return null;
}

async function discoverExpanded(service: V102Service, device: any, credentials: any, tools: any, expected: number) {
  const base = await discoverDeviceStreams({
    device, credentials, channels: [1], tools,
    log: (m: string) => service.logger.info(m),
  });
  const found = new Set(base.streams.filter((stream) => stream.validation.success).map((stream) => stream.channel));
  const winner = await discoverFallbackWinner(service, device, credentials, tools, base);

  if (!winner) {
    service.logger.info(
      `Nenhum caminho RTSP adicional foi provado em ${device.host}; mantendo ${found.size} canal(is) confirmado(s).`,
    );
    return base;
  }

  if (!base.streams.some((stream) => stream.rtspUrl === winner.rtspUrl)) {
    base.streams.push({
      rtspUrl: winner.rtspUrl,
      displayPath: normalizeForRegistry(winner.candidate),
      port: winner.port,
      stream: winner.candidate.stream,
      level: winner.candidate.validationLevel,
      profileToken: null,
      channel: 1,
      sourceKey: null,
      validation: winner.validation,
    });
    found.add(1);
  }

  const budgetMs = Math.min(10 * 60_000, Math.max(60_000, expected * 7_500));
  const deadline = Date.now() + budgetMs;
  const frontierKey = `${device.host}|${winner.port}|${winner.candidate.pathTemplate}`;
  const frontiers: Map<string, number> = service.__v102DiscoveryFrontier ??= new Map();
  let channel = Math.max(2, Number(frontiers.get(frontierKey) ?? 2));
  let probed = 0;

  while (Date.now() < deadline) {
    const rtspUrl = buildCandidateUrl({
      candidate: winner.candidate,
      host: device.host,
      port: winner.port,
      channel,
      credentials,
    });
    const validation = await validateStream({
      ...tools,
      rtspUrl,
      credentials,
      log: () => undefined,
    });
    probed += 1;

    if (validation.success) {
      found.add(channel);
      base.streams.push({
        rtspUrl,
        displayPath: normalizeForRegistry(winner.candidate),
        port: winner.port,
        stream: winner.candidate.stream,
        level: winner.candidate.validationLevel,
        profileToken: null,
        channel,
        sourceKey: null,
        validation,
      });
      service.logger.info(
        `Canal ${channel} confirmado em ${device.host}; ${found.size}/${expected} esperado(s).`,
      );
    }
    channel += 1;
    frontiers.set(frontierKey, channel);
  }

  base.failure = base.streams.some((stream) => stream.validation.success) ? null : base.failure;
  service.logger.info(
    `Busca multicanal concluída sem teto fixo e sem parada por lacunas: ` +
      `${found.size} canal(is) em ${device.host}, ${probed} canal(is) adicionais sondados; ` +
      `expectativa informada ${expected}.`,
  );
  return base;
}

async function runDiscoveryV102(this: V102Service, payload: Record<string, unknown>, onProgress?: (update: any) => Promise<void>) {
  if (this.discoveryRunningAt) throw new IpcError("busy", "Já existe uma varredura em andamento.");
  const username = typeof payload.username === "string" ? payload.username.trim() : "";
  if (!username) throw new IpcError("bad_request", 'O campo "username" é obrigatório.');
  const credentials = { username, password: typeof payload.password === "string" ? payload.password : "" };
  const requestedHosts = Array.isArray(payload.hosts)
    ? payload.hosts.filter((v): v is string => typeof v === "string" && privateIpv4(v.trim()))
    : [];
  if (Array.isArray(payload.hosts) && !requestedHosts.length) throw new IpcError("bad_request", "Informe um endereço IPv4 privado válido.");

  const explicit = Array.isArray(payload.channels)
    ? payload.channels.filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    : [];
  const expected = Math.max(1, Math.floor(Number(this.__v102DiscoveryHint ?? Math.max(1, ...explicit, 1))));
  this.discoveryRunningAt = new Date().toISOString();

  try {
    const [ffmpegPath, ffprobePath] = await Promise.all([
      this.ffmpegPath ? Promise.resolve(this.ffmpegPath) : resolveFfmpeg(),
      resolveFfprobe(),
    ]);
    await onProgress?.({ step: "scanning", percent: 15, message: "Procurando câmeras na rede da loja." });
    const devices = await discoverDevices({
      log: (m: string) => this.logger.info(m),
      ...(requestedHosts.length ? { hosts: requestedHosts } : {}),
    });
    await onProgress?.({
      step: "testing", percent: 45, found: devices.length,
      message: devices.length === 1 ? "Encontramos 1 aparelho. Testando a imagem." : `Encontramos ${devices.length} aparelhos. Testando os canais.`,
    });
    const tools = { ffmpegPath, ffprobePath };
    const results = await mapConcurrency(devices, 4, (device) => discoverExpanded(this, device, credentials, tools, expected));
    this.discovery = results;
    return { devices: results.map((entry: any) => this.summarizeDiscovery(entry)) };
  } finally {
    this.discoveryRunningAt = null;
  }
}

function assertServiceContract() {
  const required = [
    "start",
    "syncMonitoring",
    "stopRuntime",
    "tickQueue",
    "tickHeartbeat",
    "runDiscovery",
    "runServerDiscovery",
    "summarizeDiscovery",
    "pair",
    "reportCompatibility",
    "bootstrap",
    "recoverCameraAddress",
    "handleUnauthorized",
    "statusPayload",
    "diagnosePayload",
  ];
  const missing = required.filter((name) => typeof proto[name] !== "function");
  if (missing.length) {
    throw new Error(
      `monitoria_v102_service_contract_mismatch: ${missing.join(",")}. ` +
        "A base do Agent mudou sem atualização explícita do runtime 1.0.2.",
    );
  }
}

export function installV102Runtime() {
  if (installed) return;
  assertServiceContract();
  installed = true;

  proto.pair = pairV102;
  proto.reportCompatibility = reportCompatibilityV102;
  proto.syncMonitoring = syncMonitoringV102;
  proto.tickQueue = tickQueueV102;
  proto.tickHeartbeat = tickHeartbeatV102;
  proto.runDiscovery = runDiscoveryV102;

  const originalStart = proto.start;
  proto.start = async function(this: V102Service, ...args: any[]) {
    const result = await originalStart.apply(this, args);

    // Migração in-place e idempotente: instalações antigas podem ter guardado
    // https://www.monitoria.cam. A base 1.0.1 tolera esse endereço, mas um
    // worker novo com fetch direto perdeu Authorization no 308. Persistimos a
    // origem canônica antes de acordar o worker de clipes.
    if (this.config?.apiBaseUrl) {
      const canonical = normalizeAgentApiBaseUrl(String(this.config.apiBaseUrl));
      if (canonical !== this.config.apiBaseUrl) {
        this.config.apiBaseUrl = canonical;
        await saveConfig(this.config);
        this.logger.info(`Servidor do Agent normalizado para ${canonical}.`);
      }
    }

    const timer = setInterval(() => void tickClipsV102.call(this), 5_000);
    this.timers.push(timer);
    void tickClipsV102.call(this);
    this.logger.info(`Runtime escalável MonitorIA ${AGENT_V102_VERSION} ativado.`);
    return result;
  };

  const originalServerDiscovery = proto.runServerDiscovery;
  proto.runServerDiscovery = async function(this: V102Service, request: any) {
    this.__v102DiscoveryHint = Math.max(1, Number(request?.cameraCountHint ?? 1));
    try { return await originalServerDiscovery.call(this, request); }
    finally { this.__v102DiscoveryHint = null; }
  };

  for (const method of ["statusPayload", "diagnosePayload"]) {
    const original = proto[method];
    proto[method] = async function(this: V102Service, ...args: any[]) {
      const payload = await original.apply(this, args);
      return { ...payload, version: AGENT_V102_VERSION, runtimeArchitecture: "1.0.2" };
    };
  }
}
