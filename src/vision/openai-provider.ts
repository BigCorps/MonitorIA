import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AnalyzedEventSchema,
  AnalyzedEventTransportSchema,
} from "../contracts/analyzed-event";
import { CameraProfileDraftSchema } from "../contracts/camera-profile-draft";
import {
  buildVisionEventContext,
  buildVisionInstructions,
  buildVisionStableContext,
} from "./prompt";
import {
  buildCameraProfileContext,
  buildCameraProfileInstructions,
} from "./profile-prompt";
import type {
  AnalyzeCameraProfileInput,
  AnalyzeEventInput,
  CameraProfileAnalysisResult,
  VisionAnalysisResult,
  VisionImageDetail,
  VisionProvider,
  VisionUsage,
} from "./types";

export interface OpenAIVisionProviderOptions {
  apiKey?: string;
  model?: string;
  detail?: VisionImageDetail;
  profileDetail?: VisionImageDetail;
  maxOutputTokens?: number;
  profileMaxOutputTokens?: number;
  store?: boolean;
  client?: OpenAI;
}

function envBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

function positiveInteger(
  value: number | string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : fallback;
}

function responseUsage(
  usage:
    | {
        input_tokens?: number;
        input_tokens_details?: { cached_tokens?: number };
        output_tokens?: number;
        output_tokens_details?: { reasoning_tokens?: number };
        total_tokens?: number;
      }
    | null
    | undefined,
): VisionUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens:
      usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    reasoningTokens:
      usage?.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function addUsage(left: VisionUsage, right: VisionUsage): VisionUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens:
      left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens:
      left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export class OpenAIVisionProvider implements VisionProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly detail: VisionImageDetail;
  private readonly profileDetail: VisionImageDetail;
  private readonly maxOutputTokens: number;
  private readonly profileMaxOutputTokens: number;
  private readonly store: boolean;

  constructor(options: OpenAIVisionProviderOptions = {}) {
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey ?? process.env.OPENAI_API_KEY,
      });

    this.model =
      options.model ??
      process.env.VISION_MODEL ??
      "gpt-5-mini";

    this.detail =
      options.detail ??
      (process.env.VISION_DETAIL as VisionImageDetail | undefined) ??
      "low";

    this.profileDetail =
      options.profileDetail ??
      (process.env.VISION_PROFILE_DETAIL as VisionImageDetail | undefined) ??
      "high";

    this.maxOutputTokens = positiveInteger(
      options.maxOutputTokens ??
        process.env.VISION_MAX_OUTPUT_TOKENS,
      3000,
    );

    this.profileMaxOutputTokens = Math.max(
      5000,
      positiveInteger(
        options.profileMaxOutputTokens ??
          process.env.VISION_PROFILE_MAX_OUTPUT_TOKENS,
        5000,
      ),
    );

    this.store =
      options.store ?? envBoolean(process.env.VISION_STORE_RESPONSES, false);
  }

  async analyzeEvent(input: AnalyzeEventInput): Promise<VisionAnalysisResult> {
    if (input.frames.length < 1 || input.frames.length > 4) {
      throw new Error("A análise exige de 1 a 4 quadros por evento.");
    }

    const started = performance.now();

    const requestEvent = (maxOutputTokens: number) =>
      this.client.responses.parse({
        model: this.model,
        store: this.store,
        max_output_tokens: maxOutputTokens,
        prompt_cache_key: input.promptCacheKey,
        reasoning: {
          effort: "minimal",
        },
        instructions: buildVisionInstructions(
          input.analysisMode ?? "balanced",
          Boolean(input.verificationCandidate),
        ),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Contexto estável da câmera:\n${buildVisionStableContext(input)}`,
              },
              {
                type: "input_text",
                text: `Contexto variável do evento:\n${buildVisionEventContext(input)}`,
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

    let response = await requestEvent(this.maxOutputTokens);
    let combinedUsage = responseUsage(response.usage);

    if (
      !response.output_parsed &&
      response.status === "incomplete" &&
      response.incomplete_details?.reason === "max_output_tokens"
    ) {
      const retryLimit = Math.max(
        this.maxOutputTokens * 2,
        3200,
      );

      console.warn(
        `Evento interrompido por max_output_tokens (${this.maxOutputTokens}). Repetindo com ${retryLimit}.`,
      );

      const retry = await requestEvent(retryLimit);
      combinedUsage = addUsage(
        combinedUsage,
        responseUsage(retry.usage),
      );
      response = retry;
    }

    const latencyMs = Math.round(performance.now() - started);

    if (!response.output_parsed) {
      const reason = response.incomplete_details?.reason ?? "não informado";
      throw new Error(
        `A OpenAI não retornou evento estruturado. Status: ${response.status}. Motivo: ${reason}.`,
      );
    }

    return {
      event: AnalyzedEventSchema.parse(response.output_parsed),
      provider: "openai",
      model: this.model,
      responseId: response.id,
      usage: combinedUsage,
      latencyMs,
    };
  }

  async analyzeCameraProfile(
    input: AnalyzeCameraProfileInput,
  ): Promise<CameraProfileAnalysisResult> {
    const model =
      process.env.VISION_PROFILE_MODEL ??
      process.env.VISION_MODEL ??
      this.model;

    const started = performance.now();

    const requestProfile = (maxOutputTokens: number) =>
      this.client.responses.parse({
        model,
        store: this.store,
        max_output_tokens: maxOutputTokens,
        prompt_cache_key: `monitoria-profile-${input.cameraId}`,
        reasoning: {
          effort: "minimal",
        },
        instructions: buildCameraProfileInstructions(),
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Crie o perfil inicial usando este contexto:\n${buildCameraProfileContext(input)}`,
              },
              {
                type: "input_image",
                image_url: input.imageUrl,
                detail: this.profileDetail,
              },
            ],
          },
        ],
        text: {
          format: zodTextFormat(
            CameraProfileDraftSchema,
            "monitoria_camera_profile_draft",
          ),
        },
      });

    let response = await requestProfile(this.profileMaxOutputTokens);
    let combinedUsage = responseUsage(response.usage);

    if (
      !response.output_parsed &&
      response.status === "incomplete" &&
      response.incomplete_details?.reason === "max_output_tokens"
    ) {
      const retryLimit = Math.max(
        10000,
        this.profileMaxOutputTokens * 2,
      );

      const retry = await requestProfile(retryLimit);
      combinedUsage = addUsage(
        combinedUsage,
        responseUsage(retry.usage),
      );
      response = retry;
    }

    const latencyMs = Math.round(performance.now() - started);

    if (!response.output_parsed) {
      const reason = response.incomplete_details?.reason ?? "não informado";
      throw new Error(
        `A OpenAI não retornou perfil estruturado. Status: ${response.status}. Motivo: ${reason}.`,
      );
    }

    return {
      profile: CameraProfileDraftSchema.parse(response.output_parsed),
      provider: "openai",
      model,
      responseId: response.id,
      usage: combinedUsage,
      latencyMs,
    };
  }
}
