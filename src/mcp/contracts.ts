import * as z from "zod-v4";

const UuidSchema = z.string().uuid();
const IsoSchema = z.string().datetime({ offset: true });

export const OrganizationScopeSchema = z.object({
  organization_id: UuidSchema.optional().describe(
    "Organização MonitorIA. Pode ser omitida quando o usuário autorizou apenas uma organização.",
  ),
});

export const DateRangeSchema = z.object({
  from: IsoSchema.optional().describe(
    "Início inclusivo em ISO 8601. O padrão é as últimas 24 horas.",
  ),
  to: IsoSchema.optional().describe(
    "Fim exclusivo em ISO 8601. O padrão é o momento atual.",
  ),
});

export const FilterScopeSchema = OrganizationScopeSchema.extend({
  site_id: UuidSchema.optional(),
  camera_id: UuidSchema.optional(),
});

export const GetCapabilitiesInputSchema = OrganizationScopeSchema;

export const ListSitesInputSchema = OrganizationScopeSchema.extend({
  limit: z.number().int().min(1).max(100).default(100),
});

export const ListCamerasInputSchema = OrganizationScopeSchema.extend({
  site_id: UuidSchema.optional(),
  status: z.string().trim().min(1).max(40).optional(),
  limit: z.number().int().min(1).max(100).default(100),
});

export const GetCameraOverviewInputSchema = OrganizationScopeSchema.extend({
  camera_id: UuidSchema,
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
  include: z.array(z.string().trim().min(1).max(60)).max(30).default([
    "latest_event",
    "visual_states",
    "operating_hours",
    "sessions",
    "continuity",
    "vehicles",
    "insights",
  ]),
});

export const SearchEventsInputSchema = FilterScopeSchema.extend({
  query: z.string().trim().max(300).optional(),
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
  event_type: z.string().trim().max(80).optional(),
  review_filter: z.string().trim().max(40).default("all"),
  min_confidence: z.number().min(0).max(1).optional(),
  has_people: z.boolean().optional(),
  has_vehicles: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
});

export const GetEventDetailsInputSchema = OrganizationScopeSchema.extend({
  event_id: UuidSchema,
  include_evidence: z.boolean().default(false),
});

export const SearchSessionsInputSchema = FilterScopeSchema.extend({
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
  session_type: z.string().trim().max(80).optional(),
  status: z.string().trim().max(40).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
});

export const GetSessionDetailsInputSchema = OrganizationScopeSchema.extend({
  session_id: UuidSchema,
  include_evidence: z.boolean().default(false),
});

export const GetVisualStateInputSchema = FilterScopeSchema.extend({
  entity_id: UuidSchema.optional(),
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
});

export const GetRoutineSummaryInputSchema = FilterScopeSchema.extend({
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
});

export const GetProcessSummaryInputSchema = FilterScopeSchema.extend({
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
});

export const GetOperationPatternsInputSchema = FilterScopeSchema;

export const GetOperationalSummaryInputSchema = FilterScopeSchema.extend({
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
  include: z.array(z.string().trim().min(1).max(60)).max(40).default([
    "events",
    "sessions",
    "states",
    "operating_hours",
    "people",
    "vehicles",
    "insights",
  ]),
  include_evidence: z.boolean().default(false),
});

export const ComparePeriodsInputSchema = FilterScopeSchema.extend({
  from_a: IsoSchema,
  to_a: IsoSchema,
  from_b: IsoSchema,
  to_b: IsoSchema,
  include: z.array(z.string().trim().min(1).max(60)).max(40).default([
    "events",
    "sessions",
    "insights",
  ]),
});

export const GetEvidenceInputSchema = OrganizationScopeSchema.extend({
  event_id: UuidSchema.optional(),
  session_id: UuidSchema.optional(),
  asset_ids: z.array(UuidSchema).max(12).optional(),
  limit: z.number().int().min(1).max(12).default(6),
}).refine(
  (value: { event_id?: string; session_id?: string; asset_ids?: string[] }) =>
    Boolean(value.event_id) ||
    Boolean(value.session_id) ||
    Boolean(value.asset_ids?.length),
  "Informe event_id, session_id ou asset_ids.",
);

export const SearchInsightsInputSchema = FilterScopeSchema.extend({
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
  insight_types: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  severity: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  status: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  query: z.string().trim().max(300).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
});

export const AskMonitoriaInputSchema = FilterScopeSchema.extend({
  question: z.string().trim().min(3).max(1200),
  from: IsoSchema.optional(),
  to: IsoSchema.optional(),
  include_evidence: z.boolean().default(false),
});

export type McpResponseEnvelope = {
  schema_version: string;
  toolset_version: string;
  generated_at: string;
  organization_id: string | null;
  timezone: string | null;
  data: Record<string, unknown>;
  capabilities: Record<string, unknown>;
  limitations: string[];
  evidence: Array<Record<string, unknown>>;
  pagination: Record<string, unknown> | null;
};
