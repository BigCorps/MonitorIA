import { z } from "zod";

export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/);

export const AssistantPlanSchema = z
  .object({
    intent: z.enum([
      "operating_hours",
      "visual_state",
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
    wantsChart: z.boolean(),
    chartType: z.enum(["bar", "line"]).nullable(),
    chartMetric: z
      .enum([
        "events_by_hour",
        "roles",
        "event_types",
        "summary_metrics",
      ])
      .nullable(),
  })
  .strict();


export const AssistantChartSpecSchema = z
  .object({
    type: z.enum(["bar", "line"]),
    title: z.string().trim().min(1).max(140),
    xLabel: z.string().trim().max(80).nullable(),
    yLabel: z.string().trim().max(80).nullable(),
    labels: z.array(z.string().trim().min(1).max(40)).min(1).max(24),
    series: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(80),
            values: z.array(z.number().finite().min(0)).min(1).max(24),
          })
          .strict(),
      )
      .min(1)
      .max(7),
    note: z.string().trim().max(400).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, series] of value.series.entries()) {
      if (series.values.length !== value.labels.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["series", index, "values"],
          message: "A série deve ter a mesma quantidade de valores e rótulos.",
        });
      }
    }
  });

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

export type AssistantChartSpec = z.infer<
  typeof AssistantChartSpecSchema
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
