import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { captureFrame } from "./ffmpeg.js";
import {
  startMotionSampler,
  type MotionSample,
  type MotionSampler,
} from "./motion.js";
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
  motionSum: number;
  samples: number;
  framesObserved: number;
  lastPeakCaptureMs: number;
  frames: Partial<Record<EventLabel, CapturedFrame>>;
  pendingCaptures: Set<Promise<void>>;
  closing: boolean;
};

export type CameraEventMonitor = {
  stop: (reason?: string) => Promise<void>;
  isRunning: () => boolean;
  framesObserved: () => number;
};

const MAX_EVENT_DURATION_MS = 5 * 60 * 1000;
const PEAK_CAPTURE_INTERVAL_MS = 5_000;

function rounded(value: number) {
  return Number(value.toFixed(4));
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
  const startThreshold = Math.max(
    0.05,
    Math.min(100, options.camera.motionStartThreshold),
  );

  const continueThreshold = Math.max(
    0.01,
    Math.min(
      startThreshold,
      options.camera.motionContinueThreshold,
    ),
  );

  const closeAfterMs =
    Math.max(
      3,
      Math.min(300, options.camera.eventCloseAfterSeconds),
    ) * 1000;

  let activeEvent: ActiveEvent | null = null;
  let totalFramesObserved = 0;
  let stopped = false;
  let captureChain = Promise.resolve();

  const scheduleCapture = (
    event: ActiveEvent,
    label: EventLabel,
  ) => {
    const task = captureChain
      .catch(() => {
        // A próxima captura ainda deve ser tentada.
      })
      .then(async () => {
        if (stopped && label !== "end") return;

        try {
          const frame = await captureFrame(
            options.ffmpegPath,
            options.rtspUrl,
            options.camera.id,
            {
              maxWidth: 1280,
              quality: 4,
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

    scheduleCapture(event, "end");
    await Promise.allSettled([...event.pendingCaptures]);

    const labelOrder: EventLabel[] = ["start", "peak", "end"];
    const frames: LocalEventFrame[] = labelOrder.flatMap((label) => {
      const frame = event.frames[label];
      return frame ? [{ label, frame }] : [];
    });

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
        peakMotionPercent: rounded(event.peakMotionPercent),
        meanMotionPercent: rounded(
          event.samples ? event.motionSum / event.samples : 0,
        ),
        durationSeconds: rounded(durationSeconds),
        framesObserved: event.framesObserved,
        motionStartThreshold: rounded(startThreshold),
        motionContinueThreshold: rounded(continueThreshold),
        closeReason,
      },
      frames,
    });

    if (queued) {
      options.log(
        `Evento local fechado em "${options.camera.name}": pico ${event.peakMotionPercent.toFixed(2)}%, duração ${durationSeconds.toFixed(1)}s.`,
      );
    }
  };

  const handleSample = (sample: MotionSample) => {
    if (stopped) return;

    const sampleMs = new Date(sample.capturedAt).getTime();
    totalFramesObserved += 1;

    if (!activeEvent) {
      if (sample.changedPixelPercent < startThreshold) {
        return;
      }

      activeEvent = {
        id: randomUUID(),
        startedAt: sample.capturedAt,
        startedMs: sampleMs,
        lastMotionMs: sampleMs,
        peakMotionPercent: sample.changedPixelPercent,
        motionSum: sample.changedPixelPercent,
        samples: 1,
        framesObserved: 1,
        lastPeakCaptureMs: sampleMs,
        frames: {},
        pendingCaptures: new Set(),
        closing: false,
      };

      options.log(
        `Movimento iniciado em "${options.camera.name}": ${sample.changedPixelPercent.toFixed(2)}%.`,
      );

      scheduleCapture(activeEvent, "start");
      return;
    }

    const event = activeEvent;
    event.framesObserved += 1;
    event.samples += 1;
    event.motionSum += sample.changedPixelPercent;

    if (sample.changedPixelPercent >= continueThreshold) {
      event.lastMotionMs = sampleMs;
    }

    const peakImprovement = Math.max(0.25, startThreshold * 0.2);

    if (
      sample.changedPixelPercent >=
        event.peakMotionPercent + peakImprovement &&
      sampleMs - event.lastPeakCaptureMs >=
        PEAK_CAPTURE_INTERVAL_MS
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

    if (
      sampleMs - event.lastMotionMs >= closeAfterMs ||
      sampleMs - event.startedMs >= MAX_EVENT_DURATION_MS
    ) {
      const closeReason =
        sampleMs - event.startedMs >= MAX_EVENT_DURATION_MS
          ? "maximum_duration"
          : "motion_stopped";

      void finalizeEvent(event, sample.capturedAt, closeReason);
    }
  };

  const sampler: MotionSampler = startMotionSampler({
    ffmpegPath: options.ffmpegPath,
    rtspUrl: options.rtspUrl,
    captureIntervalSeconds:
      options.camera.captureIntervalSeconds,
    onSample: handleSample,
    onError: (error) => {
      if (stopped) return;
      options.onFatalError(error);
    },
  });

  return {
    isRunning: () => !stopped && sampler.isRunning(),
    framesObserved: () => totalFramesObserved,
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
