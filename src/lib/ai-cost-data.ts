import { createAdminClient } from "@/src/lib/supabase/admin";

export type AiCostSettings = {
  usdToBrl: number;
  warningTargetPercent: number;
  criticalTargetPercent: number;
  projectionMinJobs: number;
  projectionMinHours: number;
  updatedAt: string;
};

export type AiMarginTarget = {
  planCode: string;
  targetMaxCogsCents: number;
  validFrom: string;
  notes: string;
};

export type AiCameraMonthlyCost = {
  organizationId: string;
  organizationName: string;
  cameraId: string;
  cameraName: string;
  usageMonth: string;
  planCode: string;
  planName: string;
  referencePriceCents: number;
  actualPaidRevenueCents: number;
  targetMaxCogsCents: number;
  maximumEscalationPercent: number;
  jobsCount: number;
  completedJobs: number;
  failedJobs: number;
  relevantEvents: number;
  reviewRequiredEvents: number;
  totalModelCalls: number;
  nanoCalls: number;
  miniCalls: number;
  primaryCalls: number;
  verifierCalls: number;
  experimentalCalls: number;
  escalationCalls: number;
  estimatedAiCostUsd: number;
  productionAiCostUsd: number;
  experimentalAiCostUsd: number;
  knownAiCostBrlCents: number;
  projected30dAiCostUsd: number | null;
  projected30dAiCostBrlCents: number | null;
  avgLatencyMs: number | null;
  p95LatencyMs: number | null;
  avgConfidence: number | null;
  reviewRateBasisPoints: number;
  escalationRateBasisPoints: number;
  failedRateBasisPoints: number;
  observationHours: number;
  projectedCostTargetUtilizationBasisPoints: number | null;
  escalationLimitBasisPoints: number;
  marginAfterProjectedAiBasisPoints: number | null;
  routingTelemetryAvailable: boolean;
  costStatus: string;
  escalationStatus: string;
  dataQualityStatus: string;
  overallStatus: string;
};

export type AiCostAlert = {
  id: string;
  organizationId: string;
  cameraId: string;
  usageMonth: string;
  alertType: string;
  severity: string;
  status: string;
  observedValue: number | null;
  thresholdValue: number | null;
  unit: string;
  firstSeenAt: string;
  lastSeenAt: string;
  details: Record<string, unknown>;
};

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeReport(row: Record<string, unknown>): AiCameraMonthlyCost {
  return {
    organizationId: String(row.organization_id),
    organizationName: String(row.organization_name ?? "Organização"),
    cameraId: String(row.camera_id),
    cameraName: String(row.camera_name ?? "Câmera"),
    usageMonth: String(row.usage_month),
    planCode: String(row.plan_code ?? "basic"),
    planName: String(row.plan_name ?? row.plan_code ?? "Plano"),
    referencePriceCents: numberValue(row.reference_price_cents),
    actualPaidRevenueCents: numberValue(row.actual_paid_revenue_cents),
    targetMaxCogsCents: numberValue(row.target_max_cogs_cents),
    maximumEscalationPercent: numberValue(row.maximum_escalation_percent),
    jobsCount: numberValue(row.jobs_count),
    completedJobs: numberValue(row.completed_jobs),
    failedJobs: numberValue(row.failed_jobs),
    relevantEvents: numberValue(row.relevant_events),
    reviewRequiredEvents: numberValue(row.review_required_events),
    totalModelCalls: numberValue(row.total_model_calls),
    nanoCalls: numberValue(row.nano_calls),
    miniCalls: numberValue(row.mini_calls),
    primaryCalls: numberValue(row.primary_calls),
    verifierCalls: numberValue(row.verifier_calls),
    experimentalCalls: numberValue(row.experimental_calls),
    escalationCalls: numberValue(row.escalation_calls),
    estimatedAiCostUsd: numberValue(row.estimated_ai_cost_usd),
    productionAiCostUsd: numberValue(row.production_ai_cost_usd),
    experimentalAiCostUsd: numberValue(row.experimental_ai_cost_usd),
    knownAiCostBrlCents: numberValue(row.known_ai_cost_brl_cents),
    projected30dAiCostUsd: nullableNumber(row.projected_30d_ai_cost_usd),
    projected30dAiCostBrlCents: nullableNumber(row.projected_30d_ai_cost_brl_cents),
    avgLatencyMs: nullableNumber(row.avg_latency_ms),
    p95LatencyMs: nullableNumber(row.p95_latency_ms),
    avgConfidence: nullableNumber(row.avg_confidence),
    reviewRateBasisPoints: numberValue(row.review_rate_basis_points),
    escalationRateBasisPoints: numberValue(row.escalation_rate_basis_points),
    failedRateBasisPoints: numberValue(row.failed_rate_basis_points),
    observationHours: numberValue(row.observation_hours),
    projectedCostTargetUtilizationBasisPoints: nullableNumber(
      row.projected_cost_target_utilization_basis_points,
    ),
    escalationLimitBasisPoints: numberValue(row.escalation_limit_basis_points),
    marginAfterProjectedAiBasisPoints: nullableNumber(
      row.margin_after_projected_ai_basis_points,
    ),
    routingTelemetryAvailable: Boolean(row.routing_telemetry_available),
    costStatus: String(row.cost_status ?? "insufficient_data"),
    escalationStatus: String(row.escalation_status ?? "healthy"),
    dataQualityStatus: String(row.data_quality_status ?? "healthy"),
    overallStatus: String(row.overall_status ?? "insufficient_data"),
  };
}

export async function getAiCostDashboardData(
  month: string,
  organizationId?: string,
) {
  const supabase = createAdminClient();

  let reportQuery = supabase
    .from("ai_camera_monthly_cost_report_internal")
    .select("*")
    .eq("usage_month", month)
    .order("organization_name", { ascending: true })
    .order("camera_name", { ascending: true });

  if (organizationId) {
    reportQuery = reportQuery.eq("organization_id", organizationId);
  }

  let alertsQuery = supabase
    .from("ai_cost_alerts")
    .select("*")
    .eq("usage_month", month)
    .neq("status", "resolved")
    .order("severity", { ascending: true })
    .order("last_seen_at", { ascending: false });

  if (organizationId) {
    alertsQuery = alertsQuery.eq("organization_id", organizationId);
  }

  const [
    reportResult,
    alertsResult,
    settingsResult,
    targetsResult,
    monthsResult,
    organizationsResult,
  ] = await Promise.all([
    reportQuery,
    alertsQuery,
    supabase.from("ai_cost_settings").select("*").eq("id", 1).single(),
    supabase
      .from("plan_margin_target_versions")
      .select("plan_code,target_max_cogs_cents,valid_from,notes")
      .is("valid_to", null)
      .order("plan_code", { ascending: true }),
    supabase
      .from("camera_usage_monthly")
      .select("usage_month")
      .order("usage_month", { ascending: false })
      .limit(36),
    supabase.from("organizations").select("id,name").order("name", { ascending: true }),
  ]);

  if (reportResult.error) throw new Error(reportResult.error.message);
  if (alertsResult.error) throw new Error(alertsResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (targetsResult.error) throw new Error(targetsResult.error.message);
  if (monthsResult.error) throw new Error(monthsResult.error.message);
  if (organizationsResult.error) throw new Error(organizationsResult.error.message);

  const settingsRow = settingsResult.data as Record<string, unknown>;
  const reports = (reportResult.data ?? []).map((row) =>
    normalizeReport(row as Record<string, unknown>),
  );

  const alerts: AiCostAlert[] = (alertsResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    organizationId: String(row.organization_id),
    cameraId: String(row.camera_id),
    usageMonth: String(row.usage_month),
    alertType: String(row.alert_type),
    severity: String(row.severity),
    status: String(row.status),
    observedValue: nullableNumber(row.observed_value),
    thresholdValue: nullableNumber(row.threshold_value),
    unit: String(row.unit ?? ""),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    details: objectValue(row.details),
  }));

  const targets: AiMarginTarget[] = (targetsResult.data ?? []).map((row: any) => ({
    planCode: String(row.plan_code),
    targetMaxCogsCents: numberValue(row.target_max_cogs_cents),
    validFrom: String(row.valid_from),
    notes: String(row.notes ?? ""),
  }));

  const months = [
    ...new Set((monthsResult.data ?? []).map((row: any) => String(row.usage_month))),
  ];

  const organizations = (organizationsResult.data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name ?? "Organização"),
  }));

  const settings: AiCostSettings = {
    usdToBrl: numberValue(settingsRow.usd_to_brl, 6),
    warningTargetPercent: numberValue(settingsRow.warning_target_percent, 80),
    criticalTargetPercent: numberValue(settingsRow.critical_target_percent, 100),
    projectionMinJobs: numberValue(settingsRow.projection_min_jobs, 10),
    projectionMinHours: numberValue(settingsRow.projection_min_hours, 2),
    updatedAt: String(settingsRow.updated_at),
  };

  return { reports, alerts, settings, targets, months, organizations };
}
