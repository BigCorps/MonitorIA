import type {
  BillingDashboardData,
  BillingInvoiceItem,
  BillingInvoiceListItem,
  PixPaymentSummary,
} from "@/src/billing/payment-types";
import type { CommercialPlanCode } from "@/src/billing/types";
import { createClient } from "@/src/lib/supabase/server";

function planCode(value: unknown): CommercialPlanCode | null {
  const candidate = String(value ?? "");
  return candidate === "basic" ||
    candidate === "standard" ||
    candidate === "intensive"
    ? candidate
    : null;
}

function invoiceRow(row: any): BillingInvoiceListItem {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    status: String(row.status),
    subtotalCents: Number(row.subtotal_cents),
    discountCents: Number(row.discount_cents),
    totalCents: Number(row.total_cents),
    servicePeriodStart: String(row.service_period_start),
    servicePeriodEnd: String(row.service_period_end),
    dueAt: row.due_at ? String(row.due_at) : null,
    paidAt: row.paid_at ? String(row.paid_at) : null,
    createdAt: String(row.created_at),
  };
}

export async function getBillingDashboardData(
  organizationId: string,
  requestedInvoiceId?: string | null,
): Promise<BillingDashboardData> {
  const supabase = await createClient();

  const { data: invoiceRows, error: invoiceError } = await supabase
    .from("billing_invoices")
    .select(
      "id,invoice_number,status,subtotal_cents,discount_cents,total_cents,service_period_start,service_period_end,due_at,paid_at,created_at",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(24);

  if (invoiceError) {
    throw new Error(
      `billing_invoices_unavailable:${invoiceError.message}`,
    );
  }

  const invoices = (invoiceRows ?? []).map(invoiceRow);
  const requested = requestedInvoiceId
    ? invoices.find((invoice) => invoice.id === requestedInvoiceId)
    : null;
  const selectedInvoice =
    requested ??
    invoices.find((invoice) =>
      ["pending_payment", "open", "draft"].includes(
        invoice.status,
      ),
    ) ??
    invoices[0] ??
    null;

  if (!selectedInvoice) {
    return {
      invoices,
      selectedInvoice: null,
      selectedItems: [],
      selectedPayment: null,
    };
  }

  const [itemsResult, paymentResult] = await Promise.all([
    supabase
      .from("billing_invoice_items")
      .select(
        "id,camera_id,plan_code,description,billing_position,base_amount_cents,discount_basis_points,discount_amount_cents,total_amount_cents",
      )
      .eq("organization_id", organizationId)
      .eq("invoice_id", selectedInvoice.id)
      .order("billing_position", { ascending: true }),
    supabase
      .from("billing_pix_payments")
      .select(
        "id,invoice_id,status,txid,amount_cents,pix_copy_paste,qr_code_payload,bank_status,expires_at,confirmed_at,last_checked_at,check_attempts,error_code,error_message,created_at",
      )
      .eq("organization_id", organizationId)
      .eq("invoice_id", selectedInvoice.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (itemsResult.error) {
    throw new Error(
      `billing_invoice_items_unavailable:${itemsResult.error.message}`,
    );
  }

  if (paymentResult.error) {
    throw new Error(
      `billing_pix_unavailable:${paymentResult.error.message}`,
    );
  }

  const selectedItems: BillingInvoiceItem[] = (
    itemsResult.data ?? []
  ).map((item: any) => ({
    id: String(item.id),
    cameraId: item.camera_id ? String(item.camera_id) : null,
    planCode: planCode(item.plan_code),
    description: String(item.description),
    billingPosition:
      item.billing_position === null
        ? null
        : Number(item.billing_position),
    baseAmountCents: Number(item.base_amount_cents),
    discountBasisPoints: Number(
      item.discount_basis_points,
    ),
    discountAmountCents: Number(
      item.discount_amount_cents,
    ),
    totalAmountCents: Number(item.total_amount_cents),
  }));

  const payment = paymentResult.data as any;
  const selectedPayment: PixPaymentSummary | null = payment
    ? {
        id: String(payment.id),
        invoiceId: String(payment.invoice_id),
        status: String(payment.status),
        txid: payment.txid ? String(payment.txid) : null,
        amountCents: Number(payment.amount_cents),
        pixCopyPaste: payment.pix_copy_paste
          ? String(payment.pix_copy_paste)
          : null,
        qrCodePayload: payment.qr_code_payload
          ? String(payment.qr_code_payload)
          : null,
        bankStatus: payment.bank_status
          ? String(payment.bank_status)
          : null,
        expiresAt: payment.expires_at
          ? String(payment.expires_at)
          : null,
        confirmedAt: payment.confirmed_at
          ? String(payment.confirmed_at)
          : null,
        lastCheckedAt: payment.last_checked_at
          ? String(payment.last_checked_at)
          : null,
        checkAttempts: Number(payment.check_attempts),
        errorCode: payment.error_code
          ? String(payment.error_code)
          : null,
        errorMessage: payment.error_message
          ? String(payment.error_message)
          : null,
      }
    : null;

  return {
    invoices,
    selectedInvoice,
    selectedItems,
    selectedPayment,
  };
}
