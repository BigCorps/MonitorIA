import { createClient } from "@/src/lib/supabase/server";
import type {
  CameraSummary,
  SiteSummary,
} from "@/src/lib/dashboard-data";

export type SearchEventRow = {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  cameraId: string;
  cameraName: string;
  siteId: string;
  siteName: string;
  headline: string;
  eventType: string;
  originalEventType: string;
  summary: string;
  confidence: number;
  requiresReview: boolean;
  reviewStatus: string;
  humanVerdict: string | null;
  humanReviewedAt: string | null;
  tags: string[];
  peopleCount: number;
  vehicleCount: number;
  interactionGroupId: string | null;
  isContinuation: boolean;
  interactionEventCount: number;
  probablePeopleCount: number;
  probableCustomerCount: number;
  probableStaffCount: number;
  continuityConfidence: number;
  thumbnailAssetId: string | null;
};

export type EventSearchInput = {
  query?: string | null;
  from?: string | null;
  to?: string | null;
  cameraId?: string | null;
  siteId?: string | null;
  eventType?: string | null;
  minConfidence?: number | null;
  reviewFilter?: string | null;
  hasPeople?: boolean | null;
  hasVehicles?: boolean | null;
  limit?: number;
  offset?: number;
};

export type EventSearchResult = {
  rows: SearchEventRow[];
  total: number;
};

export type EventObservation = {
  type: string;
  offsetSeconds: number;
  description: string;
  zoneIds: string[];
  confidence: number;
};

export type EventObject = {
  localTrackId: string | null;
  label: string;
  color: string | null;
  state: string;
  zoneIds: string[];
  confidence: number;
};

export type EventPerson = {
  id: string;
  localTrackId: string | null;
  role: string;
  roleConfidence: number;
  upperClothingColor: string | null;
  lowerClothingColor: string | null;
  accessories: string[];
  carrying: string[];
  zoneIds: string[];
  confidence: number;
};

export type EventVehicle = {
  id: string;
  localTrackId: string | null;
  type: string;
  color: string | null;
  zoneIds: string[];
  confidence: number;
};

export type EventReview = {
  id: string;
  verdict: string;
  correctedEventType: string | null;
  notes: string;
  createdAt: string;
};

export type EventAsset = {
  id: string;
  label: string;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
};

export type EventUsage = {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  estimatedCostUsd: number | null;
  metadata: Record<string, unknown>;
};

export type EventDetail = {
  id: string;
  organizationId: string;
  siteId: string;
  siteName: string;
  timezone: string;
  cameraId: string;
  cameraName: string;
  startedAt: string;
  endedAt: string;
  headline: string;
  eventType: string;
  originalEventType: string;
  summary: string;
  confidence: number;
  requiresReview: boolean;
  reviewStatus: string;
  reviewReasons: string[];
  tags: string[];
  zoneIds: string[];
  humanVerdict: string | null;
  correctedEventType: string | null;
  reviewNotes: string;
  humanReviewedAt: string | null;
  observations: EventObservation[];
  objects: EventObject[];
  people: EventPerson[];
  vehicles: EventVehicle[];
  reviews: EventReview[];
  assets: EventAsset[];
  usage: EventUsage[];
  localMetrics: Record<string, unknown>;
  model: string | null;
  analysisPlanCode: string | null;
  latencyMs: number | null;
};

export type PeriodMetrics = {
  from: string;
  timezone?: string;
  to: string;
  totalEvents: number;
  peopleEvents: number;
  vehicleEvents: number;
  reviewRequired: number;
  reviewedEvents: number;
  averageConfidence: number;
  averageDurationSeconds: number;
  byType: Record<string, number>;
  byHour: Array<{ hour: number; count: number }>;
};

export type PeriodComparison = {
  periodA: PeriodMetrics;
  periodB: PeriodMetrics;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function relationOne<T>(
  value: T | T[] | null | undefined,
): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function eventAssetLabel(path: string) {
  const filename = path.split("/").at(-1) ?? "frame";
  return filename.replace(/\.jpe?g$/i, "");
}

function mapSearchRows(data: unknown[]): SearchEventRow[] {
  return data.map((row: any) => ({
    id: String(row.id),
    startedAt: String(row.started_at),
    endedAt: String(row.ended_at),
    durationSeconds: Number(row.duration_seconds ?? 0),
    cameraId: String(row.camera_id),
    cameraName: String(row.camera_name),
    siteId: String(row.site_id),
    siteName: String(row.site_name),
    headline: String(row.headline ?? row.summary ?? "Acontecimento registrado"),
    eventType: String(row.event_type),
    originalEventType: String(row.original_event_type),
    summary: String(row.summary),
    confidence: Number(row.confidence),
    requiresReview: Boolean(row.requires_review),
    reviewStatus: String(row.review_status),
    humanVerdict: row.human_verdict
      ? String(row.human_verdict)
      : null,
    humanReviewedAt: row.human_reviewed_at
      ? String(row.human_reviewed_at)
      : null,
    tags: stringArray(row.tags),
    peopleCount: Number(row.people_count ?? 0),
    vehicleCount: Number(row.vehicle_count ?? 0),
    interactionGroupId: row.interaction_group_id
      ? String(row.interaction_group_id)
      : null,
    isContinuation: Boolean(row.is_continuation),
    interactionEventCount: Number(row.interaction_event_count ?? 1),
    probablePeopleCount: Number(row.probable_people_count ?? 0),
    probableCustomerCount: Number(row.probable_customer_count ?? 0),
    probableStaffCount: Number(row.probable_staff_count ?? 0),
    continuityConfidence: Number(row.continuity_confidence ?? 0),
    thumbnailAssetId: row.thumbnail_asset_id
      ? String(row.thumbnail_asset_id)
      : null,
  }));
}

export async function searchEvents(
  organizationId: string,
  input: EventSearchInput = {},
): Promise<EventSearchResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "search_monitoria_events",
    {
      p_organization_id: organizationId,
      p_query: input.query?.trim() || null,
      p_from: input.from ?? null,
      p_to: input.to ?? null,
      p_camera_id: input.cameraId || null,
      p_site_id: input.siteId || null,
      p_event_type: input.eventType || null,
      p_min_confidence:
        input.minConfidence === null ||
        input.minConfidence === undefined
          ? null
          : input.minConfidence,
      p_review_filter: input.reviewFilter || "all",
      p_has_people:
        input.hasPeople === undefined ? null : input.hasPeople,
      p_has_vehicles:
        input.hasVehicles === undefined
          ? null
          : input.hasVehicles,
      p_limit: Math.max(1, Math.min(input.limit ?? 50, 200)),
      p_offset: Math.max(0, input.offset ?? 0),
    },
  );

  if (error) {
    console.error("Falha na pesquisa de eventos:", error.message);
    return { rows: [], total: 0 };
  }

  const rows = mapSearchRows(data ?? []);
  return {
    rows,
    total: Number((data?.[0] as any)?.total_count ?? 0),
  };
}

export async function comparePeriods(
  organizationId: string,
  input: {
    fromA: string;
    toA: string;
    fromB: string;
    toB: string;
    cameraId?: string | null;
    siteId?: string | null;
  },
): Promise<PeriodComparison | null> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc(
    "compare_monitoria_periods",
    {
      p_organization_id: organizationId,
      p_from_a: input.fromA,
      p_to_a: input.toA,
      p_from_b: input.fromB,
      p_to_b: input.toB,
      p_camera_id: input.cameraId || null,
      p_site_id: input.siteId || null,
    },
  );

  if (error) {
    console.error("Falha ao comparar períodos:", error.message);
    return null;
  }

  const value = objectValue(data);
  return {
    periodA: objectValue(value.periodA) as unknown as PeriodMetrics,
    periodB: objectValue(value.periodB) as unknown as PeriodMetrics,
  };
}

export async function getEventDetail(
  organizationId: string,
  eventId: string,
): Promise<EventDetail | null> {
  const supabase = await createClient();

  const { data: eventRow, error: eventError } = await supabase
    .from("events")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      analysis_job_id,
      started_at,
      ended_at,
      primary_event_type,
      corrected_event_type,
      headline,
      summary,
      confidence,
      requires_review,
      review_status,
      review_reasons,
      tags,
      zone_ids,
      analyzed_payload,
      human_verdict,
      review_notes,
      human_reviewed_at,
      camera:cameras(id,name),
      site:sites(id,name,timezone),
      analysis_job:analysis_jobs(
        id,
        local_metrics,
        model,
        analysis_plan_code,
        latency_ms
      )
    `)
    .eq("organization_id", organizationId)
    .eq("id", eventId)
    .is("deleted_at", null)
    .maybeSingle();

  if (eventError || !eventRow) {
    if (eventError) {
      console.error(
        "Falha ao carregar evento:",
        eventError.message,
      );
    }
    return null;
  }

  const [
    peopleResult,
    vehiclesResult,
    reviewsResult,
    assetsResult,
    usageResult,
  ] = await Promise.all([
    supabase
      .from("event_people")
      .select(
        "id,local_track_id,role,role_confidence,upper_clothing_color,lower_clothing_color,accessories,carrying,zone_ids,confidence",
      )
      .eq("organization_id", organizationId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_vehicles")
      .select(
        "id,local_track_id,vehicle_type,color,zone_ids,confidence",
      )
      .eq("organization_id", organizationId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
    supabase
      .from("event_reviews")
      .select(
        "id,verdict,corrected_event_type,notes,created_at",
      )
      .eq("organization_id", organizationId)
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("storage_assets")
      .select(
        "id,storage_path,captured_at,width,height,byte_size",
      )
      .eq("organization_id", organizationId)
      .eq("event_id", eventId)
      .eq("status", "ready")
      .is("deleted_at", null)
      .order("captured_at", { ascending: true }),
    eventRow.analysis_job_id
      ? supabase
          .from("usage_events")
          .select(
            "model,input_tokens,cached_input_tokens,output_tokens,reasoning_tokens,estimated_cost_usd,metadata",
          )
          .eq("organization_id", organizationId)
          .eq("analysis_job_id", eventRow.analysis_job_id)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const camera = relationOne((eventRow as any).camera);
  const site = relationOne((eventRow as any).site);
  const analysisJob = relationOne(
    (eventRow as any).analysis_job,
  );
  const payload = objectValue(eventRow.analyzed_payload);

  const observations = Array.isArray(payload.observations)
    ? payload.observations.map((item) => {
        const value = objectValue(item);
        return {
          type: String(value.type ?? "other"),
          offsetSeconds: Number(value.offsetSeconds ?? 0),
          description: String(value.description ?? ""),
          zoneIds: stringArray(value.zoneIds),
          confidence: Number(value.confidence ?? 0),
        };
      })
    : [];

  const objects = Array.isArray(payload.objects)
    ? payload.objects.map((item) => {
        const value = objectValue(item);
        return {
          localTrackId: value.localTrackId
            ? String(value.localTrackId)
            : null,
          label: String(value.label ?? "objeto"),
          color: value.color ? String(value.color) : null,
          state: String(value.state ?? "unknown"),
          zoneIds: stringArray(value.zoneIds),
          confidence: Number(value.confidence ?? 0),
        };
      })
    : [];

  return {
    id: String(eventRow.id),
    organizationId: String(eventRow.organization_id),
    siteId: String(eventRow.site_id),
    siteName: String((site as any)?.name ?? "Local"),
    timezone: String(
      (site as any)?.timezone ?? "America/Sao_Paulo",
    ),
    cameraId: String(eventRow.camera_id),
    cameraName: String(
      (camera as any)?.name ?? "Câmera",
    ),
    startedAt: String(eventRow.started_at),
    endedAt: String(eventRow.ended_at),
    headline: String(eventRow.headline ?? eventRow.summary),
    eventType: String(
      eventRow.corrected_event_type ??
        eventRow.primary_event_type,
    ),
    originalEventType: String(eventRow.primary_event_type),
    summary: String(eventRow.summary),
    confidence: Number(eventRow.confidence),
    requiresReview: Boolean(eventRow.requires_review),
    reviewStatus: String(eventRow.review_status),
    reviewReasons: stringArray(eventRow.review_reasons),
    tags: stringArray(eventRow.tags),
    zoneIds: stringArray(eventRow.zone_ids),
    humanVerdict: eventRow.human_verdict
      ? String(eventRow.human_verdict)
      : null,
    correctedEventType: eventRow.corrected_event_type
      ? String(eventRow.corrected_event_type)
      : null,
    reviewNotes: String(eventRow.review_notes ?? ""),
    humanReviewedAt: eventRow.human_reviewed_at
      ? String(eventRow.human_reviewed_at)
      : null,
    observations,
    objects,
    people: (peopleResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      localTrackId: row.local_track_id
        ? String(row.local_track_id)
        : null,
      role: String(row.role ?? "unknown"),
      roleConfidence: Number(row.role_confidence ?? 0),
      upperClothingColor: row.upper_clothing_color
        ? String(row.upper_clothing_color)
        : null,
      lowerClothingColor: row.lower_clothing_color
        ? String(row.lower_clothing_color)
        : null,
      accessories: stringArray(row.accessories),
      carrying: stringArray(row.carrying),
      zoneIds: stringArray(row.zone_ids),
      confidence: Number(row.confidence),
    })),
    vehicles: (vehiclesResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      localTrackId: row.local_track_id
        ? String(row.local_track_id)
        : null,
      type: String(row.vehicle_type),
      color: row.color ? String(row.color) : null,
      zoneIds: stringArray(row.zone_ids),
      confidence: Number(row.confidence),
    })),
    reviews: (reviewsResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      verdict: String(row.verdict),
      correctedEventType: row.corrected_event_type
        ? String(row.corrected_event_type)
        : null,
      notes: String(row.notes ?? ""),
      createdAt: String(row.created_at),
    })),
    assets: (assetsResult.data ?? []).map((row: any) => ({
      id: String(row.id),
      label: eventAssetLabel(String(row.storage_path)),
      capturedAt: row.captured_at
        ? String(row.captured_at)
        : null,
      width: row.width === null ? null : Number(row.width),
      height: row.height === null ? null : Number(row.height),
      byteSize:
        row.byte_size === null ? null : Number(row.byte_size),
    })),
    usage: (usageResult.data ?? []).map((row: any) => ({
      model: String(row.model),
      inputTokens: Number(row.input_tokens ?? 0),
      cachedInputTokens: Number(
        row.cached_input_tokens ?? 0,
      ),
      outputTokens: Number(row.output_tokens ?? 0),
      reasoningTokens: Number(row.reasoning_tokens ?? 0),
      estimatedCostUsd:
        row.estimated_cost_usd === null
          ? null
          : Number(row.estimated_cost_usd),
      metadata: objectValue(row.metadata),
    })),
    localMetrics: objectValue(
      (analysisJob as any)?.local_metrics,
    ),
    model: (analysisJob as any)?.model
      ? String((analysisJob as any).model)
      : null,
    analysisPlanCode: (analysisJob as any)
      ?.analysis_plan_code
      ? String((analysisJob as any).analysis_plan_code)
      : null,
    latencyMs:
      (analysisJob as any)?.latency_ms === null ||
      (analysisJob as any)?.latency_ms === undefined
        ? null
        : Number((analysisJob as any).latency_ms),
  };
}

export function addDaysToDateOnly(
  value: string,
  days: number,
) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function dateOnlyToIso(
  value: string | null | undefined,
  timeZone: string,
) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const localMidnightAsUtc = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0),
  );

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(localMidnightAsUtc);

  const part = (type: string) =>
    Number(
      parts.find((item) => item.type === type)?.value ?? 0,
    );

  const representedAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
    part("second"),
  );

  const offsetMs =
    representedAsUtc - localMidnightAsUtc.getTime();

  return new Date(
    localMidnightAsUtc.getTime() - offsetMs,
  ).toISOString();
}

export function siteTimezone(
  sites: SiteSummary[],
  siteId?: string | null,
) {
  return (
    sites.find((site) => site.id === siteId)?.timezone ??
    sites[0]?.timezone ??
    "America/Sao_Paulo"
  );
}

export type EventSearchFacets = {
  cameras: CameraSummary[];
  sites: SiteSummary[];
};
