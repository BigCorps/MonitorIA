import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AnalyzedEventSchema,
  AnalyzedEventTransportSchema,
} from "../contracts/analyzed-event.js";
import { buildVisionContext, buildVisionInstructions } from "./prompt.js";
import type {
  AnalyzeEventInput,
  VisionAnalysisResult,
  VisionImageDetail,
  VisionProvider,
} from "./types.js";

export interface OpenAIVisionProviderOptions {
  apiKey?: string;
  model?: string;
  detail?: VisionImageDetail;
  maxOutputTokens?: number;
  store?: boolean;
  client?: OpenAI;
}

function envBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

export class OpenAIVisionProvider implements VisionProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly detail: VisionImageDetail;
  private readonly maxOutputTokens: number;
  private readonly store: boolean;

  constructor(options: OpenAIVisionProviderOptions = {}) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      });
    this.model = options.model ?? process.env.VISION_MODEL ?? "gpt-5-mini";
    this.detail =
      options.detail ??
      (process.env.VISION_DETAIL as VisionImageDetail | undefined) ??
      "low";
    this.maxOutputTokens =
      options.maxOutputTokens ??
      Number(process.env.VISION_MAX_OUTPUT_TOKENS ?? "700");
    this.store =
      options.store ?? envBoolean(process.env.VISION_STORE_RESPONSES, false);
  }

  async analyzeEvent(input: AnalyzeEventInput): Promise<VisionAnalysisResult> {
    if (input.frames.length < 1 || input.frames.length > 4) {
      throw new Error("A análise exige de 1 a 4 quadros por evento.");
    }

    const started = performance.now();
    const response = await this.client.responses.parse({
      model: this.model,
      store: this.store,
      max_output_tokens: this.maxOutputTokens,
      instructions: buildVisionInstructions(),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Analise o evento usando este contexto:\n${buildVisionContext(input)}`,
            },
            ...input.frames.map((frame) => ({
              type: "input_image" as const,
              image_url: frame.imageUrl,
              detail: this.detail,
            })),
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          AnalyzedEventTransportSchema,
          "monitoria_analyzed_event",
        ),
      },
    });
    const latencyMs = Math.round(performance.now() - started);

    if (!response.output_parsed) {
      throw new Error(`A OpenAI não retornou evento estruturado. Status: ${response.status}`);
    }

    const event = AnalyzedEventSchema.parse(response.output_parsed);
    const usage = response.usage;

    return {
      event,
      provider: "openai",
      model: this.model,
      responseId: response.id,
      usage: {
        inputTokens: usage?.input_tokens ?? 0,
        outputTokens: usage?.output_tokens ?? 0,
        totalTokens: usage?.total_tokens ?? 0,
      },
      latencyMs,
    };
  }
}
