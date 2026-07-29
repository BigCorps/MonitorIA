import type { VisionUsage } from "./types";

export type VisionCostBreakdown = {
  model: string;
  billableInputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  inputCostUsd: number;
  cachedInputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  rates: {
    inputUsdPer1M: number;
    cachedInputUsdPer1M: number;
    outputUsdPer1M: number;
  };
};

function finiteRate(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function ratesForModel(model: string) {
  const isNano = model === "gpt-5-nano" || model.startsWith("gpt-5-nano-");

  if (isNano) {
    return {
      inputUsdPer1M: finiteRate(
        process.env.VISION_NANO_INPUT_USD_PER_1M,
        0.05,
      ),
      cachedInputUsdPer1M: finiteRate(
        process.env.VISION_NANO_CACHED_INPUT_USD_PER_1M,
        0.005,
      ),
      outputUsdPer1M: finiteRate(
        process.env.VISION_NANO_OUTPUT_USD_PER_1M,
        0.4,
      ),
    };
  }

  return {
    inputUsdPer1M: finiteRate(
      process.env.VISION_MINI_INPUT_USD_PER_1M ??
        process.env.VISION_INPUT_USD_PER_1M,
      0.25,
    ),
    cachedInputUsdPer1M: finiteRate(
      process.env.VISION_MINI_CACHED_INPUT_USD_PER_1M,
      0.025,
    ),
    outputUsdPer1M: finiteRate(
      process.env.VISION_MINI_OUTPUT_USD_PER_1M ??
        process.env.VISION_OUTPUT_USD_PER_1M,
      2,
    ),
  };
}

export function estimateVisionCostBreakdown(
  model: string,
  usage: VisionUsage,
): VisionCostBreakdown {
  const rates = ratesForModel(model);
  const cachedInputTokens = Math.max(
    0,
    Math.min(usage.inputTokens, usage.cachedInputTokens),
  );
  const billableInputTokens = Math.max(
    0,
    usage.inputTokens - cachedInputTokens,
  );

  const inputCostUsd =
    (billableInputTokens * rates.inputUsdPer1M) / 1_000_000;
  const cachedInputCostUsd =
    (cachedInputTokens * rates.cachedInputUsdPer1M) / 1_000_000;
  const outputCostUsd =
    (Math.max(0, usage.outputTokens) * rates.outputUsdPer1M) /
    1_000_000;

  return {
    model,
    billableInputTokens,
    cachedInputTokens,
    outputTokens: Math.max(0, usage.outputTokens),
    reasoningTokens: Math.max(0, usage.reasoningTokens),
    inputCostUsd,
    cachedInputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + cachedInputCostUsd + outputCostUsd,
    rates,
  };
}

export function estimateVisionCostUsd(
  model: string,
  usage: VisionUsage,
) {
  return estimateVisionCostBreakdown(model, usage).totalCostUsd;
}
