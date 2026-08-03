import type {
  CommercialPlan,
  CommercialPlanCode,
} from "@/src/billing/types";
import {
  getOrganizationCameras,
  type CameraSummary,
} from "@/src/lib/dashboard-data";
import { createClient } from "@/src/lib/supabase/server";
import { effectiveTrialStatus } from "@/src/trial/status";
import type {
  TrialAllowance,
  TrialCamera,
  TrialDashboardData,
  TrialEntitlement,
  TrialReadiness,
  TrialRun,
  TrialStatus,
} from "@/src/trial/types";

function planCode(value: unknown): CommercialPlanCode {
  if (value === "standard" || value === "intensive") {
    return value;
  }
  return "basic";
}

function nullablePlanCode(value: unknown): CommercialPlanCode | null {
  if (
    value === "basic" ||
    value === "standard" ||
    value === "intensive"
  ) {
    return value;
  }
  return null;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nullableString(value: unknown) {
  return value === null || value === undefined || value === ""
    ? null
    : String(value);
}

function readinessValue(value: unknown): TrialReadiness {
  const row = objectValue(value);
  const reasons = Array.isArray(row.reasons)
    ? row.reasons.map((reason) => String(reason))
    : [];

  return {
    ready: Boolean(row.ready),
    cameraFound: row.cameraFound !== false,
    cameraId: nullableString(row.cameraId),
    cameraName: nullableString(row.cameraName),
    cameraOnline: Boolean(row.cameraOnline),
    cameraPaired: Boolean(row.cameraPaired),
    activeProfile: Boolean(row.activeProfile),
    activeProfileId: nullableString(row.activeProfileId),
    agentCameraEnabled: Boolean(row.agentCameraEnabled),
    agentId: nullableString(row.agentId),
    agentName: nullableString(row.agentName),
    agentOnline: Boolean(row.agentOnline),
    agentHeartbeatRecent: Boolean(row.agentHeartbeatRecent),
    lastHeartbeatAt: nullableString(row.lastHeartbeatAt),
    reasons,
    checkedAt: nullableString(row.checkedAt),
  };
}

function trialValue(value: any): TrialRun | null {
  if (!value) return null;

  const captureEndsAt = nullableString(value.capture_ends_at);
  const explorationEndsAt = nullableString(value.exploration_ends_at);
  const status = effectiveTrialStatus({
    status: String(value.status) as TrialStatus,
    captureEndsAt,
    explorationEndsAt,
  });

  return {
    id: String(value.id),
    organizationId: String(value.organization_id),
    cameraId: nullableString(value.camera_id),
    selectedPlanCode: nullablePlanCode(value.selected_plan_code),
    agentId: nullableString(value.agent_id),
    status,
    readyAt: nullableString(value.ready_at),
    captureStartedAt: nullableString(value.capture_started_at),
    captureEndsAt,
    captureCompletedAt: nullableString(value.capture_completed_at),
    explorationEndsAt,
    purgeAfter: nullableString(value.purge_after),
    convertedAt: nullableString(value.converted_at),
    expiredAt: nullableString(value.expired_at),
    purgedAt: nullableString(value.purged_at),
    interactionsUsed: Number(value.interactions_used ?? 0),
    interactionLimit: Number(value.interaction_limit ?? 21),
    statusReason: nullableString(value.status_reason),
    readiness: value.readiness_snapshot
      ? readinessValue(value.readiness_snapshot)
      : null,
  };
}

function entitlementValue(value: any): TrialEntitlement | null {
  if (!value) return null;

  return {
    accessSource: String(value.access_source),
    monitoringAllowed: Boolean(value.monitoring_allowed),
    planCode: nullablePlanCode(value.plan_code),
    captureEndsAt: nullableString(value.capture_ends_at),
    explorationEndsAt: nullableString(value.exploration_ends_at),
    purgeAfter: nullableString(value.purge_after),
    assistantAccessAllowed: Boolean(value.assistant_access_allowed),
    enforcementEnabled: Boolean(value.enforcement_enabled),
    reason: String(value.reason ?? "payment_required"),
  };
}

async function loadPlans(): Promise<CommercialPlan[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const [catalogResult, priceResult] = await Promise.all([
    supabase
      .from("camera_plan_catalog")
      .select(
        "code,display_name,short_description,metadata_retention_days,long_term_keyframes,temporary_frame_days,clip_enabled,clip_duration_seconds,clip_retention_days,maximum_analysis_frames,maximum_escalation_percent,features,sort_order",
      )
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("camera_plan_price_versions")
      .select(
        "plan_code,amount_cents,currency,billing_period_days,valid_from,valid_to",
      )
      .lte("valid_from", now)
      .is("valid_to", null)
      .order("valid_from", { ascending: false }),
  ]);

  if (catalogResult.error || priceResult.error) {
    throw new Error(
      catalogResult.error?.message ??
        priceResult.error?.message ??
        "trial_plan_catalog_unavailable",
    );
  }

  const prices = new Map<string, any>();
  for (const price of priceResult.data ?? []) {
    const code = String((price as any).plan_code);
    if (!prices.has(code)) prices.set(code, price);
  }

  return (catalogResult.data ?? []).flatMap((row: any) => {
    const price = prices.get(String(row.code));
    if (!price) return [];

    return [
      {
        code: planCode(row.code),
        displayName: String(row.display_name),
        shortDescription: String(row.short_description ?? ""),
        amountCents: Number(price.amount_cents),
        currency: "BRL",
        billingPeriodDays: Number(price.billing_period_days),
        metadataRetentionDays: Number(row.metadata_retention_days),
        longTermKeyframes: Number(row.long_term_keyframes),
        temporaryFrameDays: Number(row.temporary_frame_days),
        clipEnabled: Boolean(row.clip_enabled),
        clipDurationSeconds:
          row.clip_duration_seconds === null
            ? null
            : Number(row.clip_duration_seconds),
        clipRetentionDays:
          row.clip_retention_days === null
            ? null
            : Number(row.clip_retention_days),
        maximumAnalysisFrames: Number(row.maximum_analysis_frames),
        maximumEscalationPercent: Number(
          row.maximum_escalation_percent,
        ),
        features: objectValue(row.features),
        sortOrder: Number(row.sort_order),
      } satisfies CommercialPlan,
    ];
  });
}

async function loadReadiness(
  organizationId: string,
  cameras: CameraSummary[],
) {
  const supabase = await createClient();

  const results = await Promise.all(
    cameras.map(async (camera) => {
      const { data, error } = await supabase.rpc(
        "get_monitoria_trial_readiness",
        {
          p_organization_id: organizationId,
          p_camera_id: camera.id,
        },
      );

      if (error) {
        return [
          camera.id,
          readinessValue({
            ready: false,
            cameraFound: true,
            cameraId: camera.id,
            cameraName: camera.name,
            cameraOnline: camera.status === "online",
            cameraPaired: camera.pairingStatus === "paired",
            reasons: ["readiness_unavailable"],
          }),
        ] as const;
      }

      return [camera.id, readinessValue(data)] as const;
    }),
  );

  return new Map(results);
}

export async function getTrialDashboardData(
  organizationId: string,
  role: string,
): Promise<TrialDashboardData> {
  const supabase = await createClient();
  const [cameras, plans, trialResult, entitlementResult] =
    await Promise.all([
      getOrganizationCameras(organizationId),
      loadPlans(),
      supabase
        .from("trial_runs")
        .select(
          "id,organization_id,camera_id,selected_plan_code,agent_id,status,ready_at,capture_started_at,capture_ends_at,capture_completed_at,exploration_ends_at,purge_after,converted_at,expired_at,purged_at,interactions_used,interaction_limit,status_reason,readiness_snapshot",
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("camera_entitlements")
        .select(
          "camera_id,access_source,monitoring_allowed,plan_code,capture_ends_at,exploration_ends_at,purge_after,assistant_access_allowed,enforcement_enabled,reason",
        )
        .eq("organization_id", organizationId),
    ]);

  if (trialResult.error) {
    throw new Error(
      `trial_state_unavailable:${trialResult.error.message}`,
    );
  }

  if (entitlementResult.error) {
    throw new Error(
      `trial_entitlement_unavailable:${entitlementResult.error.message}`,
    );
  }

  const trial = trialValue(trialResult.data);
  const entitlementByCamera = new Map<string, TrialEntitlement>();

  for (const row of entitlementResult.data ?? []) {
    const entitlement = entitlementValue(row);
    if (entitlement) {
      entitlementByCamera.set(String((row as any).camera_id), entitlement);
    }
  }

  const readinessByCamera = await loadReadiness(
    organizationId,
    cameras,
  );

  const trialCameras: TrialCamera[] = cameras.map((camera) => ({
    ...camera,
    readiness:
      readinessByCamera.get(camera.id) ??
      readinessValue({
        ready: false,
        cameraId: camera.id,
        cameraName: camera.name,
        reasons: ["readiness_unavailable"],
      }),
    entitlement: entitlementByCamera.get(camera.id) ?? null,
  }));

  let allowance: TrialAllowance | null = null;
  let eventCount = 0;

  if (trial) {
    const [allowanceResult, eventsResult] = await Promise.all([
      supabase
        .from("assistant_allowances")
        .select(
          "id,included_interactions,used_interactions,period_start,period_end",
        )
        .eq("organization_id", organizationId)
        .eq("source", "trial")
        .eq("source_reference_id", trial.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("trial_run_id", trial.id)
        .is("deleted_at", null),
    ]);

    if (allowanceResult.error || eventsResult.error) {
      throw new Error(
        allowanceResult.error?.message ??
          eventsResult.error?.message ??
          "trial_usage_unavailable",
      );
    }

    if (allowanceResult.data) {
      const row = allowanceResult.data as any;
      const included = Number(row.included_interactions);
      const used = Number(row.used_interactions);
      allowance = {
        id: String(row.id),
        includedInteractions: included,
        usedInteractions: used,
        remainingInteractions: Math.max(0, included - used),
        periodStart: String(row.period_start),
        periodEnd: String(row.period_end),
      };
    }

    eventCount = eventsResult.count ?? 0;
  }

  return {
    trial,
    plans,
    cameras: trialCameras,
    allowance,
    eventCount,
    canManage: role === "owner" || role === "admin",
  };
}
