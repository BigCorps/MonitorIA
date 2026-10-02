import "server-only";

import type { PixPaymentSummary } from "@/src/billing/payment-types";
import { createAdminClient } from "@/src/lib/supabase/admin";
import type { VipBillingCycle, VipPlanCode } from "./types";

export type VipPricingQuote = {
  planCode: VipPlanCode;
  displayName: string;
  includedCameras: number;
  excessCameraMonthlyCents: number;
  excessCameraCount: number;
  monthlyBaseCents: number;
  monthlyExcessCents: number;
  monthlyPayNowCents: number;
  annualBaseCents: number;
  annualPayNowCents: number;
  annualEstimatedFirstYearCents: number;
};

export type VipPricingSnapshot = {
  version: string;
  cameraCount: number;
  selectedPlanCode: VipPlanCode;
  includedCameras: number;
  excessCameraCount: number;
  excessCameraMonthlyCents: number;
  monthlyBaseCents: number;
  monthlyExcessCents: number;
  monthlyPayNowCents: number;
  monthlyEstimatedFirstYearCents: number;
  annualBaseCents: number;
  annualPayNowCents: number;
  annualEstimatedFirstYearCents: number;
  recommendedMonthlyPlanCode: VipPlanCode;
  recommendedAnnualPlanCode: VipPlanCode;
  quotes: VipPricingQuote[];
};

export type VipProofSnapshot = {
  version: string;
  trialId: string;
  trialStatus: string;
  captureStartedAt: string | null;
  captureEndsAt: string | null;
  captureCompletedAt: string | null;
  cameraCount: number;
  eventCount: number;
  clipCount: number;
  reviewCount: number;
  continuationCount: number;
  assistantInteractionsUsed: number;
  assistantInteractionLimit: number;
  topEventTypes: Array<{ type: string; count: number }>;
};

export type VipProposal = {
  id: string;
  projectId: string;
  version: number;
  status: "presented" | "accepted" | "superseded" | "cancelled";
  planCode: VipPlanCode;
  cameraCount: number;
  recommendedMonthlyPlanCode: VipPlanCode;
  recommendedAnnualPlanCode: VipPlanCode;
  pricing: VipPricingSnapshot;
  proof: VipProofSnapshot;
  selectedBillingCycle: VipBillingCycle | null;
  presentedAt: string;
  acceptedAt: string | null;
};

export type VipContract = {
  id: string;
  projectId: string;
  proposalId: string;
  organizationId: string;
  planCode: VipPlanCode;
  billingCycle: VipBillingCycle;
  includedCameras: number;
  contractedCameraCount: number;
  excessCameraCount: number;
  baseAmountCents: number;
  excessCameraMonthlyCents: number;
  initialExcessAmountCents: number;
  initialInvoiceTotalCents: number;
  estimatedFirstYearTotalCents: number;
  status:
    | "awaiting_payment"
    | "paid_pending_activation"
    | "active"
    | "grace_period"
    | "suspended"
    | "cancelled";
  invoiceId: string | null;
  paymentId: string | null;
  paidAt: string | null;
  basePeriodStart: string | null;
  basePeriodEnd: string | null;
  excessPeriodStart: string | null;
  excessPeriodEnd: string | null;
  nextExcessInvoiceAt: string | null;
  activatedAt: string | null;
  createdAt: string;
};

export type VipInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  paidAt: string | null;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function planCode(value: unknown): VipPlanCode {
  const code = String(value);
  if (code === "vip10" || code === "vip50" || code === "vip150") {
    return code;
  }
  throw new Error("invalid_vip_plan_code");
}

function pricingFrom(value: unknown): VipPricingSnapshot {
  const row = objectValue(value);
  const quotes = Array.isArray(row.quotes) ? row.quotes : [];

  return {
    version: String(row.version ?? "vip-pricing-v1"),
    cameraCount: numberValue(row.cameraCount),
    selectedPlanCode: planCode(row.selectedPlanCode),
    includedCameras: numberValue(row.includedCameras),
    excessCameraCount: numberValue(row.excessCameraCount),
    excessCameraMonthlyCents: numberValue(row.excessCameraMonthlyCents),
    monthlyBaseCents: numberValue(row.monthlyBaseCents),
    monthlyExcessCents: numberValue(row.monthlyExcessCents),
    monthlyPayNowCents: numberValue(row.monthlyPayNowCents),
    monthlyEstimatedFirstYearCents: numberValue(
      row.monthlyEstimatedFirstYearCents,
    ),
    annualBaseCents: numberValue(row.annualBaseCents),
    annualPayNowCents: numberValue(row.annualPayNowCents),
    annualEstimatedFirstYearCents: numberValue(
      row.annualEstimatedFirstYearCents,
    ),
    recommendedMonthlyPlanCode: planCode(row.recommendedMonthlyPlanCode),
    recommendedAnnualPlanCode: planCode(row.recommendedAnnualPlanCode),
    quotes: quotes.map((item) => {
      const quote = objectValue(item);
      return {
        planCode: planCode(quote.planCode),
        displayName: String(quote.displayName ?? ""),
        includedCameras: numberValue(quote.includedCameras),
        excessCameraMonthlyCents: numberValue(
          quote.excessCameraMonthlyCents,
        ),
        excessCameraCount: numberValue(quote.excessCameraCount),
        monthlyBaseCents: numberValue(quote.monthlyBaseCents),
        monthlyExcessCents: numberValue(quote.monthlyExcessCents),
        monthlyPayNowCents: numberValue(quote.monthlyPayNowCents),
        annualBaseCents: numberValue(quote.annualBaseCents),
        annualPayNowCents: numberValue(quote.annualPayNowCents),
        annualEstimatedFirstYearCents: numberValue(
          quote.annualEstimatedFirstYearCents,
        ),
      };
    }),
  };
}

function proofFrom(value: unknown): VipProofSnapshot {
  const row = objectValue(value);
  const top = Array.isArray(row.topEventTypes) ? row.topEventTypes : [];

  return {
    version: String(row.version ?? "vip-proof-v1"),
    trialId: String(row.trialId ?? ""),
    trialStatus: String(row.trialStatus ?? ""),
    captureStartedAt: row.captureStartedAt
      ? String(row.captureStartedAt)
      : null,
    captureEndsAt: row.captureEndsAt ? String(row.captureEndsAt) : null,
    captureCompletedAt: row.captureCompletedAt
      ? String(row.captureCompletedAt)
      : null,
    cameraCount: numberValue(row.cameraCount),
    eventCount: numberValue(row.eventCount),
    clipCount: numberValue(row.clipCount),
    reviewCount: numberValue(row.reviewCount),
    continuationCount: numberValue(row.continuationCount),
    assistantInteractionsUsed: numberValue(row.assistantInteractionsUsed),
    assistantInteractionLimit: numberValue(row.assistantInteractionLimit),
    topEventTypes: top.map((item) => {
      const entry = objectValue(item);
      return {
        type: String(entry.type ?? ""),
        count: numberValue(entry.count),
      };
    }),
  };
}

function proposalFrom(row: Record<string, unknown>): VipProposal {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    version: numberValue(row.version),
    status: String(row.status) as VipProposal["status"],
    planCode: planCode(row.plan_code),
    cameraCount: numberValue(row.camera_count),
    recommendedMonthlyPlanCode: planCode(
      row.recommended_monthly_plan_code,
    ),
    recommendedAnnualPlanCode: planCode(
      row.recommended_annual_plan_code,
    ),
    pricing: pricingFrom(row.pricing_snapshot),
    proof: proofFrom(row.proof_snapshot),
    selectedBillingCycle: row.selected_billing_cycle
      ? (String(row.selected_billing_cycle) as VipBillingCycle)
      : null,
    presentedAt: String(row.presented_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : null,
  };
}

function contractFrom(row: Record<string, unknown>): VipContract {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    proposalId: String(row.proposal_id),
    organizationId: String(row.organization_id),
    planCode: planCode(row.plan_code),
    billingCycle: String(row.billing_cycle) as VipBillingCycle,
    includedCameras: numberValue(row.included_cameras),
    contractedCameraCount: numberValue(row.contracted_camera_count),
    excessCameraCount: numberValue(row.excess_camera_count),
    baseAmountCents: numberValue(row.base_amount_cents),
    excessCameraMonthlyCents: numberValue(
      row.excess_camera_monthly_cents,
    ),
    initialExcessAmountCents: numberValue(row.initial_excess_amount_cents),
    initialInvoiceTotalCents: numberValue(
      row.initial_invoice_total_cents,
    ),
    estimatedFirstYearTotalCents: numberValue(
      row.estimated_first_year_total_cents,
    ),
    status: String(row.status) as VipContract["status"],
    invoiceId: row.invoice_id ? String(row.invoice_id) : null,
    paymentId: row.payment_id ? String(row.payment_id) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    basePeriodStart: row.base_period_start
      ? String(row.base_period_start)
      : null,
    basePeriodEnd: row.base_period_end ? String(row.base_period_end) : null,
    excessPeriodStart: row.excess_period_start
      ? String(row.excess_period_start)
      : null,
    excessPeriodEnd: row.excess_period_end
      ? String(row.excess_period_end)
      : null,
    nextExcessInvoiceAt: row.next_excess_invoice_at
      ? String(row.next_excess_invoice_at)
      : null,
    activatedAt: row.activated_at ? String(row.activated_at) : null,
    createdAt: String(row.created_at),
  };
}

export async function getVipProposalForProject(
  projectId: string,
): Promise<VipProposal | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vip_proposals")
    .select(
      "id,project_id,version,status,plan_code,camera_count,recommended_monthly_plan_code,recommended_annual_plan_code,pricing_snapshot,proof_snapshot,selected_billing_cycle,presented_at,accepted_at",
    )
    .eq("project_id", projectId)
    .in("status", ["presented", "accepted"])
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`vip_proposal_unavailable:${error.message}`);
  }

  return data ? proposalFrom(objectValue(data)) : null;
}

export async function getVipContractForProject(
  projectId: string,
): Promise<VipContract | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("vip_contracts")
    .select(
      "id,project_id,proposal_id,organization_id,plan_code,billing_cycle,included_cameras,contracted_camera_count,excess_camera_count,base_amount_cents,excess_camera_monthly_cents,initial_excess_amount_cents,initial_invoice_total_cents,estimated_first_year_total_cents,status,invoice_id,payment_id,paid_at,base_period_start,base_period_end,excess_period_start,excess_period_end,next_excess_invoice_at,activated_at,created_at",
    )
    .eq("project_id", projectId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`vip_contract_unavailable:${error.message}`);
  }

  return data ? contractFrom(objectValue(data)) : null;
}

export async function getVipBillingSummary(
  contract: VipContract | null,
): Promise<{
  invoice: VipInvoiceSummary | null;
  payment: PixPaymentSummary | null;
}> {
  if (!contract?.invoiceId) {
    return { invoice: null, payment: null };
  }

  const admin = createAdminClient();
  const [invoiceResult, paymentResult] = await Promise.all([
    admin
      .from("billing_invoices")
      .select(
        "id,invoice_number,status,total_cents,service_period_start,service_period_end,paid_at",
      )
      .eq("id", contract.invoiceId)
      .eq("organization_id", contract.organizationId)
      .maybeSingle(),
    admin
      .from("billing_pix_payments")
      .select(
        "id,invoice_id,status,txid,amount_cents,pix_copy_paste,qr_code_payload,bank_status,expires_at,confirmed_at,last_checked_at,check_attempts,error_code,error_message",
      )
      .eq("invoice_id", contract.invoiceId)
      .eq("organization_id", contract.organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (invoiceResult.error) {
    throw new Error(`vip_invoice_unavailable:${invoiceResult.error.message}`);
  }
  if (paymentResult.error) {
    throw new Error(`vip_payment_unavailable:${paymentResult.error.message}`);
  }

  const invoiceRow = invoiceResult.data;
  const paymentRow = paymentResult.data;

  const invoice: VipInvoiceSummary | null = invoiceRow
    ? {
        id: String(invoiceRow.id),
        invoiceNumber: String(invoiceRow.invoice_number),
        status: String(invoiceRow.status),
        totalCents: Number(invoiceRow.total_cents),
        servicePeriodStart: String(invoiceRow.service_period_start),
        servicePeriodEnd: String(invoiceRow.service_period_end),
        paidAt: invoiceRow.paid_at ? String(invoiceRow.paid_at) : null,
      }
    : null;

  const payment: PixPaymentSummary | null = paymentRow
    ? {
        id: String(paymentRow.id),
        invoiceId: String(paymentRow.invoice_id),
        status: String(paymentRow.status),
        txid: paymentRow.txid ? String(paymentRow.txid) : null,
        amountCents: Number(paymentRow.amount_cents),
        pixCopyPaste: paymentRow.pix_copy_paste
          ? String(paymentRow.pix_copy_paste)
          : null,
        qrCodePayload: paymentRow.qr_code_payload
          ? String(paymentRow.qr_code_payload)
          : null,
        bankStatus: paymentRow.bank_status
          ? String(paymentRow.bank_status)
          : null,
        expiresAt: paymentRow.expires_at
          ? String(paymentRow.expires_at)
          : null,
        confirmedAt: paymentRow.confirmed_at
          ? String(paymentRow.confirmed_at)
          : null,
        lastCheckedAt: paymentRow.last_checked_at
          ? String(paymentRow.last_checked_at)
          : null,
        checkAttempts: Number(paymentRow.check_attempts ?? 0),
        errorCode: paymentRow.error_code
          ? String(paymentRow.error_code)
          : null,
        errorMessage: paymentRow.error_message
          ? String(paymentRow.error_message)
          : null,
      }
    : null;

  return { invoice, payment };
}

export async function presentVipProposal(input: {
  projectId: string;
  planCode: VipPlanCode;
  cameraCount: number;
  actorUserId: string;
  actorSalesOperatorId: string | null;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("present_vip_proposal_v1", {
    p_project_id: input.projectId,
    p_plan_code: input.planCode,
    p_camera_count: input.cameraCount,
    p_actor_user_id: input.actorUserId,
    p_actor_sales_operator_id: input.actorSalesOperatorId,
  });

  if (error) {
    throw new Error(`vip_proposal_present_failed:${error.message}`);
  }

  const result = objectValue(data);
  if (result.success !== true) {
    throw new Error("vip_proposal_present_failed");
  }

  return {
    proposalId: String(result.proposalId),
    projectId: String(result.projectId),
    version: Number(result.version),
  };
}

export async function acceptVipProposal(input: {
  proposalId: string;
  billingCycle: VipBillingCycle;
  actorUserId: string;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("accept_vip_proposal_v1", {
    p_proposal_id: input.proposalId,
    p_billing_cycle: input.billingCycle,
    p_actor_user_id: input.actorUserId,
  });

  if (error) {
    throw new Error(`vip_proposal_accept_failed:${error.message}`);
  }

  const result = objectValue(data);
  if (result.success !== true) {
    throw new Error("vip_proposal_accept_failed");
  }

  return {
    contractId: String(result.contractId),
    invoiceId: String(result.invoiceId),
    invoiceNumber: String(result.invoiceNumber ?? ""),
    duplicate: result.duplicate === true,
  };
}

export async function reopenVipProposal(input: {
  projectId: string;
  actorUserId: string;
  actorSalesOperatorId: string | null;
}) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reopen_vip_proposal_v1", {
    p_project_id: input.projectId,
    p_actor_user_id: input.actorUserId,
    p_actor_sales_operator_id: input.actorSalesOperatorId,
  });

  if (error) {
    throw new Error(`vip_proposal_reopen_failed:${error.message}`);
  }

  const result = objectValue(data);
  if (result.success !== true) {
    throw new Error("vip_proposal_reopen_failed");
  }

  return { projectId: String(result.projectId) };
}
