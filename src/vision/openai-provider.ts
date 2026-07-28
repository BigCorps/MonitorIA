import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AnalyzedEventSchema,
  AnalyzedEventTransportSchema,
} from "../contracts/analyzed-event";
import { CameraProfileDraftSchema } from "../contracts/camera-profile-draft";
import { buildVisionContext, buildVisionInstructions } from "./prompt";
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
        output_tokens?: number;
        total_tokens?: number;
      }
    | null
    | undefined,
): VisionUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

function addUsage(left: VisionUsage, right: VisionUsage): VisionUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
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

    this.model = options.model ?? process.env.VISION_MODEL ?? "gpt-5-mini";

    this.detail =
      options.detail ??
      (process.env.VISION_DETAIL as VisionImageDetail | undefined) ??
      "low";

    this.profileDetail =
      options.profileDetail ??
      (process.env.VISION_PROFILE_DETAIL as VisionImageDetail | undefined) ??
      "high";

    this.maxOutputTokens = positiveInteger(
      options.maxOutputTokens ?? process.env.VISION_MAX_OUTPUT_TOKENS,
      700,
    );

    // Um perfil contém descrição, listas e polígonos. Mantemos um piso seguro
    // mesmo quando a Vercel ainda possui o valor antigo de 1.600 tokens.
    this.profileMaxOutputTokens = Math.max(
      5_000,
      positiveInteger(
        options.profileMaxOutputTokens ??
          process.env.VISION_PROFILE_MAX_OUTPUT_TOKENS,
        5_000,
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
      const reason = response.incomplete_details?.reason ?? "não informado";
      throw new Error(
        `A OpenAI não retornou evento estruturado. Status: ${response.status}. Motivo: ${reason}.`,
      );
    }

    const event = AnalyzedEventSchema.parse(response.output_parsed);

    return {
      event,
      provider: "openai",
      model: this.model,
      responseId: response.id,
      usage: responseUsage(response.usage),
      latencyMs,
    };
  }

  async analyzeCameraProfile(
    input: AnalyzeCameraProfileInput,
  ): Promise<CameraProfileAnalysisResult> {
    const started = performance.now();

    const requestProfile = (maxOutputTokens: number) =>
      this.client.responses.parse({
        model: this.model,
        store: this.store,
        max_output_tokens: maxOutputTokens,

        // GPT-5 mini é um modelo de raciocínio. Para esta tarefa visual
        // estruturada, esforço mínimo reduz latência e evita consumir o limite
        // antes de terminar o JSON.
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

    const firstIncompleteReason = response.incomplete_details?.reason;

    if (
      !response.output_parsed &&
      response.status === "incomplete" &&
      firstIncompleteReason === "max_output_tokens"
    ) {
      const retryMaxOutputTokens = Math.max(
        10_000,
        this.profileMaxOutputTokens * 2,
      );

      console.warn(
        `Perfil interrompido por max_output_tokens (${this.profileMaxOutputTokens}). Repetindo com ${retryMaxOutputTokens}.`,
      );

      const retryResponse = await requestProfile(retryMaxOutputTokens);
      combinedUsage = addUsage(
        combinedUsage,
        responseUsage(retryResponse.usage),
      );
      response = retryResponse;
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
      model: this.model,
      responseId: response.id,
      usage: combinedUsage,
      latencyMs,
    };
  }
}
