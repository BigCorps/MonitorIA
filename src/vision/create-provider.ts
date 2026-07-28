import { OpenAIVisionProvider } from "./openai-provider";
import type { VisionProvider } from "./types";

export function createVisionProvider(): VisionProvider {
  const provider = (process.env.VISION_PROVIDER ?? "openai").toLowerCase();

  switch (provider) {
    case "openai":
      return new OpenAIVisionProvider();
    default:
      throw new Error(`VISION_PROVIDER não suportado: ${provider}`);
  }
}
