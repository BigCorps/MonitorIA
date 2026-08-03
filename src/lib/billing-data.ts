import type {
  AssistantAllowanceSummary,
  BillingAccountSummary,
  CameraSubscriptionSummary,
  CommercialPlan,
  CommercialPlanCode,
  DraftInvoiceSummary,
  TrialSummary,
  VolumeDiscountTier,
} from "@/src/billing/types";
import { createClient } from "@/src/lib/supabase/server";

function planCode(value: unknown): CommercialPlanCode {
  const candidate = String(value ?? "basic");

  if (
    candidate === "basic" ||
    candidate === "standard" ||
    candidate === "intensive"
  ) {
    return candidate;
  }

  return "basic";
}

function objectValue(
  value: unknown,
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function getCommercialFoundationData(
  organizationId: string,
) {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [
    catalogResult,
    pricesResult,
    tiersResult,
    subscriptionsResult,
    invoiceResult,
    accountResult,
    trialResult,
    allowanceResult,
  ] = await Promise.all([
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
        "id,plan_code,amount_cents,currency,billing_period_days,valid_from,valid_to",
      )
      .lte("valid_from", nowIso)
      .is("valid_to", null)
      .order("valid_from", { ascending: false }),
    supabase
      .from("volume_discount_tiers")
      .select(
        "minimum_position,maximum_position,discount_basis_points,label",
      )
      .eq("is_active", true)
      .order("minimum_position"),
    supabase
      .from("camera_subscriptions")
      .select(
        "camera_id,plan_code,status,current_period_start,current_period_end,grace_ends_at,cancel_at_period_end",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("billing_invoices")
      .select(
        "id,invoice_number,status,subtotal_cents,discount_cents,total_cents,service_period_start,service_period_end,created_at",
      )
      .eq("organization_id", organizationId)
      .in("status", ["draft", "open", "pending_payment"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("billing_accounts")
      .select(
        "status,currency,grace_period_days,monthly_assistant_allowance,current_period_start,current_period_end",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("trial_runs")
      .select(
        "id,camera_id,selected_plan_code,status,capture_started_at,capture_ends_at,exploration_ends_at,interactions_used,interaction_limit",
      )
      .eq("organization_id", organizationId)
      .maybeSingle(),
    supabase
      .from("assistant_allowances")
      .select(
        "id,source,period_start,period_end,included_interactions,used_interactions",
      )
      .eq("organization_id", organizationId)
      .lte("period_start", nowIso)
      .gt("period_end", nowIso)
      .order("period_end", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  const firstError = [
    catalogResult.error,
    pricesResult.error,
    tiersResult.error,
    subscriptionsResult.error,
    invoiceResult.error,
    accountResult.error,
    trialResult.error,
    allowanceResult.error,
  ].find(Boolean);

  if (firstError) {
    throw new Error(
      `commercial_foundation_unavailable:${firstError.message}`,
    );
  }

  const currentPriceByPlan = new Map<string, any>();
  for (const row of pricesResult.data ?? []) {
    const code = String((row as any).plan_code);
    if (!currentPriceByPlan.has(code)) {
      currentPriceByPlan.set(code, row);
    }
  }

  const plans: CommercialPlan[] = (
    catalogResult.data ?? []
  ).flatMap((row: any) => {
    const price = currentPriceByPlan.get(String(row.code));
    if (!price) return [];

    return [
      {
        code: planCode(row.code),
        displayName: String(row.display_name),
        shortDescription: String(
          row.short_description ?? "",
        ),
        amountCents: Number(price.amount_cents),
        currency: "BRL",
        billingPeriodDays: Number(
          price.billing_period_days,
        ),
        metadataRetentionDays: Number(
          row.metadata_retention_days,
        ),
        longTermKeyframes: Number(
          row.long_term_keyframes,
        ),
        temporaryFrameDays: Number(
          row.temporary_frame_days,
        ),
        clipEnabled: Boolean(row.clip_enabled),
        clipDurationSeconds:
          row.clip_duration_seconds === null
            ? null
            : Number(row.clip_duration_seconds),
        clipRetentionDays:
          row.clip_retention_days === null
            ? null
            : Number(row.clip_retention_days),
        maximumAnalysisFrames: Number(
          row.maximum_analysis_frames,
        ),
        maximumEscalationPercent: Number(
          row.maximum_escalation_percent,
        ),
        features: objectValue(row.features),
        sortOrder: Number(row.sort_order),
      } satisfies CommercialPlan,
    ];
  });

  const tiers: VolumeDiscountTier[] = (
    tiersResult.data ?? []
  ).map((row: any) => ({
    minimumPosition: Number(row.minimum_position),
    maximumPosition:
      row.maximum_position === null
        ? null
        : Number(row.maximum_position),
    discountBasisPoints: Number(
      row.discount_basis_points,
    ),
    label: String(row.label),
  }));

  const subscriptions: CameraSubscriptionSummary[] = (
    subscriptionsResult.data ?? []
  ).map((row: any) => ({
    cameraId: String(row.camera_id),
    planCode: planCode(row.plan_code),
    status: String(row.status),
    currentPeriodStart: row.current_period_start
      ? String(row.current_period_start)
      : null,
    currentPeriodEnd: row.current_period_end
      ? String(row.current_period_end)
      : null,
    graceEndsAt: row.grace_ends_at
      ? String(row.grace_ends_at)
      : null,
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
  }));

  let draftInvoice: DraftInvoiceSummary | null = null;
  const invoice = invoiceResult.data as any;

  if (invoice) {
    const { data: itemRows, error: itemError } =
      await supabase
        .from("billing_invoice_items")
        .select(
          "id,camera_id,plan_code,description,billing_position,base_amount_cents,discount_basis_points,discount_amount_cents,total_amount_cents",
        )
        .eq("organization_id", organizationId)
        .eq("invoice_id", String(invoice.id))
        .order("billing_position");

    if (itemError) {
      throw new Error(
        `commercial_invoice_items_unavailable:${itemError.message}`,
      );
    }

    draftInvoice = {
      id: String(invoice.id),
      invoiceNumber: String(invoice.invoice_number),
      status: String(invoice.status),
      subtotalCents: Number(invoice.subtotal_cents),
      discountCents: Number(invoice.discount_cents),
      totalCents: Number(invoice.total_cents),
      servicePeriodStart: String(
        invoice.service_period_start,
      ),
      servicePeriodEnd: String(
        invoice.service_period_end,
      ),
      createdAt: String(invoice.created_at),
      items: (itemRows ?? []).map((item: any) => ({
        id: String(item.id),
        cameraId: item.camera_id
          ? String(item.camera_id)
          : null,
        planCode: item.plan_code
          ? planCode(item.plan_code)
          : null,
        description: String(item.description),
        billingPosition:
          item.billing_position === null
            ? null
            : Number(item.billing_position),
        baseAmountCents: Number(
          item.base_amount_cents,
        ),
        discountBasisPoints: Number(
          item.discount_basis_points,
        ),
        discountAmountCents: Number(
          item.discount_amount_cents,
        ),
        totalAmountCents: Number(
          item.total_amount_cents,
        ),
      })),
    };
  }

  const accountRow = accountResult.data as any;
  const billingAccount: BillingAccountSummary | null =
    accountRow
      ? {
          status: String(accountRow.status),
          currency: String(accountRow.currency),
          gracePeriodDays: Number(
            accountRow.grace_period_days,
          ),
          monthlyAssistantAllowance: Number(
            accountRow.monthly_assistant_allowance,
          ),
          currentPeriodStart:
            accountRow.current_period_start
              ? String(accountRow.current_period_start)
              : null,
          currentPeriodEnd: accountRow.current_period_end
            ? String(accountRow.current_period_end)
            : null,
        }
      : null;

  const trialRow = trialResult.data as any;
  const trial: TrialSummary | null = trialRow
    ? {
        id: String(trialRow.id),
        cameraId: trialRow.camera_id
          ? String(trialRow.camera_id)
          : null,
        selectedPlanCode: trialRow.selected_plan_code
          ? planCode(trialRow.selected_plan_code)
          : null,
        status: String(trialRow.status),
        captureStartedAt: trialRow.capture_started_at
          ? String(trialRow.capture_started_at)
          : null,
        captureEndsAt: trialRow.capture_ends_at
          ? String(trialRow.capture_ends_at)
          : null,
        explorationEndsAt: trialRow.exploration_ends_at
          ? String(trialRow.exploration_ends_at)
          : null,
        interactionsUsed: Number(
          trialRow.interactions_used,
        ),
        interactionLimit: Number(
          trialRow.interaction_limit,
        ),
      }
    : null;

  const allowanceRow = allowanceResult.data as any;
  const allowance: AssistantAllowanceSummary | null =
    allowanceRow
      ? {
          id: String(allowanceRow.id),
          source: String(allowanceRow.source),
          periodStart: String(allowanceRow.period_start),
          periodEnd: String(allowanceRow.period_end),
          includedInteractions: Number(
            allowanceRow.included_interactions,
          ),
          usedInteractions: Number(
            allowanceRow.used_interactions,
          ),
          remainingInteractions: Math.max(
            Number(allowanceRow.included_interactions) -
              Number(allowanceRow.used_interactions),
            0,
          ),
        }
      : null;

  return {
    plans,
    tiers,
    subscriptions,
    draftInvoice,
    billingAccount,
    trial,
    allowance,
  };
}
