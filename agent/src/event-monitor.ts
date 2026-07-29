import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { captureFrame } from "./ffmpeg.js";
import {
  startMotionSampler,
  type MotionSample,
  type MotionSampler,
} from "./motion.js";
import {
  AdaptiveMotionCalibration,
  type MotionCalibrationSnapshot,
} from "./motion-calibration.js";
import { getAgentPlan } from "./plans.js";
import { monitoringScheduleState } from "./schedule.js";
import type {
  CapturedFrame,
  LocalEventFrame,
  LocalMotionEvent,
  RemoteCamera,
} from "./types.js";

type EventLabel = LocalEventFrame["label"];

type ActiveEvent = {
  id: string;
  startedAt: string;
  startedMs: number;
  lastMotionMs: number;
  peakMotionPercent: number;
  rawPeakMotionPercent: number;
  motionSum: number;
  samples: number;
  framesObserved: number;
  lastPeakCaptureMs: number;
  frames: Partial<Record<EventLabel, CapturedFrame>>;
  pendingCaptures: Set<Promise<void>>;
  closing: boolean;
  quietFrames: number;
  extraCaptured: boolean;
  thresholds: MotionCalibrationSnapshot;
  ignoredPixelPercent: number;
  autoIgnoredCellCount: number;
  anchorCentroidX: number | null;
  anchorCentroidY: number | null;
  dominantRegion: string | null;
  regionShiftFrames: number;
};

export type CameraEventMonitor = {
  stop: (reason?: string) => Promise<void>;
  isRunning: () => boolean;
  framesObserved: () => number;
  calibrationSnapshot: () => MotionCalibrationSnapshot;
};

const MAX_EVENT_DURATION_MS = 5 * 60 * 1000;

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function uniqueFrames(frames: LocalEventFrame[]) {
  const seen = new Set<string>();
  return frames.filter(({ frame }) => {
    if (seen.has(frame.path)) return false;
    seen.add(frame.path);
    return true;
  });
}

export function startCameraEventMonitor(options: {
  camera: RemoteCamera;
  ffmpegPath: string;
  rtspUrl: string;
  sessionId: string | null;
  enqueue: (event: LocalMotionEvent) => boolean;
  log: (message: string) => void;
  onFatalError: (error: Error) => void;
}): CameraEventMonitor {
  const plan = getAgentPlan(options.camera.plan);
  const calibration = new AdaptiveMotionCalibration();

  const configuredStartThreshold = Math.max(
    0.05,
    Math.min(100, options.camera.motionStartThreshold),
  );

  const configuredContinueThreshold = Math.max(
    0.01,
    Math.min(
      configuredStartThreshold,
      options.camera.motionContinueThreshold,
    ),
  );

  const startConsecutiveFrames = Math.max(
    1,
    Math.min(
      20,
      Math.floor(options.camera.motionStartConsecutiveFrames || 3),
    ),
  );

  const endConsecutiveFrames = Math.max(
    2,
    Math.min(
      60,
      Math.floor(options.camera.motionEndConsecutiveFrames || 6),
    ),
  );

  const closeAfterMs =
    Math.max(
      3,
      Math.min(300, options.camera.eventCloseAfterSeconds),
    ) * 1000;

  const cooldownMs =
    Math.max(
      0,
      Math.min(300, options.camera.motionCooldownSeconds),
    ) * 1000;

  const consolidationMs =
    Math.max(
      1,
      Math.min(3600, options.camera.consolidationIntervalSeconds),
    ) * 1000;

  let activeEvent: ActiveEvent | null = null;
  let totalFramesObserved = 0;
  let stopped = false;
  let captureChain = Promise.resolve();
  let startCandidateFrames = 0;
  let cooldownUntilMs = 0;
  let requireQuietBeforeRestart = false;
  let quietRecoveryFrames = 0;
  let lastSnapshot = calibration.snapshot(
    configuredStartThreshold,
    configuredContinueThreshold,
    options.camera.motionAdaptiveEnabled,
  );
  let calibrationLogged = false;

  const captureOptions = {
    maxWidth: plan.maxWidth,
    quality: plan.jpegQuality,
  };

  const scheduleCapture = (
    event: ActiveEvent,
    label: EventLabel,
  ) => {
    const task = captureChain
      .catch(() => {
        // Mantém a fila local viva após uma captura que falhou.
      })
      .then(async () => {
        if (stopped && label !== "end") return;

        try {
          const frame = await captureFrame(
            options.ffmpegPath,
            options.rtspUrl,
            options.camera.id,
            {
              ...captureOptions,
              prefix: `${event.id}-${label}`,
            },
          );

          const previous = event.frames[label];
          event.frames[label] = frame;

          if (previous && previous.path !== frame.path) {
            await rm(previous.path, { force: true });
          }
        } catch (error) {
          options.log(
            `Não foi possível capturar o quadro ${label} de "${options.camera.name}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      });

    captureChain = task;
    event.pendingCaptures.add(task);

    void task.finally(() => {
      event.pendingCaptures.delete(task);
    });
  };

  const selectFrames = async (event: ActiveEvent) => {
    const all = Object.entries(event.frames).flatMap(
      ([label, frame]) =>
        frame
          ? [
              {
                label: label as EventLabel,
                frame,
              },
            ]
          : [],
    );

    let selected: LocalEventFrame[];

    if (plan.code === "basic") {
      const best =
        event.frames.peak ??
        event.frames.start ??
        event.frames.end;

      selected = best
        ? [{ label: "peak", frame: best }]
        : [];
    } else if (plan.code === "intensive") {
      selected = uniqueFrames(
        (["start", "extra", "peak", "end"] as EventLabel[])
          .flatMap((label) => {
            const frame = event.frames[label];
            return frame ? [{ label, frame }] : [];
          }),
      ).slice(0, 4);
    } else {
      selected = uniqueFrames(
        (["start", "peak", "end"] as EventLabel[])
          .flatMap((label) => {
            const frame = event.frames[label];
            return frame ? [{ label, frame }] : [];
          }),
      ).slice(0, 3);
    }

    const selectedPaths = new Set(
      selected.map(({ frame }) => frame.path),
    );

    await Promise.allSettled(
      all
        .filter(({ frame }) => !selectedPaths.has(frame.path))
        .map(({ frame }) => rm(frame.path, { force: true })),
    );

    return selected;
  };

  const finalizeEvent = async (
    event: ActiveEvent,
    endedAt: string,
    closeReason: string,
  ) => {
    if (event.closing) return;

    event.closing = true;

    if (activeEvent?.id === event.id) {
      activeEvent = null;
    }

    startCandidateFrames = 0;

    if (closeReason === "maximum_duration") {
      requireQuietBeforeRestart = true;
      quietRecoveryFrames = 0;
    } else if (
      closeReason === "activity_region_changed" ||
      closeReason === "activity_resumed" ||
      closeReason === "activity_chapter_limit"
    ) {
      cooldownUntilMs = Date.now() + 1000;
    } else {
      cooldownUntilMs = Date.now() + cooldownMs;
    }

    if (plan.code !== "basic") {
      scheduleCapture(event, "end");
    }

    await Promise.allSettled([...event.pendingCaptures]);

    const frames = await selectFrames(event);

    if (!frames.length) {
      options.log(
        `Evento local ${event.id} descartado porque nenhum quadro completo foi capturado.`,
      );
      return;
    }

    const endedMs = new Date(endedAt).getTime();
    const durationSeconds = Math.max(
      0,
      (endedMs - event.startedMs) / 1000,
    );

    const queued = options.enqueue({
      eventId: event.id,
      cameraId: options.camera.id,
      cameraName: options.camera.name,
      sessionId: options.sessionId,
      startedAt: event.startedAt,
      endedAt,
      localMetrics: {
        planCode: plan.code,
        peakMotionPercent: rounded(event.peakMotionPercent),
        meanMotionPercent: rounded(
          event.samples ? event.motionSum / event.samples : 0,
        ),
        rawPeakMotionPercent: rounded(
          event.rawPeakMotionPercent,
        ),
        durationSeconds: rounded(durationSeconds),
        framesObserved: event.framesObserved,
        configuredStartThreshold: rounded(
          configuredStartThreshold,
        ),
        configuredContinueThreshold: rounded(
          configuredContinueThreshold,
        ),
        effectiveStartThreshold:
          event.thresholds.effectiveStartThreshold,
        effectiveContinueThreshold:
          event.thresholds.effectiveContinueThreshold,
        noiseP50Percent: event.thresholds.p50,
        noiseP90Percent: event.thresholds.p90,
        noiseP95Percent: event.thresholds.p95,
        ignoredPixelPercent: rounded(
          event.ignoredPixelPercent,
        ),
        autoIgnoredCellCount: event.autoIgnoredCellCount,
        startConsecutiveFrames,
        endConsecutiveFrames,
        cooldownSeconds: cooldownMs / 1000,
        chapterMinimumSeconds:
          plan.chapterMinimumSeconds,
        chapterMaximumSeconds:
          plan.chapterMaximumSeconds,
        regionShiftThreshold:
          plan.regionShiftThreshold,
        dominantRegion:
          event.dominantRegion,
        motionCentroidX:
          event.anchorCentroidX,
        motionCentroidY:
          event.anchorCentroidY,
        closeReason,
      },
      frames,
    });

    if (queued) {
      options.log(
        `Evento ${plan.label} fechado em "${options.camera.name}": motivo=${closeReason}, pico=${event.peakMotionPercent.toFixed(2)}%, duração=${durationSeconds.toFixed(1)}s, quadros=${frames.length}.`,
      );
    }
  };

  const handleSample = (sample: MotionSample) => {
    if (stopped) return;

    const sampleDate = new Date(sample.capturedAt);
    const sampleMs = sampleDate.getTime();
    totalFramesObserved += 1;

    const schedule = monitoringScheduleState(
      options.camera.monitoringSchedule,
      options.camera.timezone,
      sampleDate,
    );

    if (!schedule.enabled) {
      startCandidateFrames = 0;

      if (activeEvent) {
        void finalizeEvent(
          activeEvent,
          sample.capturedAt,
          "schedule_ended",
        );
      }

      return;
    }

    calibration.observe(
      sample.changedPixelPercent,
      configuredStartThreshold,
      !activeEvent &&
        !requireQuietBeforeRestart &&
        sampleMs >= cooldownUntilMs,
    );

    lastSnapshot = calibration.snapshot(
      configuredStartThreshold,
      configuredContinueThreshold,
      options.camera.motionAdaptiveEnabled,
      schedule.thresholdMultiplier,
    );

    if (lastSnapshot.ready && !calibrationLogged) {
      calibrationLogged = true;
      options.log(
        `Calibração de "${options.camera.name}" concluída: ruído p95=${lastSnapshot.p95.toFixed(2)}%, início=${lastSnapshot.effectiveStartThreshold.toFixed(2)}%, continuação=${lastSnapshot.effectiveContinueThreshold.toFixed(2)}%, células automáticas ignoradas=${sample.autoIgnoredCellCount}.`,
      );
    }

    if (!lastSnapshot.ready) {
      return;
    }

    if (requireQuietBeforeRestart) {
      if (
        sample.changedPixelPercent <
        lastSnapshot.effectiveContinueThreshold
      ) {
        quietRecoveryFrames += 1;
      } else {
        quietRecoveryFrames = 0;
      }

      if (quietRecoveryFrames >= endConsecutiveFrames) {
        requireQuietBeforeRestart = false;
        quietRecoveryFrames = 0;
        cooldownUntilMs = sampleMs + cooldownMs;
        options.log(
          `Câmera "${options.camera.name}" voltou ao estado de repouso após o limite máximo.`,
        );
      }

      return;
    }

    if (sampleMs < cooldownUntilMs) {
      return;
    }

    if (!activeEvent) {
      if (
        sample.changedPixelPercent >=
        lastSnapshot.effectiveStartThreshold
      ) {
        startCandidateFrames += 1;
      } else {
        startCandidateFrames = 0;
      }

      if (startCandidateFrames < startConsecutiveFrames) {
        return;
      }

      startCandidateFrames = 0;

      activeEvent = {
        id: randomUUID(),
        startedAt: sample.capturedAt,
        startedMs: sampleMs,
        lastMotionMs: sampleMs,
        peakMotionPercent: sample.changedPixelPercent,
        rawPeakMotionPercent: sample.rawChangedPixelPercent,
        motionSum: sample.changedPixelPercent,
        samples: 1,
        framesObserved: 1,
        lastPeakCaptureMs: sampleMs,
        frames: {},
        pendingCaptures: new Set(),
        closing: false,
        quietFrames: 0,
        extraCaptured: false,
        thresholds: lastSnapshot,
        ignoredPixelPercent: sample.ignoredPixelPercent,
        autoIgnoredCellCount: sample.autoIgnoredCellCount,
        anchorCentroidX: sample.motionCentroidX,
        anchorCentroidY: sample.motionCentroidY,
        dominantRegion: sample.dominantRegion,
        regionShiftFrames: 0,
      };

      options.log(
        `Movimento iniciado em "${options.camera.name}": ${sample.changedPixelPercent.toFixed(2)}% · início efetivo ${lastSnapshot.effectiveStartThreshold.toFixed(2)}%.`,
      );

      scheduleCapture(activeEvent, "start");
      return;
    }

    const event = activeEvent;
    event.framesObserved += 1;
    event.samples += 1;
    event.motionSum += sample.changedPixelPercent;
    event.rawPeakMotionPercent = Math.max(
      event.rawPeakMotionPercent,
      sample.rawChangedPixelPercent,
    );
    event.ignoredPixelPercent = sample.ignoredPixelPercent;
    event.autoIgnoredCellCount = sample.autoIgnoredCellCount;

    const quietFramesBeforeSample =
      event.quietFrames;

    if (
      sample.changedPixelPercent >=
      lastSnapshot.effectiveContinueThreshold
    ) {
      event.lastMotionMs = sampleMs;
      event.quietFrames = 0;
    } else {
      event.quietFrames += 1;
    }

    const ageMs = sampleMs - event.startedMs;
    const chapterMinimumMs =
      plan.chapterMinimumSeconds * 1000;
    const chapterMaximumMs =
      plan.chapterMaximumSeconds * 1000;

    if (
      sample.changedPixelPercent >=
        lastSnapshot.effectiveContinueThreshold &&
      sample.motionCentroidX !== null &&
      sample.motionCentroidY !== null
    ) {
      if (
        event.anchorCentroidX === null ||
        event.anchorCentroidY === null
      ) {
        event.anchorCentroidX =
          sample.motionCentroidX;
        event.anchorCentroidY =
          sample.motionCentroidY;
        event.dominantRegion =
          sample.dominantRegion;
      } else {
        const distance = Math.hypot(
          sample.motionCentroidX -
            event.anchorCentroidX,
          sample.motionCentroidY -
            event.anchorCentroidY,
        );

        const regionChanged =
          Boolean(sample.dominantRegion) &&
          Boolean(event.dominantRegion) &&
          sample.dominantRegion !==
            event.dominantRegion &&
          distance >=
            plan.regionShiftThreshold;

        if (regionChanged) {
          event.regionShiftFrames += 1;
        } else {
          event.regionShiftFrames = 0;
          event.anchorCentroidX =
            event.anchorCentroidX * 0.85 +
            sample.motionCentroidX * 0.15;
          event.anchorCentroidY =
            event.anchorCentroidY * 0.85 +
            sample.motionCentroidY * 0.15;
          event.dominantRegion =
            sample.dominantRegion ??
            event.dominantRegion;
        }
      }
    } else {
      event.regionShiftFrames = 0;
    }

    if (
      ageMs >= chapterMinimumMs &&
      quietFramesBeforeSample >= 3 &&
      sample.changedPixelPercent >=
        lastSnapshot.effectiveStartThreshold
    ) {
      void finalizeEvent(
        event,
        sample.capturedAt,
        "activity_resumed",
      );
      return;
    }

    if (
      ageMs >= chapterMinimumMs &&
      event.regionShiftFrames >= 3
    ) {
      void finalizeEvent(
        event,
        sample.capturedAt,
        "activity_region_changed",
      );
      return;
    }

    if (
      ageMs >= chapterMaximumMs &&
      sample.changedPixelPercent >=
        lastSnapshot.effectiveStartThreshold
    ) {
      void finalizeEvent(
        event,
        sample.capturedAt,
        "activity_chapter_limit",
      );
      return;
    }

    if (
      plan.code === "intensive" &&
      !event.extraCaptured &&
      ageMs >= consolidationMs
    ) {
      event.extraCaptured = true;
      scheduleCapture(event, "extra");
    }

    const peakImprovement = Math.max(
      0.25,
      lastSnapshot.effectiveStartThreshold * 0.15,
    );

    if (
      sample.changedPixelPercent >=
        event.peakMotionPercent + peakImprovement &&
      sampleMs - event.lastPeakCaptureMs >= consolidationMs
    ) {
      event.peakMotionPercent = sample.changedPixelPercent;
      event.lastPeakCaptureMs = sampleMs;
      scheduleCapture(event, "peak");
    } else {
      event.peakMotionPercent = Math.max(
        event.peakMotionPercent,
        sample.changedPixelPercent,
      );
    }

    const quietLongEnough =
      event.quietFrames >= endConsecutiveFrames &&
      sampleMs - event.lastMotionMs >= closeAfterMs;

    if (quietLongEnough || ageMs >= MAX_EVENT_DURATION_MS) {
      const closeReason =
        ageMs >= MAX_EVENT_DURATION_MS
          ? "maximum_duration"
          : "motion_stopped";

      void finalizeEvent(
        event,
        sample.capturedAt,
        closeReason,
      );
    }
  };

  const sampler: MotionSampler = startMotionSampler({
    ffmpegPath: options.ffmpegPath,
    rtspUrl: options.rtspUrl,
    captureIntervalSeconds:
      options.camera.captureIntervalSeconds,
    ignorePolygons: options.camera.motionIgnorePolygons,
    overlayMask: options.camera.motionOverlayMask,
    onSample: handleSample,
    onError: (error) => {
      if (stopped) return;
      options.onFatalError(error);
    },
  });

  return {
    isRunning: () => !stopped && sampler.isRunning(),
    framesObserved: () => totalFramesObserved,
    calibrationSnapshot: () => lastSnapshot,
    stop: async (reason = "agent_stopped") => {
      if (stopped) return;

      stopped = true;
      await sampler.stop();

      if (activeEvent) {
        await finalizeEvent(
          activeEvent,
          new Date().toISOString(),
          reason,
        );
      }
    },
  };
}
