import { z } from "zod";

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const AssistantPlanSchema = z
  .object({
    intent: z.enum([
      "period_summary",
      "search_events",
      "compare_periods",
      "general_help",
    ]),
    query: z.string().trim().max(240),
    fromDate: DateOnlySchema.nullable(),
    toDate: DateOnlySchema.nullable(),
    compareFromDate: DateOnlySchema.nullable(),
    compareToDate: DateOnlySchema.nullable(),
    cameraId: z.string().uuid().nullable(),
    siteId: z.string().uuid().nullable(),
    evidenceLimit: z.number().int().min(1).max(12),
  })
  .strict();

export const AssistantAnswerSchema = z
  .object({
    answer: z.string().trim().min(1).max(5000),
    caution: z.string().trim().max(600).nullable(),
    evidenceEventIds: z.array(z.string().uuid()).max(12),
    periodLabel: z.string().trim().max(160).nullable(),
    suggestions: z
      .array(z.string().trim().min(1).max(160))
      .max(3),
  })
  .strict();

export type AssistantPlan = z.infer<
  typeof AssistantPlanSchema
>;

export type AssistantAnswer = z.infer<
  typeof AssistantAnswerSchema
>;

export type AssistantUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export type AssistantDirectory = {
  sites: Array<{
    id: string;
    name: string;
    timezone: string;
  }>;
  cameras: Array<{
    id: string;
    name: string;
    siteId: string;
  }>;
};

export type AssistantHistoryItem = {
  role: "user" | "assistant";
  content: string;
};
