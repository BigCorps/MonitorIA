import os from "node:os";
import { AgentService } from "../service.js";
import { ApiError, sendHeartbeat } from "../api.js";
import { resolveConfigDirectory, saveConfig } from "../config.js";
import { platformMetadata, systemMetrics } from "../system.js";
import { submitCameraEventV102 } from "./api.js";
import { AGENT_V102_VERSION } from "./version.js";

const QUEUE_TICK_MS = 3_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
const SCHEDULER_MARK = Symbol.for("monitoria.v102.scheduler.installed");
const RUNTIME_HEARTBEAT_MARK = Symbol.for(
  "monitoria.v102.scheduler.runtime-heartbeat",
);

const proto = AgentService.prototype as any;
type V102Service = any;

function cameraMap(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, any>;
}

export function mergePreservedCameraConfig(
  previous: Record<string, any>,
  current: Record<string, any>,
) {
  return {
    ...previous,
    ...current,
  };
}

function classify(error: unknown): "retry" | "reject" | "unauthorized" {
  if (!(error instanceof ApiError)) return "retry";
  const status = Number((error as any).status ?? 0);
  if (status === 401) return "unauthorized";
  if (status === 409 || status === 429 || status >= 500) return "retry";
  if (status >= 400) return "reject";
  return "retry";
}

function concurrencyFromResources(
  envName: string,
  fallbackDivisor: number,
  maximum: number,
) {
  const configured = Number(process.env[envName] ?? "");
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(1, Math.min(maximum, Math.floor(configured)));
  }

  const cpus =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length;

  return Math.max(
    2,
    Math.min(maximum, Math.ceil(cpus / fallbackDivisor)),
  );
}

async function sendQueuedEntryV102(
  service: V102Service,
  entry: any,
) {
  const config = service.config;
  const token = service.token;
  const ffmpegPath = service.ffmpegPath;

  if (!config || !token || !ffmpegPath) {
    await service.queue.releaseLease(entry.id, entry.leaseToken);
    return;
  }

  try {
    await submitCameraEventV102(
      config.apiBaseUrl,
      token,
      entry.event,
      ffmpegPath,
    );
    await service.queue.complete(entry.id, entry.leaseToken);
    service.__v102EventsSentTotal =
      Number(service.__v102EventsSentTotal ?? 0) + 1;
    service.logger.info(
      `Evento ${entry.id} entregue ao pipeline durável v2.`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    const kind = classify(error);

    if (kind === "unauthorized") {
      await service.queue.releaseLease(
        entry.id,
        entry.leaseToken,
      );
      service.handleUnauthorized();
    } else if (kind === "reject") {
      await service.queue.reject(
        entry.id,
        message,
        entry.leaseToken,
      );
    } else {
      await service.queue.defer(
        entry.id,
        message,
        entry.leaseToken,
      );
    }
  }
}

async function tickQueueV102Scheduled(service: V102Service) {
  if (service.shuttingDown || service.unauthorized) return;
  if (!service.config || !service.token || !service.ffmpegPath) {
    return;
  }

  const workers: Set<Promise<void>> =
    (service.__v102ScheduledEventWorkers ??=
      new Set<Promise<void>>());

  const maxWorkers = concurrencyFromResources(
    "MONITORIA_EVENT_UPLOAD_CONCURRENCY",
    2,
    12,
  );
  const free = Math.max(0, maxWorkers - workers.size);
  if (!free) return;

  const entries = await service.queue.claimFair(
    free,
    180_000,
  );

  for (const entry of entries) {
    const task = sendQueuedEntryV102(
      service,
      entry,
    ).finally(() => workers.delete(task));
    workers.add(task);
  }
}

async function tickHeartbeatV102Scheduled(
  service: V102Service,
) {
  if (
    service.__v102ScheduledHeartbeatBusy ||
    service.shuttingDown ||
    service.unauthorized
  ) {
    return;
  }

  const config = service.config;
  const token = service.token;
  if (!config || !token) return;

  service.__v102ScheduledHeartbeatBusy = true;

  try {
    const stats = await service.queue.stats();
    const directory = await resolveConfigDirectory();
    const metrics = await systemMetrics(
      directory,
      stats.pending,
    );
    const runtimes = [...service.runtimes.values()];
    const active = runtimes.filter(
      (runtime: any) =>
        runtime.monitor?.isRunning?.(),
    ).length;
    const expectedActive =
      service.cameras.filter(
        (camera: any) => camera.monitoringEnabled,
      ).length;
    const reconnects = runtimes.reduce(
      (sum: number, runtime: any) =>
        sum +
        Number(
          runtime.clipBuffer?.reconnectCount?.() ?? 0,
        ),
      0,
    );
    const videoRuntime = runtimes.find(
      (runtime: any) => runtime.clipBuffer?.diskStats,
    );
    const videoStats = videoRuntime
      ? await videoRuntime.clipBuffer
          .diskStats()
          .catch(() => null)
      : null;

    const eventsTotal = Number(
      service.__v102EventsSentTotal ?? 0,
    );
    const clipsTotal = Number(
      service.__v102ClipsSentTotal ?? 0,
    );
    const reconnectsTotal = reconnects;
    const videoEvidenceEvictionsTotal = Number(
      videoStats?.evidenceEvictionsTotal ?? 0,
    );
    const videoTimelineEvictionsTotal = Number(
      videoStats?.timelineEvictionsTotal ?? 0,
    );

    const previousEvents = Number(
      service.__v102LastHeartbeatEventsSentTotal ?? 0,
    );
    const previousClips = Number(
      service.__v102LastHeartbeatClipsSentTotal ?? 0,
    );
    const previousReconnects = Number(
      service.__v102LastHeartbeatRtspReconnectsTotal ??
        0,
    );
    const previousEvidenceEvictions = Number(
      service
        .__v102LastHeartbeatVideoEvidenceEvictionsTotal ??
        0,
    );
    const previousTimelineEvictions = Number(
      service
        .__v102LastHeartbeatVideoTimelineEvictionsTotal ??
        0,
    );

    const delta = (
      current: number,
      previous: number,
    ) =>
      current >= previous
        ? current - previous
        : current;

    await sendHeartbeat(
      config.apiBaseUrl,
      token,
      {
        version: AGENT_V102_VERSION,
        platform: process.platform,
        architecture: process.arch,
        ...metrics,
        metadata: {
          ...platformMetadata(),
          runtimeArchitecture:
            "monitoria-1.0.2",
          eventTransport: "durable-v2",
          scheduler: "explicit-v2",
          queueBytes: stats.totalBytes,
          queueDropped: stats.dropped,
          queueRejected: stats.rejected,
          queueOldestAt: stats.oldestCreatedAt,
          queueAgeSeconds:
            stats.oldestAgeSeconds,
          queueLeased: stats.leased,
          camerasWithBacklog:
            stats.camerasPending,
          activeCameras: active,
          degradedCameras: Math.max(
            0,
            expectedActive - active,
          ),
          eventsSentTotal: eventsTotal,
          clipsSentTotal: clipsTotal,
          rtspReconnectsTotal:
            reconnectsTotal,
          eventsSentDelta: delta(
            eventsTotal,
            previousEvents,
          ),
          clipsSentDelta: delta(
            clipsTotal,
            previousClips,
          ),
          rtspReconnectsDelta: delta(
            reconnectsTotal,
            previousReconnects,
          ),
          clipBacklog: Number(
            videoStats?.evidenceClips ?? 0,
          ),
          videoBytes: Number(
            videoStats?.totalBytes ?? 0,
          ),
          videoTimelineBytes: Number(
            videoStats?.timelineBytes ?? 0,
          ),
          videoEvidenceBytes: Number(
            videoStats?.evidenceBytes ?? 0,
          ),
          videoBudgetBytes: Number(
            videoStats?.maxVideoBytes ?? 0,
          ),
          videoEvidenceEvictionsTotal,
          videoTimelineEvictionsTotal,
          videoEvidenceEvictionsDelta: delta(
            videoEvidenceEvictionsTotal,
            previousEvidenceEvictions,
          ),
          videoTimelineEvictionsDelta: delta(
            videoTimelineEvictionsTotal,
            previousTimelineEvictions,
          ),
        },
      },
    );

    service.__v102LastHeartbeatEventsSentTotal =
      eventsTotal;
    service.__v102LastHeartbeatClipsSentTotal =
      clipsTotal;
    service.__v102LastHeartbeatRtspReconnectsTotal =
      reconnectsTotal;
    service
      .__v102LastHeartbeatVideoEvidenceEvictionsTotal =
      videoEvidenceEvictionsTotal;
    service
      .__v102LastHeartbeatVideoTimelineEvictionsTotal =
      videoTimelineEvictionsTotal;
    service.lastHeartbeatAt =
      new Date().toISOString();
  } catch (error) {
    if (classify(error) === "unauthorized") {
      service.handleUnauthorized();
    } else {
      service.logger.warn(
        `Falha no heartbeat explícito 1.0.2: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  } finally {
    service.__v102ScheduledHeartbeatBusy = false;
  }
}

/**
 * A 1.0.2 continua usando seu heartbeat explícito por padrão.
 *
 * A 1.0.3 chama esta função depois de substituir
 * AgentService.prototype.tickHeartbeat pelo runtime 1.0.3.
 * Dessa forma preservamos integralmente o scheduler/fila v2 e mudamos
 * somente quem produz o heartbeat.
 */
export function useRuntimeHeartbeatForV102Scheduler() {
  proto[RUNTIME_HEARTBEAT_MARK] = true;
}

async function tickScheduledHeartbeat(
  service: V102Service,
) {
  if (
    proto[RUNTIME_HEARTBEAT_MARK] === true &&
    typeof service.tickHeartbeat === "function"
  ) {
    await service.tickHeartbeat();
    return;
  }

  await tickHeartbeatV102Scheduled(service);
}

export function installV102Scheduler() {
  if (proto[SCHEDULER_MARK] === true) return;

  const startWithV102Runtime = proto.start;
  const pairWithV102Runtime = proto.pair;

  if (typeof startWithV102Runtime !== "function") {
    throw new Error(
      "monitoria_v102_scheduler_start_missing",
    );
  }
  if (typeof pairWithV102Runtime !== "function") {
    throw new Error(
      "monitoria_v102_scheduler_pair_missing",
    );
  }

  proto.start = async function (
    this: V102Service,
    ...args: any[]
  ) {
    const timersBeforeStart =
      Array.isArray(this.timers)
        ? this.timers.length
        : 0;

    const result =
      await startWithV102Runtime.apply(
        this,
        args,
      );

    const timers =
      Array.isArray(this.timers)
        ? this.timers
        : [];
    const addedTimers =
      timers.slice(timersBeforeStart);

    // AgentService.start registra, nesta ordem: fila legado,
    // heartbeat legado e câmera. O wrapper 1.0.2 acrescenta
    // o worker de clips.
    if (addedTimers.length < 4) {
      throw new Error(
        `monitoria_v102_scheduler_timer_contract_mismatch:${addedTimers.length}`,
      );
    }

    clearInterval(addedTimers[0]);
    clearInterval(addedTimers[1]);

    const queueTimer = setInterval(
      () =>
        void tickQueueV102Scheduled(this),
      QUEUE_TICK_MS,
    );

    const heartbeatTimer = setInterval(
      () =>
        void tickScheduledHeartbeat(this),
      HEARTBEAT_INTERVAL_MS,
    );

    this.timers = [
      ...timers.slice(0, timersBeforeStart),
      queueTimer,
      heartbeatTimer,
      ...addedTimers.slice(2),
    ];

    this.logger.info(
      "Scheduler 1.0.2 ativado: fila e heartbeat legados desligados; transporte durável v2 obrigatório.",
    );

    void tickQueueV102Scheduled(this);
    void tickScheduledHeartbeat(this);

    return result;
  };

  proto.pair = async function (
    this: V102Service,
    ...args: any[]
  ) {
    const previousCameras = {
      ...cameraMap(this.config?.cameras),
    };

    const result =
      await pairWithV102Runtime.apply(
        this,
        args,
      );

    const config = this.config;
    if (config) {
      const merged =
        mergePreservedCameraConfig(
          previousCameras,
          cameraMap(config.cameras),
        );

      config.cameras = merged;
      await saveConfig(config);

      try {
        await this.syncConfiguration();
      } catch (error) {
        this.logger.warn(
          `Pareamento concluído, mas a ressincronização 1.0.2 falhou: ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
      }
    }

    void tickQueueV102Scheduled(this);
    void tickScheduledHeartbeat(this);

    this.logger.info(
      `Pareamento 1.0.2 atualizado: ${
        Object.keys(previousCameras).length
      } configuração(ões) local(is) preservada(s); heartbeat v2 disparado.`,
    );

    return result;
  };

  proto[SCHEDULER_MARK] = true;
}

export function assertV102SchedulerInstalled() {
  if (proto[SCHEDULER_MARK] !== true) {
    throw new Error(
      "monitoria_v102_scheduler_not_installed",
    );
  }
}

export function v102SchedulerContract() {
  return {
    version: AGENT_V102_VERSION,
    eventTransport: "durable-v2",
    eventEndpointPrefix:
      "/api/agent/v2/cameras/",
    heartbeatProfile:
      proto[RUNTIME_HEARTBEAT_MARK] === true
        ? "runtime"
        : "v102",
    legacyQueueAndHeartbeatTimersDisabled: true,
    preservesLocalCameraStateOnRepair: true,
    pairingRefreshesV102Immediately: true,
  } as const;
}
