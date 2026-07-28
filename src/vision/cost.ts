import type { VisionUsage } from "./types.js";

function finiteRate(value: string | undefined) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function estimateVisionCostUsd(model: string, usage: VisionUsage) {
  const isGpt5Mini =
    model === "gpt-5-mini" || model.startsWith("gpt-5-mini-");

  const inputRate =
    finiteRate(process.env.VISION_INPUT_USD_PER_1M) ??
    (isGpt5Mini ? 0.25 : null);
  const outputRate =
    finiteRate(process.env.VISION_OUTPUT_USD_PER_1M) ??
    (isGpt5Mini ? 2 : null);

  if (inputRate === null || outputRate === null) {
    return null;
  }

  return (
    (usage.inputTokens * inputRate) / 1_000_000 +
    (usage.outputTokens * outputRate) / 1_000_000
  );
}
