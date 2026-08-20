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

export type RoutineScheduleException = {
  date: string;
  closed: boolean;
  openMinute: number | null;
  closeMinute: number | null;
};

export type RoutineDeclaredSchedule = {
  configured: boolean;
  workingDays: number[];
  openMinute: number | null;
  closeMinute: number | null;
  exceptions: RoutineScheduleException[];
};

export type RoutineCameraDashboard = {
  id: string;
  name: string;
  siteId: string;
  siteName: string;
  timezone: string;
  sensitivity: string;
  graceMinutes: number;
  declaredSchedule: RoutineDeclaredSchedule;
  learnedOpen: RoutineBaseline | null;
  learnedClose: RoutineBaseline | null;
  today: {
    localDate: string;
    dayOfWeek: number;
    observedOpenAt: string | null;
    observedCloseAt: string | null;
  };
};

export type RoutineDashboardOverview = RoutineOverview & {
  cameras: RoutineCameraDashboard[];
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

function localDate(value: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function localDayOfWeek(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(typeof value === "string" ? new Date(value) : value);

  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts);
}

function managedScheduleMetadata(value: unknown) {
  const metadata = objectValue(value);
  return metadata.managedBy === "dashboard_production_v1";
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
    title: String(row.title ?? "Mudança observada"),
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

function buildDeclaredSchedule(rows: any[]): RoutineDeclaredSchedule {
  const managed = rows.filter(
    (row) =>
      row.source === "user" &&
      row.status === "active" &&
      managedScheduleMetadata(row.metadata),
  );

  if (!managed.length) {
    return {
      configured: false,
      workingDays: [],
      openMinute: null,
      closeMinute: null,
      exceptions: [],
    };
  }

  const weeklyOpen = managed.filter(
    (row) =>
      row.expectation_code === "declared_open_minute" &&
      row.valid_from === null &&
      row.valid_until === null,
  );
  const weeklyClose = managed.filter(
    (row) =>
      row.expectation_code === "declared_close_minute" &&
      row.valid_from === null &&
      row.valid_until === null,
  );

  const workingDays = [
    ...new Set(weeklyOpen.map((row) => Number(row.day_of_week))),
  ]
    .filter((day) => day >= 0 && day <= 6)
    .sort((a, b) => a - b);

  const dates = [
    ...new Set(
      managed
        .filter(
          (row) =>
            row.valid_from &&
            row.valid_until &&
            row.valid_from === row.valid_until,
        )
        .map((row) => String(row.valid_from)),
    ),
  ].sort();

  const exceptions: RoutineScheduleException[] = dates.map((date) => {
    const dateRows = managed.filter(
      (row) => row.valid_from === date && row.valid_until === date,
    );
    const closed = dateRows.some(
      (row) => row.expectation_code === "declared_closed_day",
    );
    const open = dateRows.find(
      (row) => row.expectation_code === "declared_open_minute",
    );
    const close = dateRows.find(
      (row) => row.expectation_code === "declared_close_minute",
    );

    return {
      date,
      closed,
      openMinute: open ? Number(open.expected_center) : null,
      closeMinute: close ? Number(close.expected_center) % 1440 : null,
    };
  });

  return {
    configured: true,
    workingDays,
    openMinute: weeklyOpen[0] ? Number(weeklyOpen[0].expected_center) : null,
    closeMinute: weeklyClose[0]
      ? Number(weeklyClose[0].expected_center) % 1440
      : null,
    exceptions,
  };
}

export async function getRoutineOverview(
  organizationId: string,
  input: RoutineOverviewInput = {},
): Promise<RoutineDashboardOverview> {
  const supabase = await createClient();
  const limit = Math.max(1, Math.min(input.limit ?? 100, 250));

  let cameraQuery = supabase
    .from("cameras")
    .select(`
      id,
      site_id,
      name,
      routine_deviation_sensitivity,
      routine_grace_minutes,
      site:sites(name,timezone)
    `)
    .eq("organization_id", organizationId)
    .eq("routine_intelligence_enabled", true)
    .order("created_at", { ascending: true });

  if (input.cameraId) cameraQuery = cameraQuery.eq("id", input.cameraId);
  if (input.siteId) cameraQuery = cameraQuery.eq("site_id", input.siteId);

  const cameraResult = await cameraQuery;
  if (cameraResult.error) {
    console.error(
      "Falha ao carregar câmeras das rotinas:",
      cameraResult.error.message,
    );
  }

  const cameraRows = cameraResult.data ?? [];
  const cameraIds = cameraRows.map((row: any) => String(row.id));

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

  if (input.cameraId) baselineQuery = baselineQuery.eq("camera_id", input.cameraId);
  if (input.siteId) baselineQuery = baselineQuery.eq("site_id", input.siteId);
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
  if (input.cameraId) deviationQuery = deviationQuery.eq("camera_id", input.cameraId);
  if (input.siteId) deviationQuery = deviationQuery.eq("site_id", input.siteId);
  if (input.severity && input.severity !== "all") {
    deviationQuery = deviationQuery.eq("severity", input.severity);
  }
  if (input.status && input.status !== "all") {
    deviationQuery = deviationQuery.eq("status", input.status);
  }

  let expectationQuery = supabase
    .from("operational_expectations")
    .select(`
      id,
      camera_id,
      expectation_key,
      expectation_code,
      source,
      status,
      day_of_week,
      expected_center,
      valid_from,
      valid_until,
      metadata
    `)
    .eq("organization_id", organizationId)
    .eq("source", "user");

  if (cameraIds.length) {
    expectationQuery = expectationQuery.in("camera_id", cameraIds);
  } else {
    expectationQuery = expectationQuery.limit(0);
  }

  let operatingQuery = supabase
    .from("site_operating_sessions")
    .select(
      "id,camera_id,first_open_observed_at,closed_at,opening_event_id,closing_event_id",
    )
    .eq("organization_id", organizationId)
    .gte(
      "first_open_observed_at",
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    )
    .order("first_open_observed_at", { ascending: false });

  if (cameraIds.length) {
    operatingQuery = operatingQuery.in("camera_id", cameraIds);
  } else {
    operatingQuery = operatingQuery.limit(0);
  }

  const [
    baselineResult,
    deviationResult,
    expectationResult,
    operatingResult,
  ] = await Promise.all([
    baselineQuery,
    deviationQuery,
    expectationQuery,
    operatingQuery,
  ]);

  if (baselineResult.error) {
    console.error(
      "Falha ao carregar padrões de rotina:",
      baselineResult.error.message,
    );
  }
  if (deviationResult.error) {
    console.error(
      "Falha ao carregar mudanças de rotina:",
      deviationResult.error.message,
    );
  }
  if (expectationResult.error) {
    console.error(
      "Falha ao carregar horários informados:",
      expectationResult.error.message,
    );
  }
  if (operatingResult.error) {
    console.error(
      "Falha ao carregar funcionamento observado:",
      operatingResult.error.message,
    );
  }

  const baselines = (baselineResult.data ?? []).map(mapBaseline);
  const deviations = (deviationResult.data ?? []).map(mapDeviation);
  const expectationRows = expectationResult.data ?? [];
  const operatingRows = operatingResult.data ?? [];
  const now = new Date();

  const cameras: RoutineCameraDashboard[] = cameraRows.map((row: any) => {
    const site = relationOne<{ name?: string; timezone?: string }>(row.site);
    const timezone = String(site?.timezone ?? "America/Sao_Paulo");
    const todayDate = localDate(now, timezone);
    const todayDow = localDayOfWeek(now, timezone);
    const declaredRows = expectationRows.filter(
      (expectation: any) => String(expectation.camera_id) === String(row.id),
    );
    const declaredSchedule = buildDeclaredSchedule(declaredRows);

    const learnedOpen =
      baselines.find(
        (baseline) =>
          baseline.cameraId === String(row.id) &&
          baseline.baselineCode === "operating_open_minute" &&
          baseline.status === "active",
      ) ??
      baselines.find(
        (baseline) =>
          baseline.cameraId === String(row.id) &&
          baseline.baselineCode === "operating_open_minute",
      ) ??
      null;

    const learnedClose =
      baselines.find(
        (baseline) =>
          baseline.cameraId === String(row.id) &&
          baseline.baselineCode === "operating_close_minute" &&
          baseline.status === "active",
      ) ??
      baselines.find(
        (baseline) =>
          baseline.cameraId === String(row.id) &&
          baseline.baselineCode === "operating_close_minute",
      ) ??
      null;

    const todayOperating = operatingRows.find(
      (operating: any) =>
        String(operating.camera_id) === String(row.id) &&
        localDate(String(operating.first_open_observed_at), timezone) === todayDate,
    );

    return {
      id: String(row.id),
      name: String(row.name),
      siteId: String(row.site_id),
      siteName: String(site?.name ?? "Local"),
      timezone,
      sensitivity: String(row.routine_deviation_sensitivity ?? "balanced"),
      graceMinutes: Number(row.routine_grace_minutes ?? 15),
      declaredSchedule,
      learnedOpen,
      learnedClose,
      today: {
        localDate: todayDate,
        dayOfWeek: todayDow,
        observedOpenAt: todayOperating?.first_open_observed_at
          ? String(todayOperating.first_open_observed_at)
          : null,
        observedCloseAt: todayOperating?.closed_at
          ? String(todayOperating.closed_at)
          : null,
      },
    };
  });

  return {
    baselines,
    deviations,
    cameras,
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
