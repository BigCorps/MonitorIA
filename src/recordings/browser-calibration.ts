"use client";

export type RecordingCalibrationSnapshot = {
  ready: boolean;
  samples: number;
  observedSamples: number;
  p50: number;
  p90: number;
  p95: number;
  effectiveStartThreshold: number;
  effectiveContinueThreshold: number;
};

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const low = Math.floor(position);
  const high = Math.ceil(position);
  if (low === high) return sorted[low] ?? 0;
  return (
    (sorted[low] ?? 0) * (1 - (position - low)) +
    (sorted[high] ?? 0) * (position - low)
  );
}

const rounded = (value: number) => Number(value.toFixed(4));

export class RecordingAdaptiveMotionCalibration {
  private readonly quietValues: number[] = [];
  private observed = 0;

  constructor(private readonly maximumSamples = 180) {}

  observe(
    changedPixelPercent: number,
    configuredStartThreshold: number,
    eligible = true,
  ) {
    if (!Number.isFinite(changedPixelPercent)) return;

    this.observed += 1;
    if (!eligible) return;

    const quietCeiling = Math.max(
      0.12,
      Math.min(1.5, configuredStartThreshold * 0.55),
    );

    if (
      changedPixelPercent < 0 ||
      changedPixelPercent > quietCeiling
    ) {
      return;
    }

    this.quietValues.push(changedPixelPercent);
    while (this.quietValues.length > Math.max(30, this.maximumSamples)) {
      this.quietValues.shift();
    }
  }

  snapshot(
    configuredStartThreshold: number,
    configuredContinueThreshold: number,
    adaptiveEnabled: boolean,
    thresholdMultiplier = 1,
  ): RecordingCalibrationSnapshot {
    const p50 = percentile(this.quietValues, 0.5);
    const p90 = percentile(this.quietValues, 0.9);
    const p95 = percentile(this.quietValues, 0.95);
    const warm = this.observed >= 30;
    const enoughQuiet = this.quietValues.length >= 12;

    let effectiveContinueThreshold = configuredContinueThreshold;
    let effectiveStartThreshold = configuredStartThreshold;

    if (adaptiveEnabled && warm && enoughQuiet) {
      effectiveContinueThreshold = Math.min(
        configuredStartThreshold * 0.9,
        Math.max(
          configuredContinueThreshold,
          p90 + Math.max(0.15, p90 * 0.3),
        ),
      );
      effectiveStartThreshold = Math.min(
        configuredStartThreshold * 2,
        Math.max(
          configuredStartThreshold,
          p95 + Math.max(0.35, p95 * 0.6),
          effectiveContinueThreshold * 1.2,
        ),
      );
    }

    effectiveContinueThreshold = Math.min(
      30,
      effectiveContinueThreshold * thresholdMultiplier,
    );
    effectiveStartThreshold = Math.min(
      40,
      Math.max(
        effectiveContinueThreshold * 1.2,
        effectiveStartThreshold * thresholdMultiplier,
      ),
    );

    return {
      ready: adaptiveEnabled ? warm : true,
      samples: this.quietValues.length,
      observedSamples: this.observed,
      p50: rounded(p50),
      p90: rounded(p90),
      p95: rounded(p95),
      effectiveStartThreshold: rounded(effectiveStartThreshold),
      effectiveContinueThreshold: rounded(effectiveContinueThreshold),
    };
  }
}
