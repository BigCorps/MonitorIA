import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import {
  buildMotionMask,
  calculateMotion,
} from "../motion.js";
import { getAgentPlan } from "../plans.js";
import type {
  CapturedFrame,
  LocalEventFrame,
  LocalMotionEvent,
  RemoteCamera,
} from "../types.js";
import {
  acquireTimeline,
  releaseTimeline,
  type CameraTimeline,
  type TimelineRawFrame,
} from "../v102/timeline.js";
import {
  operationalMomentContext,
  type OperationalAccessConfigV103,
} from "./operational-config.js";
import {
  buildOperationalFocusMask,
  calculateStructuralMotion,
  evaluateStructuralTrigger,
  structuralContinueThreshold,
} from "./structural-motion.js";

type EventLabel = LocalEventFrame["label"];

type StructuralEvent = {
  id: string;
  startedAt: string;
  startedMs: number;
  referenceAt: string;
  lastActivityMs: number;
  peakPercent: number;
  framesObserved: number;
  frames: Partial<Record<EventLabel, CapturedFrame>>;
  pending: Set<Promise<void>>;
  extraCaptured: boolean;
  closing: boolean;
  likelyIlluminationShift: boolean;
};

export type StructuralMonitorV103 = {
  stop: (reason?: string) => Promise<void>;
  isRunning: () => boolean;
  framesObserved: () => number;
};

function nearestBefore(
  history: TimelineRawFrame[],
  currentMs: number,
  ageMs: number,
) {
  const target = currentMs - ageMs;
  let best: TimelineRawFrame | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const frame of history) {
    const frameMs = Date.parse(frame.capturedAt);
    if (frameMs > currentMs - 500) continue;
    const distance = Math.abs(frameMs - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = frame;
    }
  }

  return best;
}

function uniqueFrames(frames: LocalEventFrame[]) {
  const seen = new Set<string>();
  return frames.filter(({ frame }) => {
    if (seen.has(frame.path)) return false;
    seen.add(frame.path);
    return true;
  });
}

export function startOperationalStructuralMonitorV103(options: {
  camera: RemoteCamera;
  operationalAccess: OperationalAccessConfigV103;
  ffmpegPath: string;
  rtspUrl: string;
  sessionId: string | null;
  enqueue: (event: LocalMotionEvent) => boolean | Promise<boolean>;
  log: (message: string) => void;
}): StructuralMonitorV103 | null {
  if (!options.operationalAccess.enabled) return null;

  const plan = getAgentPlan(options.camera.plan);
  const maximumFrames = Math.max(
    1,
    Math.min(
      plan.maximumFrames,
      Number.isFinite(Number(options.camera.maximumAnalysisFrames))
        ? Math.floor(Number(options.camera.maximumAnalysisFrames))
        : plan.maximumFrames,
    ),
  );

  const baseIgnored = buildMotionMask(
    options.camera.motionIgnorePolygons ?? [],
    options.camera.motionOverlayMask,
  );
  const hasFocusPolygon =
    Boolean(options.operationalAccess.polygon?.length) &&
    (options.operationalAccess.polygon?.length ?? 0) >= 3;

  const focusMask = buildOperationalFocusMask(
    options.operationalAccess.polygon,
    baseIgnored,
  );

  const captureOptions = {
    maxWidth: plan.maxWidth,
    quality: plan.jpegQuality,
  };

  let stopped = false;
  let timeline: CameraTimeline | null = null;
  let unsubscribe: (() => void) | null = null;
  let previous: TimelineRawFrame | null = null;
  let history: TimelineRawFrame[] = [];
  let candidateFrames = 0;
  let active: StructuralEvent | null = null;
  let totalFramesObserved = 0;
  let captureChain = Promise.resolve();

  const timelinePromise: Promise<CameraTimeline | null> =
    acquireTimeline({
      cameraId: options.camera.id,
      cameraName: options.camera.name,
      ffmpegPath: options.ffmpegPath,
      rtspUrl: options.rtspUrl,
      captureIntervalSeconds:
        options.camera.captureIntervalSeconds,
      log: options.log,
    })
      .then((value) => {
        timeline = value;
        unsubscribe =
          value.subscribe(handleRawFrame);
        return value;
      })
      .catch((error) => {
        options.log(
          `Observador estrutural 1.0.3 não conseguiu anexar à timeline de "${options.camera.name}": ${
            error instanceof Error
              ? error.message
              : String(error)
          }`,
        );
        return null;
      });

  const scheduleCapture = (
    event: StructuralEvent,
    label: EventLabel,
    targetAt: string,
  ) => {
    const task = captureChain
      .catch(() => undefined)
      .then(async () => {
        try {
          const source =
            timeline ?? (await timelinePromise);
          if (!source) {
            throw new Error(
              "timeline_structural_unavailable",
            );
          }
          const frame = await source.captureAt(targetAt, {
            ...captureOptions,
            prefix: `${event.id}-v103-structural-${label}`,
          });
          const old = event.frames[label];
          event.frames[label] = frame;
          if (old && old.path !== frame.path) {
            await rm(old.path, { force: true });
          }
        } catch (error) {
          options.log(
            `Não foi possível extrair o quadro estrutural ${label} de "${options.camera.name}": ` +
              `${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

    captureChain = task;
    event.pending.add(task);
    void task.finally(() => event.pending.delete(task));
  };

  const selectFrames = async (event: StructuralEvent) => {
    const all = Object.entries(event.frames).flatMap(
      ([label, frame]) =>
        frame
          ? [{ label: label as EventLabel, frame }]
          : [],
    );

    let ordered: LocalEventFrame[];
    if (plan.code === "basic") {
      const best =
        event.frames.end ??
        event.frames.peak ??
        event.frames.start;
      ordered = best ? [{ label: "end", frame: best }] : [];
    } else {
      const order: EventLabel[] =
        plan.code === "intensive"
          ? ["start", "peak", "end", "extra"]
          : ["start", "peak", "end"];

      ordered = uniqueFrames(
        order.flatMap((label) =>
          event.frames[label]
            ? [{ label, frame: event.frames[label]! }]
            : [],
        ),
      ).slice(0, maximumFrames);
    }

    const keep = new Set(ordered.map((item) => item.frame.path));
    await Promise.allSettled(
      all
        .filter((item) => !keep.has(item.frame.path))
        .map((item) => rm(item.frame.path, { force: true })),
    );

    return ordered;
  };

  const finalize = async (
    event: StructuralEvent,
    endedAt: string,
    closeReason: string,
  ) => {
    if (event.closing) return;
    event.closing = true;
    if (active?.id === event.id) active = null;
    candidateFrames = 0;

    scheduleCapture(event, "end", endedAt);
    await Promise.allSettled([...event.pending]);

    const frames = await selectFrames(event);
    if (!frames.length) {
      options.log(
        `Mudança estrutural ${event.id} ficou sem quadro utilizável e não será descartada silenciosamente; a ocorrência continuará registrada nos logs locais.`,
      );
      return;
    }

    const endedMs = Date.parse(endedAt);
    const durationSeconds = Math.max(
      0,
      (endedMs - event.startedMs) / 1000,
    );

    const context = operationalMomentContext(
      options.operationalAccess,
      new Date(endedAt),
      options.camera.timezone,
    );

    const payload: LocalMotionEvent = {
      eventId: event.id,
      cameraId: options.camera.id,
      cameraName: options.camera.name,
      sessionId: options.sessionId,
      startedAt: event.startedAt,
      endedAt,
      localMetrics: {
        planCode: options.camera.plan,
        peakMotionPercent: Number(event.peakPercent.toFixed(4)),
        meanMotionPercent: Number(event.peakPercent.toFixed(4)),
        rawPeakMotionPercent: Number(event.peakPercent.toFixed(4)),
        durationSeconds: Number(durationSeconds.toFixed(4)),
        framesObserved: Math.max(1, event.framesObserved),
        configuredStartThreshold:
          options.camera.motionStartThreshold,
        configuredContinueThreshold:
          options.camera.motionContinueThreshold,
        effectiveStartThreshold:
          options.camera.motionStartThreshold,
        effectiveContinueThreshold:
          options.camera.motionContinueThreshold,
        noiseP50Percent: 0,
        noiseP90Percent: 0,
        noiseP95Percent: 0,
        ignoredPixelPercent: 0,
        autoIgnoredCellCount: 0,
        startConsecutiveFrames: 2,
        endConsecutiveFrames: 1,
        cooldownSeconds: 0,
        chapterMinimumSeconds: 0,
        chapterMaximumSeconds: 90,
        regionShiftThreshold: 0,
        dominantRegion: null,
        motionCentroidX: null,
        motionCentroidY: null,
        motionRegionCount: 1,
        motionSpreadPercent: 0,
        motionDensityPercent: 0,
        startMeanLuma: 0,
        maxDirectionalChangeRatio: 0,
        suppressedCameraNoiseSamples: 0,
        closeReason,
        structuralMotionV103: true,
        structuralReferenceAt: event.referenceAt,
        structuralPeakChangePercent:
          Number(event.peakPercent.toFixed(4)),
        structuralFocus:
          hasFocusPolygon
            ? "operational_polygon"
            : "full_frame",
        structuralLikelyIlluminationShift:
          event.likelyIlluminationShift,
        operationalAccessEnabled: true,
        outsideDeclaredHours:
          context.outsideDeclaredHours,
        operationalPeriod: context.operationalPeriod,
        nearOperationalTransitionWindow:
          context.nearOperationalTransitionWindow,
        operationalPriorityHint:
          context.outsideDeclaredHours
            ? "high_outside_hours"
            : "operational",
        evidenceTimeline: "rtsp_timeline_v2",
      } as LocalMotionEvent["localMetrics"],
      frames,
    };

    let queued = false;
    let attempt = 0;
    while (!queued) {
      try {
        queued = Boolean(await options.enqueue(payload));
        if (!queued) throw new Error("durable_queue_rejected_event");
      } catch (error) {
        attempt += 1;
        const delayMs = Math.min(
          30_000,
          1_000 * 2 ** Math.min(attempt, 5),
        );
        options.log(
          `Mudança estrutural ${event.id} ainda não entrou na fila durável; nova tentativa em ${Math.round(delayMs / 1000)}s: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, delayMs),
        );
      }
    }

    options.log(
      `Mudança estrutural 1.0.3 preservada em "${options.camera.name}": pico=${event.peakPercent.toFixed(2)}%, duração=${durationSeconds.toFixed(1)}s, foraDoHorario=${context.outsideDeclaredHours ? "sim" : "não"}.`,
    );

    if (queued && options.camera.clipEnabled === true) {
      void (async () => {
        const source =
          timeline ?? (await timelinePromise);
        if (!source) return;
        await source.preserveEventClip(
          event.id,
          event.startedAt,
          endedAt,
          options.camera.clipDurationSeconds,
        );
      })().catch((error: unknown) => {
        options.log(
          `A mudança estrutural ${event.id} entrou na fila, mas a preparação local do vídeo falhou: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }
  };

  function handleRawFrame(raw: TimelineRawFrame) {
    if (stopped) return;

    totalFramesObserved += 1;
    const currentMs = Date.parse(raw.capturedAt);

    history.push(raw);
    history = history.filter(
      (item) =>
        currentMs - Date.parse(item.capturedAt) <= 25_000,
    );

    if (!previous) {
      previous = raw;
      return;
    }

    const longReference = nearestBefore(
      history,
      currentMs,
      12_000,
    );
    const nearReference = nearestBefore(
      history,
      currentMs,
      3_000,
    );

    if (!longReference || !nearReference) {
      previous = raw;
      return;
    }

    const shortWindow = calculateMotion(
      previous.bytes,
      raw.bytes,
      20,
      focusMask,
    );
    const longWindow = calculateStructuralMotion(
      longReference.bytes,
      raw.bytes,
      focusMask,
    );
    const nearWindow = calculateStructuralMotion(
      nearReference.bytes,
      raw.bytes,
      focusMask,
    );

    previous = raw;

    const context = operationalMomentContext(
      options.operationalAccess,
      new Date(raw.capturedAt),
      options.camera.timezone,
    );

    const decision = evaluateStructuralTrigger({
      longWindow,
      shortWindow,
      configuredStartThreshold:
        options.camera.motionStartThreshold,
      hasFocusPolygon,
      outsideDeclaredHours:
        context.outsideDeclaredHours,
      nearOperationalTransitionWindow:
        context.nearOperationalTransitionWindow,
    });

    if (!active) {
      if (decision.trigger) candidateFrames += 1;
      else candidateFrames = 0;

      if (candidateFrames < 2) return;
      candidateFrames = 0;

      active = {
        id: randomUUID(),
        startedAt: longReference.capturedAt,
        startedMs: Date.parse(longReference.capturedAt),
        referenceAt: longReference.capturedAt,
        lastActivityMs: currentMs,
        peakPercent: longWindow.changedPixelPercent,
        framesObserved: 1,
        frames: {},
        pending: new Set(),
        extraCaptured: false,
        closing: false,
        likelyIlluminationShift:
          decision.likelyIlluminationShift,
      };

      scheduleCapture(
        active,
        "start",
        longReference.capturedAt,
      );
      scheduleCapture(active, "peak", raw.capturedAt);

      options.log(
        `Mudança estrutural lenta iniciada em "${options.camera.name}": acumulada=${longWindow.changedPixelPercent.toFixed(2)}%, quadro-a-quadro=${shortWindow.changedPixelPercent.toFixed(2)}%, foco=${hasFocusPolygon ? "área operacional" : "quadro inteiro"}.`,
      );
      return;
    }

    const event = active;
    event.framesObserved += 1;
    event.peakPercent = Math.max(
      event.peakPercent,
      longWindow.changedPixelPercent,
    );
    event.likelyIlluminationShift =
      event.likelyIlluminationShift ||
      decision.likelyIlluminationShift;

    const continueThreshold = structuralContinueThreshold(
      decision.startThreshold,
    );

    if (
      nearWindow.changedPixelPercent >= continueThreshold ||
      shortWindow.changedPixelPercent >=
        Math.max(
          0.05,
          options.camera.motionContinueThreshold,
        )
    ) {
      event.lastActivityMs = currentMs;
    }

    const ageMs = currentMs - event.startedMs;

    if (
      longWindow.changedPixelPercent >=
        event.peakPercent - 0.001 &&
      currentMs - event.lastActivityMs <= 8_000
    ) {
      scheduleCapture(event, "peak", raw.capturedAt);
    }

    if (
      plan.code === "intensive" &&
      !event.extraCaptured &&
      ageMs >= 15_000
    ) {
      event.extraCaptured = true;
      scheduleCapture(event, "extra", raw.capturedAt);
    }

    const quietMs =
      currentMs - event.lastActivityMs;
    const minimumDurationMs = 8_000;
    const quietRequiredMs = Math.max(
      5_000,
      options.camera.captureIntervalSeconds * 4_000,
    );

    if (
      (ageMs >= minimumDurationMs &&
        quietMs >= quietRequiredMs) ||
      ageMs >= 90_000
    ) {
      void finalize(
        event,
        raw.capturedAt,
        ageMs >= 90_000
          ? "structural_maximum_duration"
          : "structural_motion_stopped",
      );
    }
  }

  return {
    isRunning: () => !stopped,
    framesObserved: () => totalFramesObserved,
    stop: async (
      reason = "structural_monitor_stopped",
    ) => {
      if (stopped) return;
      stopped = true;
      unsubscribe?.();

      if (active) {
        await finalize(
          active,
          new Date().toISOString(),
          reason,
        );
      }

      try {
        const source =
          timeline ?? (await timelinePromise);
        if (source) {
          await releaseTimeline(
            options.camera.id,
            source,
          );
        }
      } catch {
        // timeline já indisponível
      }
    },
  };
}
