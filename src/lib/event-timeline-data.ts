import { createClient } from "@/src/lib/supabase/server";
import type { SearchEventRow } from "@/src/lib/event-search-data";

export type TimelineSearchRow = SearchEventRow & {
  rowKind: "event" | "analysis";
  analysisJobId: string;
  processingStatus: string;
  processingError: string | null;
};

export type TimelineSearchInput = {
  from?: string | null;
  to?: string | null;
  cameraIds?: string[];
  siteId?: string | null;
  eventType?: string | null;
  reviewFilter?: string | null;
  limit?: number;
  offset?: number;
};

export type TimelineSearchResult = {
  rows: TimelineSearchRow[];
  total: number;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function nullableString(value: unknown) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function mapRow(row: any): TimelineSearchRow {
  return {
    rowKind: row.row_kind === "analysis" ? "analysis" : "event",
    analysisJobId: String(row.analysis_job_id),
    processingStatus: String(row.processing_status ?? "completed"),
    processingError: nullableString(row.last_error),
    id: String(row.row_id),
    startedAt: String(row.started_at),
    endedAt: String(row.ended_at),
    durationSeconds: Number(row.duration_seconds ?? 0),
    cameraId: String(row.camera_id),
    cameraName: String(row.camera_name),
    siteId: String(row.site_id),
    siteName: String(row.site_name),
    headline: String(row.headline ?? "Acontecimento registrado"),
    eventType: String(row.event_type ?? "processing"),
    originalEventType: String(row.original_event_type ?? row.event_type ?? "processing"),
    summary: String(row.summary ?? ""),
    confidence: Number(row.confidence ?? 0),
    requiresReview: Boolean(row.requires_review),
    reviewStatus: String(row.review_status ?? "processing"),
    humanVerdict: nullableString(row.human_verdict),
    humanReviewedAt: nullableString(row.human_reviewed_at),
    tags: stringArray(row.tags),
    peopleCount: Number(row.people_count ?? 0),
    vehicleCount: Number(row.vehicle_count ?? 0),
    interactionGroupId: nullableString(row.interaction_group_id),
    isContinuation: Boolean(row.is_continuation),
    interactionEventCount: Number(row.interaction_event_count ?? 0),
    probablePeopleCount: Number(row.probable_people_count ?? 0),
    probableCustomerCount: Number(row.probable_customer_count ?? 0),
    probableStaffCount: Number(row.probable_staff_count ?? 0),
    continuityConfidence: Number(row.continuity_confidence ?? 0),
    operationalSessionId: nullableString(row.operational_session_id),
    sessionType: nullableString(row.session_type),
    sessionStatus: nullableString(row.session_status),
    sessionChapterType: nullableString(row.session_chapter_type),
    sessionChapterOrder: row.session_chapter_order == null ? null : Number(row.session_chapter_order),
    sessionChapterCount: Number(row.session_chapter_count ?? 0),
    sessionDurationSeconds: Number(row.session_duration_seconds ?? 0),
    sessionConfidence: Number(row.session_confidence ?? 0),
    thumbnailAssetId: nullableString(row.thumbnail_asset_id),
  };
}

/** Uma chamada paginada para qualquer quantidade de câmeras selecionadas. */
export async function searchEventTimeline(
  organizationId: string,
  input: TimelineSearchInput = {},
): Promise<TimelineSearchResult> {
  const supabase = await createClient();
  const cameraIds = (input.cameraIds ?? []).filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  const { data, error } = await supabase.rpc("search_monitoria_timeline_v2", {
    p_organization_id: organizationId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_camera_ids: cameraIds.length ? cameraIds : null,
    p_site_id: input.siteId || null,
    p_event_type: input.eventType || null,
    p_review_filter: input.reviewFilter || "all",
    p_limit: Math.max(1, Math.min(input.limit ?? 24, 200)),
    p_offset: Math.max(0, input.offset ?? 0),
  });

  if (error) {
    console.error("Falha na timeline paginada 1.0.2:", error.message);
    return { rows: [], total: 0 };
  }

  const rows = (data ?? []).map(mapRow);
  return {
    rows,
    total: Number((data?.[0] as any)?.total_count ?? 0),
  };
}
