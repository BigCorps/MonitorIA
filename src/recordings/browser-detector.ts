"use client";

import {
  buildRecordingMotionMask,
  calculateRecordingMotion,
  isLikelyCameraNoise,
  RecordingBorderNoiseSuppressor,
} from "./browser-motion";
import {
  RecordingAdaptiveMotionCalibration,
  type RecordingCalibrationSnapshot,
} from "./browser-calibration";
import { recordingScheduleState } from "./browser-schedule";
import type {
  RecordingCameraConfig,
  RecordingCandidate,
  RecordingFrameLabel,
  RecordingPlanCode,
} from "./types";

const MAX_EVENT_DURATION_MS = 5 * 60_000;

type ActiveEvent = {
  id: string;
  startedAt: string;
  startedAtSeconds: number;
  startedMs: number;
  lastMotionMs: number;
  peakMotionPercent: number;
  rawPeakMotionPercent: number;
  motionSum: number;
  samples: number;
  framesObserved: number;
  lastPeakCaptureMs: number;
  quietFrames: number;
  extraCaptured: boolean;
  thresholds: RecordingCalibrationSnapshot;
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
  evidence: Partial<Record<RecordingFrameLabel, number>>;
};

export type RecordingCaptureRequest = {
  eventId: string;
  label: RecordingFrameLabel;
  offsetSeconds: number;
};

export type RecordingDetectorStep = {
  capture: RecordingCaptureRequest[];
  closed: RecordingCandidate[];
};

function planBehavior(code: RecordingPlanCode) {
  if (code === "basic") {
    return {
      maximumFrames: 1,
      chapterMinimumSeconds: 60,
      chapterMaximumSeconds: 240,
      regionShiftThreshold: 0.35,
    };
  }
  if (code === "intensive") {
    return {
      maximumFrames: 4,
      chapterMinimumSeconds: 60,
      chapterMaximumSeconds: 240,
      regionShiftThreshold: 0.28,
    };
  }
  return {
    maximumFrames: 3,
    chapterMinimumSeconds: 45,
    chapterMaximumSeconds: 180,
    regionShiftThreshold: 0.3,
  };
}

function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    const result = char === "x" ? value : (value & 0x3) | 0x8;
    return result.toString(16);
  });
}

const rounded = (value: number) => Number(value.toFixed(4));

export class RecordingEventDetector {
  private readonly behavior;
  private readonly staticMask;
  private readonly borderNoise = new RecordingBorderNoiseSuppressor();
  private readonly calibration = new RecordingAdaptiveMotionCalibration();
  private previous: Uint8Array | null = null;
  private activeEvent: ActiveEvent | null = null;
  private startCandidateFrames = 0;
  private cooldownUntil = 0;
  private requireQuietBeforeRestart = false;
  private quietRecoveryFrames = 0;
  private suppressedNoise = 0;
  private totalFramesObserved = 0;
  private lastSnapshot: RecordingCalibrationSnapshot;
  private lastSample:
    | { capturedAt: string; offsetSeconds: number; sampleMs: number }
    | null = null;

  constructor(
    private readonly config: RecordingCameraConfig,
    private readonly sourceStartedAt: Date,
  ) {
    this.behavior = planBehavior(config.planCode);
    this.staticMask = buildRecordingMotionMask(
      config.motionIgnorePolygons ?? [],
      config.motionOverlayMask,
    );
    this.lastSnapshot = this.calibration.snapshot(
      config.motionStartThreshold,
      config.motionContinueThreshold,
      config.motionAdaptiveEnabled,
    );
  }

  private finalize(
    event: ActiveEvent,
    endedAt: string,
    endedAtSeconds: number,
    closeReason: string,
  ): RecordingDetectorStep {
    const capture: RecordingCaptureRequest[] = [];

    if (this.config.planCode !== "basic") {
      event.evidence.end = endedAtSeconds;
      capture.push({
        eventId: event.id,
        label: "end",
        offsetSeconds: endedAtSeconds,
      });
    }

    this.activeEvent = null;
    this.startCandidateFrames = 0;

    if (closeReason === "maximum_duration") {
      this.requireQuietBeforeRestart = true;
      this.quietRecoveryFrames = 0;
    } else if (
      [
        "activity_region_changed",
        "activity_resumed",
        "activity_chapter_limit",
      ].includes(closeReason)
    ) {
      this.cooldownUntil = Date.parse(endedAt) + 1000;
    } else {
      this.cooldownUntil =
        Date.parse(endedAt) +
        Math.max(0, Math.min(300, this.config.motionCooldownSeconds)) *
          1000;
    }

    const order: RecordingFrameLabel[] =
      this.config.planCode === "basic"
        ? ["peak", "start", "end", "extra"]
        : this.config.planCode === "intensive"
          ? ["start", "extra", "peak", "end"]
          : ["start", "peak", "end", "extra"];

    const selected = order
      .flatMap((label) => {
        const offset = event.evidence[label];
        return typeof offset === "number" ? [{ label, offsetSeconds: offset }] : [];
      })
      .filter(
        (entry, index, all) =>
          all.findIndex(
            (candidate) =>
              Math.abs(candidate.offsetSeconds - entry.offsetSeconds) < 0.001,
          ) === index,
      )
      .slice(0, this.behavior.maximumFrames);

    const durationSeconds = Math.max(
      0,
      (Date.parse(endedAt) - event.startedMs) / 1000,
    );

    const candidate: RecordingCandidate = {
      eventId: event.id,
      startedAt: event.startedAt,
      endedAt,
      startedAtSeconds: event.startedAtSeconds,
      endedAtSeconds,
      evidence: selected,
      localMetrics: {
        planCode: this.config.planCode,
        peakMotionPercent: rounded(event.peakMotionPercent),
        meanMotionPercent: rounded(
          event.samples ? event.motionSum / event.samples : 0,
        ),
        rawPeakMotionPercent: rounded(event.rawPeakMotionPercent),
        durationSeconds: rounded(durationSeconds),
        framesObserved: event.framesObserved,
        configuredStartThreshold: rounded(this.config.motionStartThreshold),
        configuredContinueThreshold: rounded(
          this.config.motionContinueThreshold,
        ),
        effectiveStartThreshold:
          event.thresholds.effectiveStartThreshold,
        effectiveContinueThreshold:
          event.thresholds.effectiveContinueThreshold,
        noiseP50Percent: event.thresholds.p50,
        noiseP90Percent: event.thresholds.p90,
        noiseP95Percent: event.thresholds.p95,
        ignoredPixelPercent: rounded(event.ignoredPixelPercent),
        autoIgnoredCellCount: event.autoIgnoredCellCount,
        startConsecutiveFrames: this.config.motionStartConsecutiveFrames,
        endConsecutiveFrames: this.config.motionEndConsecutiveFrames,
        cooldownSeconds: this.config.motionCooldownSeconds,
        chapterMinimumSeconds: this.behavior.chapterMinimumSeconds,
        chapterMaximumSeconds: this.behavior.chapterMaximumSeconds,
        regionShiftThreshold: this.behavior.regionShiftThreshold,
        dominantRegion: event.dominantRegion,
        motionCentroidX: event.anchorCentroidX,
        motionCentroidY: event.anchorCentroidY,
        motionRegionCount: event.motionRegions.size,
        motionSpreadPercent: rounded(event.maxMotionSpreadPercent),
        motionDensityPercent: rounded(event.maxMotionDensityPercent),
        startMeanLuma: rounded(event.startMeanLuma),
        maxDirectionalChangeRatio: rounded(
          event.maxDirectionalChangeRatio,
        ),
        suppressedCameraNoiseSamples: this.suppressedNoise,
        closeReason,
        evidenceTimeline: "local_recording_v1",
        sourceKind: "local_recording",
      },
    };

    return { capture, closed: [candidate] };
  }

  observe(input: {
    luma: Uint8Array;
    offsetSeconds: number;
    capturedAt: string;
  }): RecordingDetectorStep {
    const capture: RecordingCaptureRequest[] = [];
    const closed: RecordingCandidate[] = [];
    const current = input.luma;
    const date = new Date(input.capturedAt);
    const sampleMs = date.getTime();

    this.lastSample = {
      capturedAt: input.capturedAt,
      offsetSeconds: input.offsetSeconds,
      sampleMs,
    };

    if (!this.previous) {
      this.previous = current;
      return { capture, closed };
    }

    this.totalFramesObserved += 1;

    if (this.config.motionOverlayMask === "auto") {
      this.borderNoise.observe(this.previous, current, this.staticMask);
    }

    const raw = calculateRecordingMotion(
      this.previous,
      current,
      20,
      this.staticMask,
    );
    const combined =
      this.config.motionOverlayMask === "auto"
        ? this.borderNoise.apply(this.staticMask)
        : this.staticMask;
    const effective = calculateRecordingMotion(
      this.previous,
      current,
      20,
      combined,
    );
    this.previous = current;

    const ignoredPixels = combined.reduce(
      (sum, value) => sum + (value ? 1 : 0),
      0,
    );
    const likelyNoise = isLikelyCameraNoise(effective);

    const schedule = recordingScheduleState(
      this.config.monitoringSchedule,
      this.config.timezone,
      date,
    );

    if (!schedule.enabled) {
      this.startCandidateFrames = 0;
      if (this.activeEvent) {
        return this.finalize(
          this.activeEvent,
          input.capturedAt,
          input.offsetSeconds,
          "schedule_ended",
        );
      }
      return { capture, closed };
    }

    const quietForCalibration =
      !this.activeEvent &&
      !this.requireQuietBeforeRestart &&
      sampleMs >= this.cooldownUntil &&
      !likelyNoise &&
      effective.changedPixelPercent <
        this.config.motionContinueThreshold * 0.8;

    this.calibration.observe(
      effective.changedPixelPercent,
      this.config.motionStartThreshold,
      quietForCalibration,
    );

    this.lastSnapshot = this.calibration.snapshot(
      this.config.motionStartThreshold,
      this.config.motionContinueThreshold,
      this.config.motionAdaptiveEnabled,
      schedule.thresholdMultiplier,
    );

    if (!this.lastSnapshot.ready) return { capture, closed };

    const endFrames = Math.max(
      2,
      Math.min(
        60,
        Math.floor(this.config.motionEndConsecutiveFrames || 6),
      ),
    );

    if (this.requireQuietBeforeRestart) {
      if (
        likelyNoise ||
        effective.changedPixelPercent <
          this.lastSnapshot.effectiveContinueThreshold
      ) {
        this.quietRecoveryFrames += 1;
      } else {
        this.quietRecoveryFrames = 0;
      }

      if (this.quietRecoveryFrames >= endFrames) {
        this.requireQuietBeforeRestart = false;
        this.quietRecoveryFrames = 0;
        this.cooldownUntil =
          sampleMs +
          Math.max(
            0,
            Math.min(300, this.config.motionCooldownSeconds),
          ) *
            1000;
      }
      return { capture, closed };
    }

    if (sampleMs < this.cooldownUntil) return { capture, closed };

    const startFrames = Math.max(
      1,
      Math.min(
        20,
        Math.floor(this.config.motionStartConsecutiveFrames || 3),
      ),
    );

    if (!this.activeEvent) {
      if (
        !likelyNoise &&
        effective.changedPixelPercent >=
          this.lastSnapshot.effectiveStartThreshold
      ) {
        this.startCandidateFrames += 1;
      } else {
        if (likelyNoise) this.suppressedNoise += 1;
        this.startCandidateFrames = 0;
      }

      const required = startFrames + (effective.meanLuma <= 52 ? 1 : 0);
      if (this.startCandidateFrames < required) {
        return { capture, closed };
      }

      this.startCandidateFrames = 0;
      const id = uuid();

      this.activeEvent = {
        id,
        startedAt: input.capturedAt,
        startedAtSeconds: input.offsetSeconds,
        startedMs: sampleMs,
        lastMotionMs: sampleMs,
        peakMotionPercent: effective.changedPixelPercent,
        rawPeakMotionPercent: raw.changedPixelPercent,
        motionSum: effective.changedPixelPercent,
        samples: 1,
        framesObserved: 1,
        lastPeakCaptureMs: sampleMs,
        quietFrames: 0,
        extraCaptured: false,
        thresholds: this.lastSnapshot,
        ignoredPixelPercent:
          (ignoredPixels / Math.max(1, combined.length)) * 100,
        autoIgnoredCellCount: this.borderNoise.count(),
        anchorCentroidX: effective.motionCentroidX,
        anchorCentroidY: effective.motionCentroidY,
        dominantRegion: effective.dominantRegion,
        regionShiftFrames: 0,
        motionRegions: new Set(
          effective.dominantRegion ? [effective.dominantRegion] : [],
        ),
        maxMotionSpreadPercent: effective.motionSpreadPercent,
        maxMotionDensityPercent: effective.motionDensityPercent,
        startMeanLuma: effective.meanLuma,
        maxDirectionalChangeRatio: effective.directionalChangeRatio,
        evidence: { start: input.offsetSeconds },
      };

      capture.push({
        eventId: id,
        label: "start",
        offsetSeconds: input.offsetSeconds,
      });

      return { capture, closed };
    }

    const event = this.activeEvent;
    const meaningful = likelyNoise ? 0 : effective.changedPixelPercent;
    event.framesObserved += 1;
    event.samples += 1;
    event.motionSum += meaningful;
    event.rawPeakMotionPercent = Math.max(
      event.rawPeakMotionPercent,
      likelyNoise ? 0 : raw.changedPixelPercent,
    );
    event.ignoredPixelPercent =
      (ignoredPixels / Math.max(1, combined.length)) * 100;
    event.autoIgnoredCellCount = this.borderNoise.count();
    event.maxMotionSpreadPercent = Math.max(
      event.maxMotionSpreadPercent,
      effective.motionSpreadPercent,
    );
    event.maxMotionDensityPercent = Math.max(
      event.maxMotionDensityPercent,
      effective.motionDensityPercent,
    );
    event.maxDirectionalChangeRatio = Math.max(
      event.maxDirectionalChangeRatio,
      effective.directionalChangeRatio,
    );
    if (effective.dominantRegion) {
      event.motionRegions.add(effective.dominantRegion);
    }
    if (likelyNoise) this.suppressedNoise += 1;

    const quietBefore = event.quietFrames;
    if (
      meaningful >= this.lastSnapshot.effectiveContinueThreshold
    ) {
      event.lastMotionMs = sampleMs;
      event.quietFrames = 0;
    } else {
      event.quietFrames += 1;
    }

    const ageMs = sampleMs - event.startedMs;
    const chapterMinimumMs =
      this.behavior.chapterMinimumSeconds * 1000;
    const chapterMaximumMs =
      this.behavior.chapterMaximumSeconds * 1000;

    if (
      meaningful >= this.lastSnapshot.effectiveContinueThreshold &&
      effective.motionCentroidX !== null &&
      effective.motionCentroidY !== null
    ) {
      if (
        event.anchorCentroidX === null ||
        event.anchorCentroidY === null
      ) {
        event.anchorCentroidX = effective.motionCentroidX;
        event.anchorCentroidY = effective.motionCentroidY;
        event.dominantRegion = effective.dominantRegion;
      } else {
        const distance = Math.hypot(
          effective.motionCentroidX - event.anchorCentroidX,
          effective.motionCentroidY - event.anchorCentroidY,
        );
        const changed = Boolean(
          effective.dominantRegion &&
            event.dominantRegion &&
            effective.dominantRegion !== event.dominantRegion &&
            distance >= this.behavior.regionShiftThreshold,
        );

        if (changed) {
          event.regionShiftFrames += 1;
        } else {
          event.regionShiftFrames = 0;
          event.anchorCentroidX =
            event.anchorCentroidX * 0.85 +
            effective.motionCentroidX * 0.15;
          event.anchorCentroidY =
            event.anchorCentroidY * 0.85 +
            effective.motionCentroidY * 0.15;
          event.dominantRegion =
            effective.dominantRegion ?? event.dominantRegion;
        }
      }
    } else {
      event.regionShiftFrames = 0;
    }

    if (
      ageMs >= chapterMinimumMs &&
      quietBefore >= 3 &&
      meaningful >= this.lastSnapshot.effectiveStartThreshold
    ) {
      return this.finalize(
        event,
        input.capturedAt,
        input.offsetSeconds,
        "activity_resumed",
      );
    }

    if (
      ageMs >= chapterMinimumMs &&
      event.regionShiftFrames >= 3
    ) {
      return this.finalize(
        event,
        input.capturedAt,
        input.offsetSeconds,
        "activity_region_changed",
      );
    }

    if (
      ageMs >= chapterMaximumMs &&
      meaningful >= this.lastSnapshot.effectiveStartThreshold
    ) {
      return this.finalize(
        event,
        input.capturedAt,
        input.offsetSeconds,
        "activity_chapter_limit",
      );
    }

    const consolidationMs =
      Math.max(
        1,
        Math.min(3600, this.config.consolidationIntervalSeconds),
      ) * 1000;

    if (
      this.config.planCode === "intensive" &&
      !event.extraCaptured &&
      ageMs >= consolidationMs
    ) {
      event.extraCaptured = true;
      event.evidence.extra = input.offsetSeconds;
      capture.push({
        eventId: event.id,
        label: "extra",
        offsetSeconds: input.offsetSeconds,
      });
    }

    const peakImprovement = Math.max(
      0.25,
      this.lastSnapshot.effectiveStartThreshold * 0.15,
    );

    if (
      meaningful >= event.peakMotionPercent + peakImprovement &&
      sampleMs - event.lastPeakCaptureMs >= consolidationMs
    ) {
      event.peakMotionPercent = effective.changedPixelPercent;
      event.lastPeakCaptureMs = sampleMs;
      event.evidence.peak = input.offsetSeconds;
      capture.push({
        eventId: event.id,
        label: "peak",
        offsetSeconds: input.offsetSeconds,
      });
    } else {
      event.peakMotionPercent = Math.max(
        event.peakMotionPercent,
        meaningful,
      );
    }

    const planCloseFloor =
      this.config.planCode === "intensive"
        ? 25
        : this.config.planCode === "standard"
          ? 20
          : 30;

    const closeAfterMs =
      Math.max(
        planCloseFloor,
        Math.min(300, this.config.eventCloseAfterSeconds),
      ) * 1000;

    const quietLongEnough =
      event.quietFrames >= endFrames &&
      sampleMs - event.lastMotionMs >= closeAfterMs;

    if (quietLongEnough || ageMs >= MAX_EVENT_DURATION_MS) {
      return this.finalize(
        event,
        input.capturedAt,
        input.offsetSeconds,
        ageMs >= MAX_EVENT_DURATION_MS
          ? "maximum_duration"
          : "motion_stopped",
      );
    }

    return { capture, closed };
  }

  finish() {
    if (!this.activeEvent || !this.lastSample) {
      return { capture: [], closed: [] } as RecordingDetectorStep;
    }

    return this.finalize(
      this.activeEvent,
      this.lastSample.capturedAt,
      this.lastSample.offsetSeconds,
      "recording_ended",
    );
  }

  framesObserved() {
    return this.totalFramesObserved;
  }
}
