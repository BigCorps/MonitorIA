export const ROUTINE_BASELINE_CODES = [
  "operating_open_minute",
  "operating_close_minute",
  "operating_duration_minutes",
  "first_activity_delay_minutes",
  "last_activity_lead_minutes",
  "daily_session_count",
  "hourly_session_count",
  "session_duration_seconds",
  "after_close_event_count",
] as const;

export type RoutineBaselineCode =
  (typeof ROUTINE_BASELINE_CODES)[number];

export const OPERATIONAL_DEVIATION_CODES = [
  "opening_early",
  "opening_late",
  "opening_not_observed",
  "closing_early",
  "closing_late",
  "closing_not_observed",
  "first_activity_late",
  "activity_after_closing",
  "session_duration_high",
  "activity_volume_low",
  "activity_volume_high",
] as const;

export type OperationalDeviationCode =
  (typeof OPERATIONAL_DEVIATION_CODES)[number];

export type RoutineBaselineStatus =
  | "learning"
  | "active"
  | "stale"
  | "disabled";

export type OperationalDeviationStatus =
  | "active"
  | "resolved"
  | "dismissed"
  | "informational";

export type OperationalSeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type RoutineUnit =
  | "minute_of_day"
  | "minutes"
  | "seconds"
  | "count"
  | "ratio"
  | "percent";

export type RoutineBaseline = {
  id: string;
  organizationId: string;
  siteId: string;
  cameraId: string;
  cameraName: string;
  baselineCode: RoutineBaselineCode;
  dayOfWeek: number;
  bucketHour: number;
  sessionType: string;
  status: RoutineBaselineStatus;
  sampleCount: number;
  dayCount: number;
  periodStart: string;
  periodEnd: string;
  windowDays: number;
  centerValue: number;
  lowerValue: number;
  upperValue: number;
  spreadValue: number;
  unit: RoutineUnit;
  confidence: number;
  confirmedAt: string | null;
};

export type OperationalDeviation = {
  id: string;
  organizationId: string;
  siteId: string;
  cameraId: string;
  cameraName: string;
  localDate: string;
  deviationCode: OperationalDeviationCode;
  status: OperationalDeviationStatus;
  severity: OperationalSeverity;
  title: string;
  summary: string;
  observedValue: number | null;
  expectedLower: number | null;
  expectedCenter: number | null;
  expectedUpper: number | null;
  deviationAmount: number | null;
  unit: RoutineUnit | null;
  confidence: number;
  observedAt: string;
  resolvedAt: string | null;
  evidenceEventIds: string[];
  data: Record<string, unknown>;
};

export type RoutineOverview = {
  baselines: RoutineBaseline[];
  deviations: OperationalDeviation[];
  summary: {
    activeBaselines: number;
    learningBaselines: number;
    staleBaselines: number;
    activeDeviations: number;
    importantDeviations: number;
  };
};
