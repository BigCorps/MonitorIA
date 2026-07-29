export type MotionCalibrationSnapshot = {
  ready: boolean;
  samples: number;
  p50: number;
  p90: number;
  p95: number;
  effectiveStartThreshold: number;
  effectiveContinueThreshold: number;
};

function percentile(values: number[], percentileValue: number) {
  if (!values.length) return 0;

  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower] ?? 0;

  const weight = position - lower;
  return (
    (sorted[lower] ?? 0) * (1 - weight) +
    (sorted[upper] ?? 0) * weight
  );
}

function rounded(value: number) {
  return Number(value.toFixed(4));
}

export class AdaptiveMotionCalibration {
  private readonly values: number[] = [];
  private readonly maximumSamples: number;

  constructor(maximumSamples = 180) {
    this.maximumSamples = Math.max(30, maximumSamples);
  }

  observe(
    changedPixelPercent: number,
    configuredStartThreshold: number,
    eligible = true,
  ) {
    if (!eligible || !Number.isFinite(changedPixelPercent)) return;

    const upperQuietBound = Math.max(
      5,
      configuredStartThreshold * 3,
    );

    if (
      changedPixelPercent < 0 ||
      changedPixelPercent > upperQuietBound
    ) {
      return;
    }

    this.values.push(changedPixelPercent);

    while (this.values.length > this.maximumSamples) {
      this.values.shift();
    }
  }

  snapshot(
    configuredStartThreshold: number,
    configuredContinueThreshold: number,
    adaptiveEnabled: boolean,
    thresholdMultiplier = 1,
  ): MotionCalibrationSnapshot {
    const p50 = percentile(this.values, 0.5);
    const p90 = percentile(this.values, 0.9);
    const p95 = percentile(this.values, 0.95);
    const ready = this.values.length >= 30;

    let effectiveContinueThreshold =
      configuredContinueThreshold;
    let effectiveStartThreshold = configuredStartThreshold;

    if (adaptiveEnabled && ready) {
      effectiveContinueThreshold = Math.max(
        configuredContinueThreshold,
        p90 + Math.max(0.2, p90 * 0.35),
      );

      effectiveStartThreshold = Math.max(
        configuredStartThreshold,
        p95 + Math.max(0.5, p95 * 0.75),
        effectiveContinueThreshold * 1.25,
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
      ready: adaptiveEnabled ? ready : true,
      samples: this.values.length,
      p50: rounded(p50),
      p90: rounded(p90),
      p95: rounded(p95),
      effectiveStartThreshold: rounded(effectiveStartThreshold),
      effectiveContinueThreshold: rounded(
        effectiveContinueThreshold,
      ),
    };
  }
}
