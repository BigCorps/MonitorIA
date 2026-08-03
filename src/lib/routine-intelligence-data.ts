import type {
  OperationalDeviation,
  RoutineBaseline,
  RoutineOverview,
  RoutineUnit,
} from "@/src/contracts/routine-intelligence";
import { createClient } from "@/src/lib/supabase/server";

export type RoutineOverviewInput = {
  from?: string | null;
  to?: string | null;
  cameraId?: string | null;
  siteId?: string | null;
  severity?: string | null;
  status?: string | null;
  baselineStatus?: string | null;
  limit?: number;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item)).filter(Boolean)
    : [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapBaseline(row: any): RoutineBaseline {
  const camera = relationOne<{ name?: string }>(row.camera);

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    siteId: String(row.site_id),
    cameraId: String(row.camera_id),
    cameraName: String(camera?.name ?? "Câmera"),
    baselineCode: String(row.baseline_code) as RoutineBaseline["baselineCode"],
    dayOfWeek: Number(row.day_of_week ?? -1),
    bucketHour: Number(row.bucket_hour ?? -1),
    sessionType: String(row.session_type ?? ""),
    status: String(row.status ?? "learning") as RoutineBaseline["status"],
    sampleCount: Number(row.sample_count ?? 0),
    dayCount: Number(row.day_count ?? 0),
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    windowDays: Number(row.window_days ?? 0),
    centerValue: Number(row.center_value ?? 0),
    lowerValue: Number(row.lower_value ?? 0),
    upperValue: Number(row.upper_value ?? 0),
    spreadValue: Number(row.spread_value ?? 0),
    unit: String(row.unit ?? "count") as RoutineUnit,
    confidence: Number(row.confidence ?? 0),
    confirmedAt: row.confirmed_at ? String(row.confirmed_at) : null,
  };
}

function mapDeviation(row: any): OperationalDeviation {
  const camera = relationOne<{ name?: string }>(row.camera);

  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    siteId: String(row.site_id),
    cameraId: String(row.camera_id),
    cameraName: String(camera?.name ?? "Câmera"),
    localDate: String(row.local_date),
    deviationCode: String(
      row.deviation_code,
    ) as OperationalDeviation["deviationCode"],
    status: String(row.status ?? "active") as OperationalDeviation["status"],
    severity: String(row.severity ?? "low") as OperationalDeviation["severity"],
    title: String(row.title ?? "Desvio observado"),
    summary: String(row.summary ?? ""),
    observedValue:
      row.observed_value === null || row.observed_value === undefined
        ? null
        : Number(row.observed_value),
    expectedLower:
      row.expected_lower === null || row.expected_lower === undefined
        ? null
        : Number(row.expected_lower),
    expectedCenter:
      row.expected_center === null || row.expected_center === undefined
        ? null
        : Number(row.expected_center),
    expectedUpper:
      row.expected_upper === null || row.expected_upper === undefined
        ? null
        : Number(row.expected_upper),
    deviationAmount:
      row.deviation_amount === null || row.deviation_amount === undefined
        ? null
        : Number(row.deviation_amount),
    unit: row.unit ? (String(row.unit) as RoutineUnit) : null,
    confidence: Number(row.confidence ?? 0),
    observedAt: String(row.observed_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    evidenceEventIds: stringArray(row.evidence_event_ids),
    data: objectValue(row.data),
  };
}

export async function getRoutineOverview(
  organizationId: string,
  input: RoutineOverviewInput = {},
): Promise<RoutineOverview> {
  const supabase = await createClient();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));

  let baselineQuery = supabase
    .from("camera_behavior_baselines")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      baseline_code,
      day_of_week,
      bucket_hour,
      session_type,
      status,
      sample_count,
      day_count,
      period_start,
      period_end,
      window_days,
      center_value,
      lower_value,
      upper_value,
      spread_value,
      unit,
      confidence,
      confirmed_at,
      camera:cameras(name)
    `)
    .eq("organization_id", organizationId)
    .eq("day_of_week", -1)
    .order("status", { ascending: true })
    .order("confidence", { ascending: false })
    .limit(limit);

  if (input.cameraId) {
    baselineQuery = baselineQuery.eq("camera_id", input.cameraId);
  }
  if (input.siteId) {
    baselineQuery = baselineQuery.eq("site_id", input.siteId);
  }
  if (input.baselineStatus && input.baselineStatus !== "all") {
    baselineQuery = baselineQuery.eq("status", input.baselineStatus);
  } else {
    baselineQuery = baselineQuery.in("status", ["active", "learning", "stale"]);
  }

  let deviationQuery = supabase
    .from("operational_deviations")
    .select(`
      id,
      organization_id,
      site_id,
      camera_id,
      local_date,
      deviation_code,
      status,
      severity,
      title,
      summary,
      observed_value,
      expected_lower,
      expected_center,
      expected_upper,
      deviation_amount,
      unit,
      confidence,
      observed_at,
      resolved_at,
      evidence_event_ids,
      data,
      camera:cameras(name)
    `)
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(limit);

  if (input.from) deviationQuery = deviationQuery.gte("observed_at", input.from);
  if (input.to) deviationQuery = deviationQuery.lt("observed_at", input.to);
  if (input.cameraId) {
    deviationQuery = deviationQuery.eq("camera_id", input.cameraId);
  }
  if (input.siteId) {
    deviationQuery = deviationQuery.eq("site_id", input.siteId);
  }
  if (input.severity && input.severity !== "all") {
    deviationQuery = deviationQuery.eq("severity", input.severity);
  }
  if (input.status && input.status !== "all") {
    deviationQuery = deviationQuery.eq("status", input.status);
  }

  const [baselineResult, deviationResult] = await Promise.all([
    baselineQuery,
    deviationQuery,
  ]);

  if (baselineResult.error) {
    console.error(
      "Falha ao carregar baselines de rotina:",
      baselineResult.error.message,
    );
  }
  if (deviationResult.error) {
    console.error(
      "Falha ao carregar desvios operacionais:",
      deviationResult.error.message,
    );
  }

  const baselines = (baselineResult.data ?? []).map(mapBaseline);
  const deviations = (deviationResult.data ?? []).map(mapDeviation);

  return {
    baselines,
    deviations,
    summary: {
      activeBaselines: baselines.filter((item) => item.status === "active")
        .length,
      learningBaselines: baselines.filter(
        (item) => item.status === "learning",
      ).length,
      staleBaselines: baselines.filter((item) => item.status === "stale")
        .length,
      activeDeviations: deviations.filter((item) => item.status === "active")
        .length,
      importantDeviations: deviations.filter(
        (item) =>
          item.status === "active" &&
          (item.severity === "high" || item.severity === "critical"),
      ).length,
    },
  };
}
