import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import {
  buildMotionMask,
  calculateMotion,
  isLikelyCameraNoise,
  MOTION_HEIGHT,
  MOTION_WIDTH,
} from "./motion.js";
import { AdaptiveMotionCalibration, type MotionCalibrationSnapshot } from "./motion-calibration.js";
import { getAgentPlan } from "./plans.js";
import { monitoringScheduleState } from "./schedule.js";
import type { CapturedFrame, LocalEventFrame, LocalMotionEvent, RemoteCamera } from "./types.js";
import { acquireTimeline, releaseTimeline, type CameraTimeline, type TimelineRawFrame } from "./v102/timeline.js";

export type CameraEventMonitor = {
  stop: (reason?: string) => Promise<void>;
  isRunning: () => boolean;
  framesObserved: () => number;
  calibrationSnapshot: () => MotionCalibrationSnapshot;
};

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
  motionRegions: Set<string>;
  maxMotionSpreadPercent: number;
  maxMotionDensityPercent: number;
  startMeanLuma: number;
  maxDirectionalChangeRatio: number;
};

const MAX_EVENT_DURATION_MS = 5 * 60_000;
const GRID_COLUMNS = 16;
const GRID_ROWS = 9;
const CELL_WIDTH = MOTION_WIDTH / GRID_COLUMNS;
const CELL_HEIGHT = MOTION_HEIGHT / GRID_ROWS;
const rounded = (v: number) => Number(v.toFixed(4));

function cellFor(index: number) {
  const y = Math.floor(index / MOTION_WIDTH);
  const x = index % MOTION_WIDTH;
  return Math.min(GRID_ROWS - 1, Math.floor(y / CELL_HEIGHT)) * GRID_COLUMNS +
    Math.min(GRID_COLUMNS - 1, Math.floor(x / CELL_WIDTH));
}
function borderCell(cell: number) {
  const row = Math.floor(cell / GRID_COLUMNS);
  const col = cell % GRID_COLUMNS;
  return row <= 1 || row === GRID_ROWS - 1 || col === 0 || col === GRID_COLUMNS - 1;
}

/** Aprende apenas ruído persistente de borda; nunca regiões centrais. */
class BorderNoiseSuppressor {
  private samples = 0;
  private active = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
  private sums = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
  private ignored = new Set<number>();

  observe(previous: Uint8Array, current: Uint8Array, staticMask: Uint8Array) {
    this.samples += 1;
    const changed = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
    const totals = new Array(GRID_COLUMNS * GRID_ROWS).fill(0);
    for (let i = 0; i < current.length; i += 1) {
      if (staticMask[i]) continue;
      const cell = cellFor(i);
      totals[cell] += 1;
      if (Math.abs(Number(current[i]) - Number(previous[i])) >= 20) changed[cell] += 1;
    }
    for (let cell = 0; cell < changed.length; cell += 1) {
      if (!borderCell(cell) || !totals[cell]) continue;
      const percent = changed[cell] / totals[cell] * 100;
      this.sums[cell] += percent;
      if (percent >= 1) this.active[cell] += 1;
    }
    if (this.samples >= 45 && this.samples % 15 === 0) {
      this.ignored = new Set(
        this.active.map((count, cell) => ({ cell, ratio: count / this.samples, mean: this.sums[cell] / this.samples }))
          .filter((x) => borderCell(x.cell) && x.ratio >= 0.78 && x.mean >= 1)
          .sort((a, b) => b.ratio * b.mean - a.ratio * a.mean)
          .slice(0, 10).map((x) => x.cell),
      );
    }
  }

  apply(staticMask: Uint8Array) {
    if (!this.ignored.size) return staticMask;
    const out = Uint8Array.from(staticMask);
    for (let i = 0; i < out.length; i += 1) if (this.ignored.has(cellFor(i))) out[i] = 1;
    return out;
  }
  count() { return this.ignored.size; }
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
  enqueue: (event: LocalMotionEvent) => boolean | Promise<boolean>;
  log: (message: string) => void;
  onFatalError: (error: Error) => void;
}): CameraEventMonitor {
  const plan = getAgentPlan(options.camera.plan);
  const maximumFrames = Math.max(1, Math.min(
    plan.maximumFrames,
    Number.isFinite(Number(options.camera.maximumAnalysisFrames))
      ? Math.floor(Number(options.camera.maximumAnalysisFrames))
      : plan.maximumFrames,
  ));
  const configuredStart = Math.max(0.05, Math.min(100, options.camera.motionStartThreshold));
  const configuredContinue = Math.max(0.01, Math.min(configuredStart, options.camera.motionContinueThreshold));
  const startFrames = Math.max(1, Math.min(20, Math.floor(options.camera.motionStartConsecutiveFrames || 3)));
  const endFrames = Math.max(2, Math.min(60, Math.floor(options.camera.motionEndConsecutiveFrames || 6)));
  const planCloseFloor = plan.code === "intensive" ? 25 : plan.code === "standard" ? 20 : 30;
  const closeAfterMs = Math.max(planCloseFloor, Math.min(300, options.camera.eventCloseAfterSeconds)) * 1000;
  const cooldownMs = Math.max(0, Math.min(300, options.camera.motionCooldownSeconds)) * 1000;
  const consolidationMs = Math.max(1, Math.min(3600, options.camera.consolidationIntervalSeconds)) * 1000;
  const staticMask = buildMotionMask(options.camera.motionIgnorePolygons ?? [], options.camera.motionOverlayMask);
  const borderNoise = new BorderNoiseSuppressor();
  const calibration = new AdaptiveMotionCalibration();

  let timeline: CameraTimeline | null = null;
  let unsubscribe: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;
  let previous: Uint8Array | null = null;
  let stopped = false;
  let totalFramesObserved = 0;
  let activeEvent: ActiveEvent | null = null;
  let startCandidateFrames = 0;
  let suppressedNoise = 0;
  let cooldownUntil = 0;
  let requireQuietBeforeRestart = false;
  let quietRecoveryFrames = 0;
  let captureChain = Promise.resolve();
  let lastSnapshot = calibration.snapshot(configuredStart, configuredContinue, options.camera.motionAdaptiveEnabled);
  let calibrationLogged = false;

  const timelinePromise = acquireTimeline({
    cameraId: options.camera.id,
    cameraName: options.camera.name,
    ffmpegPath: options.ffmpegPath,
    rtspUrl: options.rtspUrl,
    captureIntervalSeconds: options.camera.captureIntervalSeconds,
    log: options.log,
  }).then((value) => {
    timeline = value;
    unsubscribe = value.subscribe(handleRawFrame);
    unsubscribeError = value.onError((error) => { if (!stopped) options.onFatalError(error); });
    return value;
  }).catch((error) => {
    if (!stopped) options.onFatalError(error instanceof Error ? error : new Error(String(error)));
    throw error;
  });

  const captureOptions = { maxWidth: plan.maxWidth, quality: plan.jpegQuality };

  const scheduleCapture = (event: ActiveEvent, label: EventLabel, targetAt: string) => {
    const task = captureChain.catch(() => undefined).then(async () => {
      if (stopped && label !== "end") return;
      try {
        const source = timeline ?? await timelinePromise;
        const frame = await source.captureAt(targetAt, { ...captureOptions, prefix: `${event.id}-${label}` });
        const previousFrame = event.frames[label];
        event.frames[label] = frame;
        if (previousFrame && previousFrame.path !== frame.path) await rm(previousFrame.path, { force: true });
      } catch (error) {
        options.log(`Não foi possível extrair o quadro ${label} da timeline de "${options.camera.name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    captureChain = task;
    event.pendingCaptures.add(task);
    void task.finally(() => event.pendingCaptures.delete(task));
  };

  const selectFrames = async (event: ActiveEvent) => {
    const all = Object.entries(event.frames).flatMap(([label, frame]) => frame ? [{ label: label as EventLabel, frame }] : []);
    let selected: LocalEventFrame[];
    if (plan.code === "basic") {
      const best = event.frames.peak ?? event.frames.start ?? event.frames.end;
      selected = best ? [{ label: "peak", frame: best }] : [];
    } else {
      const order: EventLabel[] = plan.code === "intensive"
        ? ["start", "extra", "peak", "end"] : ["start", "peak", "end"];
      selected = uniqueFrames(order.flatMap((label) => event.frames[label] ? [{ label, frame: event.frames[label]! }] : [])).slice(0, maximumFrames);
    }
    const keep = new Set(selected.map((x) => x.frame.path));
    await Promise.allSettled(all.filter((x) => !keep.has(x.frame.path)).map((x) => rm(x.frame.path, { force: true })));
    return selected;
  };

  const finalizeEvent = async (event: ActiveEvent, endedAt: string, closeReason: string) => {
    if (event.closing) return;
    event.closing = true;
    if (activeEvent?.id === event.id) activeEvent = null;
    startCandidateFrames = 0;
    if (closeReason === "maximum_duration") {
      requireQuietBeforeRestart = true;
      quietRecoveryFrames = 0;
    } else if (["activity_region_changed", "activity_resumed", "activity_chapter_limit"].includes(closeReason)) {
      cooldownUntil = Date.now() + 1000;
    } else cooldownUntil = Date.now() + cooldownMs;

    if (plan.code !== "basic") scheduleCapture(event, "end", endedAt);
    await Promise.allSettled([...event.pendingCaptures]);
    const frames = await selectFrames(event);
    if (!frames.length) {
      options.log(`Evento local ${event.id} preservado sem envio porque nenhum quadro da timeline ficou disponível.`);
      return;
    }

    const durationSeconds = Math.max(0, (Date.parse(endedAt) - event.startedMs) / 1000);
    const metrics: any = {
      planCode: plan.code,
      peakMotionPercent: rounded(event.peakMotionPercent),
      meanMotionPercent: rounded(event.samples ? event.motionSum / event.samples : 0),
      rawPeakMotionPercent: rounded(event.rawPeakMotionPercent),
      durationSeconds: rounded(durationSeconds),
      framesObserved: event.framesObserved,
      configuredStartThreshold: rounded(configuredStart),
      configuredContinueThreshold: rounded(configuredContinue),
      effectiveStartThreshold: event.thresholds.effectiveStartThreshold,
      effectiveContinueThreshold: event.thresholds.effectiveContinueThreshold,
      noiseP50Percent: event.thresholds.p50,
      noiseP90Percent: event.thresholds.p90,
      noiseP95Percent: event.thresholds.p95,
      ignoredPixelPercent: rounded(event.ignoredPixelPercent),
      autoIgnoredCellCount: event.autoIgnoredCellCount,
      startConsecutiveFrames: startFrames,
      endConsecutiveFrames: endFrames,
      cooldownSeconds: cooldownMs / 1000,
      chapterMinimumSeconds: plan.chapterMinimumSeconds,
      chapterMaximumSeconds: plan.chapterMaximumSeconds,
      regionShiftThreshold: plan.regionShiftThreshold,
      dominantRegion: event.dominantRegion,
      motionCentroidX: event.anchorCentroidX,
      motionCentroidY: event.anchorCentroidY,
      motionRegionCount: event.motionRegions.size,
      motionSpreadPercent: rounded(event.maxMotionSpreadPercent),
      motionDensityPercent: rounded(event.maxMotionDensityPercent),
      startMeanLuma: rounded(event.startMeanLuma),
      maxDirectionalChangeRatio: rounded(event.maxDirectionalChangeRatio),
      suppressedCameraNoiseSamples: suppressedNoise,
      closeReason,
      evidenceTimeline: "rtsp_timeline_v2",
    };

    const payload: LocalMotionEvent = {
      eventId: event.id,
      cameraId: options.camera.id,
      cameraName: options.camera.name,
      sessionId: options.sessionId,
      startedAt: event.startedAt,
      endedAt,
      localMetrics: metrics,
      frames,
    };

    // 1.0.2: o evento só é considerado fechado depois de entrar na fila
    // durável. Falha transitória de filesystem não pode virar perda silenciosa.
    // Mantemos os frames de origem intactos e repetimos a mesma gravação
    // idempotente; sob falta de espaço, o orçamento de vídeo é podado antes.
    let queued = false;
    let enqueueAttempt = 0;
    // Mesmo durante shutdown/restart o acontecimento que já estava aberto
    // precisa atravessar a fronteira durável antes de liberar seus frames.
    // `stopped` impede NOVAS amostras, mas não cancela este commit local.
    while (!queued) {
      try {
        queued = Boolean(await options.enqueue(payload));
        if (!queued) throw new Error("durable_queue_rejected_event");
      } catch (error) {
        enqueueAttempt += 1;
        const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(enqueueAttempt, 5));
        options.log(
          `Evento ${event.id} ainda não entrou na fila durável; nova tentativa em ${Math.round(delayMs / 1000)}s: ` +
            `${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    if (queued) {
      options.log(`Evento ${plan.label} fechado em "${options.camera.name}": ${closeReason}, pico=${event.peakMotionPercent.toFixed(2)}%, duração=${durationSeconds.toFixed(1)}s.`);
      // A prova em vídeo começa a ser fixada agora, não quando a IA terminar.
      // Assim um backlog de análise maior que o ring buffer não perde o clipe.
      if (options.camera.clipEnabled === true) {
        void (async () => {
          const source = timeline ?? await timelinePromise;
          await source.preserveEventClip(
            event.id,
            event.startedAt,
            endedAt,
            options.camera.clipDurationSeconds,
          );
        })().catch((error: unknown) => {
          options.log(`Acontecimento ${event.id} foi preservado, mas a preparação local do vídeo será recuperada depois: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
  };

  function handleRawFrame(raw: TimelineRawFrame) {
    if (stopped) return;
    const current = raw.bytes;
    if (!previous) { previous = current; return; }

    totalFramesObserved += 1;
    if (options.camera.motionOverlayMask === "auto") borderNoise.observe(previous, current, staticMask);
    const rawCalc = calculateMotion(previous, current, 20, staticMask);
    const combined = options.camera.motionOverlayMask === "auto" ? borderNoise.apply(staticMask) : staticMask;
    const effective = calculateMotion(previous, current, 20, combined);
    previous = current;

    const ignoredPixels = combined.reduce((sum, v) => sum + (v ? 1 : 0), 0);
    const likelyNoise = isLikelyCameraNoise(effective);
    const sample = {
      ...effective,
      capturedAt: raw.capturedAt,
      changedPixelPercent: effective.changedPixelPercent,
      rawChangedPixelPercent: rawCalc.changedPixelPercent,
      ignoredPixelPercent: ignoredPixels / combined.length * 100,
      autoIgnoredCellCount: borderNoise.count(),
      likelyCameraNoise: likelyNoise,
    };

    const date = new Date(sample.capturedAt);
    const sampleMs = date.getTime();
    const schedule = monitoringScheduleState(options.camera.monitoringSchedule, options.camera.timezone, date);
    if (!schedule.enabled) {
      startCandidateFrames = 0;
      if (activeEvent) void finalizeEvent(activeEvent, sample.capturedAt, "schedule_ended");
      return;
    }

    // Apenas repouso comprovado entra no baseline. O contador de warmup dentro
    // da calibração garante que ausência de repouso nunca deixa a câmera travada.
    const quietForCalibration = !activeEvent && !requireQuietBeforeRestart && sampleMs >= cooldownUntil &&
      !likelyNoise && sample.changedPixelPercent < configuredContinue * 0.8;
    calibration.observe(sample.changedPixelPercent, configuredStart, quietForCalibration);
    lastSnapshot = calibration.snapshot(configuredStart, configuredContinue, options.camera.motionAdaptiveEnabled, schedule.thresholdMultiplier);

    if (lastSnapshot.ready && !calibrationLogged) {
      calibrationLogged = true;
      options.log(`Calibração de "${options.camera.name}" pronta: repouso=${lastSnapshot.samples}/${lastSnapshot.observedSamples}, p95=${lastSnapshot.p95.toFixed(2)}%, início=${lastSnapshot.effectiveStartThreshold.toFixed(2)}%.`);
    }
    if (!lastSnapshot.ready) return;

    if (requireQuietBeforeRestart) {
      if (likelyNoise || sample.changedPixelPercent < lastSnapshot.effectiveContinueThreshold) quietRecoveryFrames += 1;
      else quietRecoveryFrames = 0;
      if (quietRecoveryFrames >= endFrames) {
        requireQuietBeforeRestart = false;
        quietRecoveryFrames = 0;
        cooldownUntil = sampleMs + cooldownMs;
      }
      return;
    }
    if (sampleMs < cooldownUntil) return;

    if (!activeEvent) {
      if (!likelyNoise && sample.changedPixelPercent >= lastSnapshot.effectiveStartThreshold) startCandidateFrames += 1;
      else { if (likelyNoise) suppressedNoise += 1; startCandidateFrames = 0; }
      const required = startFrames + (sample.meanLuma <= 52 ? 1 : 0);
      if (startCandidateFrames < required) return;
      startCandidateFrames = 0;
      activeEvent = {
        id: randomUUID(), startedAt: sample.capturedAt, startedMs: sampleMs, lastMotionMs: sampleMs,
        peakMotionPercent: sample.changedPixelPercent, rawPeakMotionPercent: sample.rawChangedPixelPercent,
        motionSum: sample.changedPixelPercent, samples: 1, framesObserved: 1, lastPeakCaptureMs: sampleMs,
        frames: {}, pendingCaptures: new Set(), closing: false, quietFrames: 0, extraCaptured: false,
        thresholds: lastSnapshot, ignoredPixelPercent: sample.ignoredPixelPercent,
        autoIgnoredCellCount: sample.autoIgnoredCellCount, anchorCentroidX: sample.motionCentroidX,
        anchorCentroidY: sample.motionCentroidY, dominantRegion: sample.dominantRegion, regionShiftFrames: 0,
        motionRegions: new Set(sample.dominantRegion ? [sample.dominantRegion] : []),
        maxMotionSpreadPercent: sample.motionSpreadPercent, maxMotionDensityPercent: sample.motionDensityPercent,
        startMeanLuma: sample.meanLuma, maxDirectionalChangeRatio: sample.directionalChangeRatio,
      };
      scheduleCapture(activeEvent, "start", sample.capturedAt);
      options.log(`Movimento iniciado em "${options.camera.name}": ${sample.changedPixelPercent.toFixed(2)}%.`);
      return;
    }

    const event = activeEvent;
    const meaningful = likelyNoise ? 0 : sample.changedPixelPercent;
    event.framesObserved += 1;
    event.samples += 1;
    event.motionSum += meaningful;
    event.rawPeakMotionPercent = Math.max(event.rawPeakMotionPercent, likelyNoise ? 0 : sample.rawChangedPixelPercent);
    event.ignoredPixelPercent = sample.ignoredPixelPercent;
    event.autoIgnoredCellCount = sample.autoIgnoredCellCount;
    event.maxMotionSpreadPercent = Math.max(event.maxMotionSpreadPercent, sample.motionSpreadPercent);
    event.maxMotionDensityPercent = Math.max(event.maxMotionDensityPercent, sample.motionDensityPercent);
    event.maxDirectionalChangeRatio = Math.max(event.maxDirectionalChangeRatio, sample.directionalChangeRatio);
    if (sample.dominantRegion) event.motionRegions.add(sample.dominantRegion);
    if (likelyNoise) suppressedNoise += 1;

    const quietBefore = event.quietFrames;
    if (meaningful >= lastSnapshot.effectiveContinueThreshold) { event.lastMotionMs = sampleMs; event.quietFrames = 0; }
    else event.quietFrames += 1;

    const ageMs = sampleMs - event.startedMs;
    const chapterMinimumMs = plan.chapterMinimumSeconds * 1000;
    const chapterMaximumMs = plan.chapterMaximumSeconds * 1000;

    if (meaningful >= lastSnapshot.effectiveContinueThreshold && sample.motionCentroidX !== null && sample.motionCentroidY !== null) {
      if (event.anchorCentroidX === null || event.anchorCentroidY === null) {
        event.anchorCentroidX = sample.motionCentroidX;
        event.anchorCentroidY = sample.motionCentroidY;
        event.dominantRegion = sample.dominantRegion;
      } else {
        const distance = Math.hypot(sample.motionCentroidX - event.anchorCentroidX, sample.motionCentroidY - event.anchorCentroidY);
        const changed = Boolean(sample.dominantRegion && event.dominantRegion && sample.dominantRegion !== event.dominantRegion && distance >= plan.regionShiftThreshold);
        if (changed) event.regionShiftFrames += 1;
        else {
          event.regionShiftFrames = 0;
          event.anchorCentroidX = event.anchorCentroidX * 0.85 + sample.motionCentroidX * 0.15;
          event.anchorCentroidY = event.anchorCentroidY * 0.85 + sample.motionCentroidY * 0.15;
          event.dominantRegion = sample.dominantRegion ?? event.dominantRegion;
        }
      }
    } else event.regionShiftFrames = 0;

    if (ageMs >= chapterMinimumMs && quietBefore >= 3 && meaningful >= lastSnapshot.effectiveStartThreshold) {
      void finalizeEvent(event, sample.capturedAt, "activity_resumed"); return;
    }
    if (ageMs >= chapterMinimumMs && event.regionShiftFrames >= 3) {
      void finalizeEvent(event, sample.capturedAt, "activity_region_changed"); return;
    }
    if (ageMs >= chapterMaximumMs && meaningful >= lastSnapshot.effectiveStartThreshold) {
      void finalizeEvent(event, sample.capturedAt, "activity_chapter_limit"); return;
    }

    if (plan.code === "intensive" && !event.extraCaptured && ageMs >= consolidationMs) {
      event.extraCaptured = true;
      scheduleCapture(event, "extra", sample.capturedAt);
    }
    const peakImprovement = Math.max(0.25, lastSnapshot.effectiveStartThreshold * 0.15);
    if (meaningful >= event.peakMotionPercent + peakImprovement && sampleMs - event.lastPeakCaptureMs >= consolidationMs) {
      event.peakMotionPercent = sample.changedPixelPercent;
      event.lastPeakCaptureMs = sampleMs;
      scheduleCapture(event, "peak", sample.capturedAt);
    } else event.peakMotionPercent = Math.max(event.peakMotionPercent, meaningful);

    const quietLongEnough = event.quietFrames >= endFrames && sampleMs - event.lastMotionMs >= closeAfterMs;
    if (quietLongEnough || ageMs >= MAX_EVENT_DURATION_MS) {
      void finalizeEvent(event, sample.capturedAt, ageMs >= MAX_EVENT_DURATION_MS ? "maximum_duration" : "motion_stopped");
    }
  }

  return {
    isRunning: () => !stopped,
    framesObserved: () => totalFramesObserved,
    calibrationSnapshot: () => lastSnapshot,
    stop: async (reason = "agent_stopped") => {
      if (stopped) return;
      stopped = true;
      unsubscribe?.();
      unsubscribeError?.();
      if (activeEvent) await finalizeEvent(activeEvent, new Date().toISOString(), reason);
      try {
        const source = timeline ?? await timelinePromise;
        await releaseTimeline(options.camera.id, source);
      } catch { /* já falhou */ }
    },
  };
}
