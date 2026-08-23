export type MotionCalibrationSnapshot = {
  ready: boolean;
  samples: number;
  observedSamples: number;
  p50: number;
  p90: number;
  p95: number;
  effectiveStartThreshold: number;
  effectiveContinueThreshold: number;
};

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo] ?? 0;
  return (sorted[lo] ?? 0) * (1 - (pos - lo)) + (sorted[hi] ?? 0) * (pos - lo);
}

const rounded = (value: number) => Number(value.toFixed(4));

/**
 * Calibração 1.0.2: aprende somente repouso comprovado.
 *
 * A 1.0.1 aceitava como ruído qualquer amostra até 3x o limiar configurado.
 * Uma pessoa andando devagar podia, portanto, elevar o próprio limiar até a
 * câmera ficar silenciosamente insensível. Aqui existe uma janela de repouso
 * estreita e um contador separado de observações: após o warm-up a câmera
 * SEMPRE fica pronta, mesmo se não houver amostras de repouso suficientes.
 */
export class AdaptiveMotionCalibration {
  private readonly quietValues: number[] = [];
  private observed = 0;
  private readonly maximumSamples: number;

  constructor(maximumSamples = 180) {
    this.maximumSamples = Math.max(30, maximumSamples);
  }

  observe(changedPixelPercent: number, configuredStartThreshold: number, eligible = true) {
    if (!Number.isFinite(changedPixelPercent)) return;
    // O warm-up mede que a câmera está produzindo amostras, não que o ambiente
    // ficou parado. Isso impede uma loja movimentada de ficar eternamente em
    // calibração. Somente amostras explicitamente elegíveis entram no baseline.
    this.observed += 1;
    if (!eligible) return;

    const quietCeiling = Math.max(
      0.12,
      Math.min(1.5, configuredStartThreshold * 0.55),
    );

    if (changedPixelPercent < 0 || changedPixelPercent > quietCeiling) return;

    this.quietValues.push(changedPixelPercent);
    while (this.quietValues.length > this.maximumSamples) this.quietValues.shift();
  }

  snapshot(
    configuredStartThreshold: number,
    configuredContinueThreshold: number,
    adaptiveEnabled: boolean,
    thresholdMultiplier = 1,
  ): MotionCalibrationSnapshot {
    const p50 = percentile(this.quietValues, 0.5);
    const p90 = percentile(this.quietValues, 0.9);
    const p95 = percentile(this.quietValues, 0.95);
    const warm = this.observed >= 30;
    const enoughQuiet = this.quietValues.length >= 12;

    let effectiveContinueThreshold = configuredContinueThreshold;
    let effectiveStartThreshold = configuredStartThreshold;

    if (adaptiveEnabled && warm && enoughQuiet) {
      // O adaptativo só pode subir de forma limitada em relação ao valor
      // configurado. Baseline não vira um segundo "controle remoto" da câmera.
      effectiveContinueThreshold = Math.min(
        configuredStartThreshold * 0.9,
        Math.max(
          configuredContinueThreshold,
          p90 + Math.max(0.15, p90 * 0.30),
        ),
      );
      effectiveStartThreshold = Math.min(
        configuredStartThreshold * 2,
        Math.max(
          configuredStartThreshold,
          p95 + Math.max(0.35, p95 * 0.60),
          effectiveContinueThreshold * 1.20,
        ),
      );
    }

    effectiveContinueThreshold = Math.min(30, effectiveContinueThreshold * thresholdMultiplier);
    effectiveStartThreshold = Math.min(
      40,
      Math.max(effectiveContinueThreshold * 1.2, effectiveStartThreshold * thresholdMultiplier),
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
