import {
  ApiError,
  sendCameraStatus,
  sendHeartbeat,
  startCaptureSession,
} from "../api.js";
import {
  classifyCameraFailure,
  retryDelayMs,
} from "../camera-failure.js";
import { CircularClipBuffer } from "../clip-buffer.js";
import { resolveConfigDirectory } from "../config.js";
import {
  startCameraEventMonitor,
  type CameraEventMonitor,
} from "../event-monitor.js";
import { AgentService } from "../service.js";
import { platformMetadata, systemMetrics } from "../system.js";
import type { LocalMotionEvent } from "../types.js";
import {
  enrichOperationalEventV103,
  fetchOperationalConfigV103,
  type OperationalAccessConfigV103,
} from "./operational-config.js";
import {
  startOperationalStructuralMonitorV103,
  type StructuralMonitorV103,
} from "./structural-monitor.js";
import {
  AGENT_V103_RUNTIME_ARCHITECTURE,
  AGENT_V103_VERSION,
} from "./version.js";

const proto = AgentService.prototype as any;
let installed = false;

type V103Service = any;

function classify(
  error: unknown,
): "retry" | "reject" | "unauthorized" {
  if (!(error instanceof ApiError)) return "retry";
  if (error.status === 401) return "unauthorized";
  if (
    error.status === 409 ||
    error.status === 429 ||
    error.status >= 500
  ) {
    return "retry";
  }
  if (error.status >= 400) return "reject";
  return "retry";
}

function cameraSignatureV103(
  camera: any,
  localRtsp: string | null,
  operationalAccess:
    | OperationalAccessConfigV103
    | null
    | undefined,
) {
  return JSON.stringify({
    localRtsp: localRtsp ?? null,
    profile: camera.activeProfileId,
    profileVersion: camera.activeProfileVersion,
    plan: camera.plan,
    capture: camera.captureIntervalSeconds,
    consolidation:
      camera.consolidationIntervalSeconds,
    start: camera.motionStartThreshold,
    continue: camera.motionContinueThreshold,
    close: camera.eventCloseAfterSeconds,
    adaptive: camera.motionAdaptiveEnabled,
    overlay: camera.motionOverlayMask,
    startFrames:
      camera.motionStartConsecutiveFrames,
    endFrames: camera.motionEndConsecutiveFrames,
    cooldown: camera.motionCooldownSeconds,
    schedule: camera.monitoringSchedule,
    ignore: camera.motionIgnorePolygons,
    maximumAnalysisFrames:
      camera.maximumAnalysisFrames,
    clipEnabled: camera.clipEnabled,
    clipDurationSeconds:
      camera.clipDurationSeconds,
    operationalAccess:
      operationalAccess?.enabled
        ? operationalAccess
        : null,
  });
}

function combinedMonitor(
  regular: CameraEventMonitor,
  structural: StructuralMonitorV103 | null,
): CameraEventMonitor {
  return {
    isRunning: () =>
      regular.isRunning() &&
      (!structural || structural.isRunning()),
    framesObserved: () =>
      regular.framesObserved(),
    calibrationSnapshot: () =>
      regular.calibrationSnapshot(),
    stop: async (reason) => {
      const results = await Promise.allSettled([
        regular.stop(reason),
        structural?.stop(reason) ??
          Promise.resolve(),
      ]);

      const rejected = results.find(
        (result) => result.status === "rejected",
      );
      if (rejected?.status === "rejected") {
        throw rejected.reason;
      }
    },
  };
}

async function syncMonitoringV103(
  this: V103Service,
) {
  const config = this.config;
  const token = this.token;
  const ffmpegPath = this.ffmpegPath;

  if (
    !config ||
    !token ||
    !ffmpegPath ||
    this.unauthorized
  ) {
    return;
  }

  let operationalByCamera: Map<
    string,
    OperationalAccessConfigV103
  > =
    this.__v103OperationalConfig ??
    new Map();

  try {
    operationalByCamera =
      await fetchOperationalConfigV103(
        config.apiBaseUrl,
        token,
      );
    this.__v103OperationalConfig =
      operationalByCamera;
  } catch (error) {
    if (classify(error) === "unauthorized") {
      this.handleUnauthorized();
      return;
    }

    this.logger.warn(
      `Configuração operacional 1.0.3 temporariamente indisponível; mantendo a última configuração conhecida: ${
        error instanceof Error
          ? error.message
          : String(error)
      }`,
    );
  }

  const knownIds = new Set(
    this.cameras.map((camera: any) => camera.id),
  );

  for (const cameraId of [
    ...this.runtimes.keys(),
  ]) {
    if (!knownIds.has(cameraId)) {
      await this.stopRuntime(
        cameraId,
        "camera_removed",
      );
    }
  }

  for (const camera of this.cameras) {
    const existing =
      this.runtimes.get(camera.id);
    const local =
      config.cameras[camera.id];
    const operationalAccess =
      operationalByCamera.get(camera.id) ??
      null;

    const signature = cameraSignatureV103(
      camera,
      local?.protectedRtsp ?? null,
      operationalAccess,
    );

    if (
      !camera.monitoringEnabled ||
      !camera.activeProfileId ||
      !camera.activeProfileVersion
    ) {
      if (existing) {
        await this.stopRuntime(
          camera.id,
          "active_profile_removed",
        );
      }
      continue;
    }

    if (!local?.protectedRtsp) {
      this.logger.info(
        `A câmera "${camera.name}" aguarda o endereço RTSP ser informado.`,
      );
      continue;
    }

    if (
      existing &&
      existing.signature === signature &&
      existing.monitor.isRunning()
    ) {
      continue;
    }

    const backoff =
      this.cameraBackoff.get(camera.id);
    if (
      backoff &&
      Date.now() < backoff.nextAttemptAt
    ) {
      continue;
    }

    if (existing) {
      await this.stopRuntime(
        camera.id,
        "configuration_changed",
      );
    }

    try {
      const rtspUrl = await this.vault.open(
        local.protectedRtsp,
      );

      const session = await startCaptureSession(
        config.apiBaseUrl,
        token,
        camera.id,
        {
          agentVersion: AGENT_V103_VERSION,
          profileId:
            camera.activeProfileId,
          profileVersion:
            camera.activeProfileVersion,
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
          runtimeArchitecture:
            AGENT_V103_RUNTIME_ARCHITECTURE,
        },
      );

      const enqueue = async (
        event: LocalMotionEvent,
      ) => {
        const enriched =
          enrichOperationalEventV103(
            event,
            operationalAccess,
            camera.timezone,
          );
        await this.queue.enqueue(enriched);
        return true;
      };

      const regular =
        startCameraEventMonitor({
          camera,
          ffmpegPath,
          rtspUrl,
          sessionId: session.sessionId,
          enqueue,
          log: (message: string) =>
            this.logger.info(message),
          onFatalError: (error: Error) => {
            const failure =
              classifyCameraFailure(
                error.message,
              );
            const previous =
              this.cameraBackoff.get(camera.id);
            const attempts =
              Number(
                previous?.attempts ?? 0,
              ) + 1;

            this.cameraBackoff.set(
              camera.id,
              {
                attempts,
                nextAttemptAt:
                  Date.now() +
                  retryDelayMs(
                    failure,
                    attempts,
                  ),
                code: failure.code,
                message: failure.message,
              },
            );

            this.logger.error(
              `Monitor de "${camera.name}" falhou (${failure.code}): ${failure.message}`,
            );

            if (
              attempts >= 3 &&
              failure.code !==
                "unauthorized"
            ) {
              void this.recoverCameraAddress(
                camera.id,
                camera.name,
              );
            }

            void sendCameraStatus(
              config.apiBaseUrl,
              token,
              camera.id,
              {
                status: "error",
                errorCode: failure.code,
                errorMessage:
                  failure.message,
              },
            ).catch(() => undefined);
          },
        });

      let structural: StructuralMonitorV103 | null =
        null;

      if (operationalAccess?.enabled) {
        try {
          structural =
            startOperationalStructuralMonitorV103(
              {
                camera,
                operationalAccess,
                ffmpegPath,
                rtspUrl,
                sessionId:
                  session.sessionId,
                enqueue,
                log: (message: string) =>
                  this.logger.info(
                    message,
                  ),
              },
            );
        } catch (error) {
          this.logger.warn(
            `Observador estrutural 1.0.3 não iniciou em "${camera.name}", mas o detector normal continuará: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          );
        }
      }

      let clipBuffer:
        | CircularClipBuffer
        | null = null;

      if (camera.clipEnabled === true) {
        try {
          clipBuffer =
            new CircularClipBuffer({
              cameraId: camera.id,
              cameraName:
                camera.name,
              ffmpegPath,
              rtspUrl,
              log: (message: string) =>
                this.logger.info(
                  message,
                ),
            });
          await clipBuffer.start();
        } catch (error) {
          clipBuffer = null;
          this.logger.warn(
            `O monitoramento continuará mesmo sem worker de vídeo em "${camera.name}": ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          );
        }
      }

      this.runtimes.set(camera.id, {
        signature,
        sessionId: session.sessionId,
        monitor: combinedMonitor(
          regular,
          structural,
        ),
        clipBuffer,
      });

      this.cameraBackoff.delete(
        camera.id,
      );

      this.logger.info(
        operationalAccess?.enabled
          ? `Monitoramento ${camera.plan} 1.0.3 iniciado em "${camera.name}" com observação estrutural do acesso.`
          : `Monitoramento ${camera.plan} 1.0.3 iniciado em "${camera.name}".`,
      );
    } catch (error) {
      if (
        classify(error) ===
        "unauthorized"
      ) {
        this.handleUnauthorized();
        return;
      }

      this.logger.error(
        `Não foi possível iniciar o monitor 1.0.3 de "${camera.name}": ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }
}


async function tickHeartbeatV103(
  this: V103Service,
) {
  if (
    this.__v103HeartbeatBusy ||
    this.shuttingDown ||
    this.unauthorized
  ) {
    return;
  }

  const config = this.config;
  const token = this.token;
  if (!config || !token) return;

  this.__v103HeartbeatBusy = true;

  try {
    const stats = await this.queue.stats();
    const directory =
      await resolveConfigDirectory();
    const metrics = await systemMetrics(
      directory,
      stats.pending,
    );
    const runtimes = [
      ...this.runtimes.values(),
    ];
    const active = runtimes.filter(
      (runtime: any) =>
        runtime.monitor?.isRunning?.(),
    ).length;
    const expectedActive =
      this.cameras.filter(
        (camera: any) =>
          camera.monitoringEnabled,
      ).length;
    const reconnects = runtimes.reduce(
      (sum: number, runtime: any) =>
        sum +
        Number(
          runtime.clipBuffer
            ?.reconnectCount?.() ?? 0,
        ),
      0,
    );

    const videoRuntime = runtimes.find(
      (runtime: any) =>
        runtime.clipBuffer?.diskStats,
    );
    const videoStats = videoRuntime
      ? await videoRuntime.clipBuffer
          .diskStats()
          .catch(() => null)
      : null;

    const eventsTotal = Number(
      this.__v102EventsSentTotal ?? 0,
    );
    const clipsTotal = Number(
      this.__v102ClipsSentTotal ?? 0,
    );

    const previousEvents = Number(
      this.__v103LastHeartbeatEventsSentTotal ??
        0,
    );
    const previousClips = Number(
      this.__v103LastHeartbeatClipsSentTotal ??
        0,
    );
    const previousReconnects = Number(
      this.__v103LastHeartbeatRtspReconnectsTotal ??
        0,
    );

    const eventsDelta =
      eventsTotal >= previousEvents
        ? eventsTotal - previousEvents
        : eventsTotal;
    const clipsDelta =
      clipsTotal >= previousClips
        ? clipsTotal - previousClips
        : clipsTotal;
    const reconnectsDelta =
      reconnects >= previousReconnects
        ? reconnects - previousReconnects
        : reconnects;

    const videoEvidenceEvictionsTotal =
      Number(
        videoStats
          ?.evidenceEvictionsTotal ?? 0,
      );
    const videoTimelineEvictionsTotal =
      Number(
        videoStats
          ?.timelineEvictionsTotal ?? 0,
      );

    await sendHeartbeat(
      config.apiBaseUrl,
      token,
      {
        version: AGENT_V103_VERSION,
        platform: process.platform,
        architecture: process.arch,
        ...metrics,
        metadata: {
          ...platformMetadata(),
          runtimeArchitecture:
            AGENT_V103_RUNTIME_ARCHITECTURE,
          coreArchitecture:
            "shared-core-v103",
          slowStructuralDetector: true,
          operationalCameraCount:
            (
              this.__v103OperationalConfig ??
              new Map()
            ).size,
          queueBytes: stats.totalBytes,
          queueDropped: stats.dropped,
          queueRejected: stats.rejected,
          queueOldestAt:
            stats.oldestCreatedAt,
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
          rtspReconnectsTotal: reconnects,
          eventsSentDelta: eventsDelta,
          clipsSentDelta: clipsDelta,
          rtspReconnectsDelta:
            reconnectsDelta,
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
        },
      },
    );

    this.__v103LastHeartbeatEventsSentTotal =
      eventsTotal;
    this.__v103LastHeartbeatClipsSentTotal =
      clipsTotal;
    this.__v103LastHeartbeatRtspReconnectsTotal =
      reconnects;
    this.lastHeartbeatAt =
      new Date().toISOString();
  } catch (error) {
    if (
      classify(error) === "unauthorized"
    ) {
      this.handleUnauthorized();
    } else {
      this.logger.warn(
        `Falha no heartbeat 1.0.3: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  } finally {
    this.__v103HeartbeatBusy = false;
  }
}

export function v103RuntimeContract() {
  return {
    version: AGENT_V103_VERSION,
    sharedCore: true,
    operationalConfigEndpoint:
      "/api/agent/v103/operational-config",
    regularMotionDetectorPreserved: true,
    slowStructuralDetector: true,
    linuxSharesRuntime: true,
    storeSharesRuntime: true,
  } as const;
}

export function installV103Runtime() {
  if (installed) return;
  installed = true;

  if (
    typeof proto.syncMonitoring !==
    "function"
  ) {
    throw new Error(
      "monitoria_v103_missing_sync_monitoring",
    );
  }

  proto.syncMonitoring =
    syncMonitoringV103;
  proto.tickHeartbeat =
    tickHeartbeatV103;

  const previousStart = proto.start;
  proto.start = async function (
    this: V103Service,
    ...args: any[]
  ) {
    const result =
      await previousStart.apply(
        this,
        args,
      );

    this.logger.info(
      `Core compartilhado MonitorIA ${AGENT_V103_VERSION} ativado.`,
    );

    return result;
  };

  for (const method of [
    "statusPayload",
    "diagnosePayload",
  ]) {
    const previous = proto[method];
    if (typeof previous !== "function") {
      continue;
    }

    proto[method] =
      async function (
        this: V103Service,
        ...args: any[]
      ) {
        const payload =
          await previous.apply(
            this,
            args,
          );

        return {
          ...payload,
          version: AGENT_V103_VERSION,
          runtimeArchitecture:
            AGENT_V103_RUNTIME_ARCHITECTURE,
          coreArchitecture:
            "shared-core-v103",
        };
      };
  }
}
