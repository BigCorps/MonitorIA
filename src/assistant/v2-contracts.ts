import { z } from "zod";
import {
  AssistantPlanSchema,
  type AssistantDirectory,
  type AssistantHistoryItem,
  type AssistantPlan,
} from "./contracts";

export const AssistantOperationSchema = z.object({
  id: z.string().trim().min(1).max(40),
  kind: z.enum([
    "period_summary",
    "search_events",
    "compare_periods",
    "routine_deviation",
    "operating_hours",
    "camera_health_current",
    "camera_health_history",
    "cross_camera_sequence",
    "visual_state",
    "interactions",
    "continuity_people",
    "continuity_vehicles",
    "staff_activity",
    "queue_analysis",
    "process_summary",
    "attention_summary",
  ]),
  aggregation: z.enum([
    "summary",
    "count",
    "rank",
    "peak",
    "average",
    "first",
    "last",
    "compare",
    "list",
    "exists",
    "duration",
  ]),
  metric: z.enum([
    "events",
    "customers",
    "staff",
    "deliveries",
    "vehicles",
    "objects",
    "camera_health",
    "routine",
    "attention",
    "processes",
    "none",
  ]),
  subject: z.string().trim().max(120).nullable(),
  cameraId: z.string().uuid().nullable(),
  siteId: z.string().uuid().nullable(),
  fromCameraId: z.string().uuid().nullable(),
  toCameraId: z.string().uuid().nullable(),
  zoneId: z.string().uuid().nullable(),
  visualEntityId: z.string().uuid().nullable(),
  processId: z.string().uuid().nullable(),
  eventTypes: z.array(z.string().trim().min(1).max(80)).max(8),
  apparentAgeGroup: z
    .enum(["child", "adult"])
    .nullable()
    .default(null),
  afterConfirmedClosing: z.boolean().nullable(),
}).strict();

export const AssistantPlanV2Schema = z.object({
  version: z.literal(2),
  legacyPlan: AssistantPlanSchema,
  operations: z.array(AssistantOperationSchema).min(1).max(6),
  plannerNotes: z.array(z.string().trim().min(1).max(160)).max(8),
}).strict();

export type AssistantOperation = z.infer<typeof AssistantOperationSchema>;
export type AssistantPlanV2 = z.infer<typeof AssistantPlanV2Schema>;

export type AssistantDirectoryV2 = AssistantDirectory & {
  zones: Array<{
    id: string;
    name: string;
    cameraId: string;
    siteId: string;
    zoneType: string;
    description: string;
    personRoleHint: string | null;
  }>;
  visualEntities: Array<{
    id: string;
    name: string;
    cameraId: string;
    siteId: string;
    entityType: string;
    aliases: string[];
    enabled: boolean;
    reliability: string;
  }>;
  processes: Array<{
    id: string;
    name: string;
    processCode: string;
    cameraId: string | null;
    siteId: string;
    description: string;
    sessionType: string;
    aliases: string[];
  }>;
};

export type AssistantHistoryItemV2 = AssistantHistoryItem & {
  plan?: AssistantPlanV2 | AssistantPlan | null;
};

export type AssistantExecutionResult = {
  retrievedData: Record<string, unknown>;
  candidateEvidenceIds: string[];
  coverage: Record<string, unknown> | null;
};
