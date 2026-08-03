import type { CommercialPlanCode } from "./types";

export type BillingInvoiceListItem = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  dueAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type BillingInvoiceItem = {
  id: string;
  cameraId: string | null;
  planCode: CommercialPlanCode | null;
  description: string;
  billingPosition: number | null;
  baseAmountCents: number;
  discountBasisPoints: number;
  discountAmountCents: number;
  totalAmountCents: number;
};

export type PixPaymentSummary = {
  id: string;
  invoiceId: string;
  status: string;
  txid: string | null;
  amountCents: number;
  pixCopyPaste: string | null;
  qrCodePayload: string | null;
  bankStatus: string | null;
  expiresAt: string | null;
  confirmedAt: string | null;
  lastCheckedAt: string | null;
  checkAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
};

export type BillingDashboardData = {
  invoices: BillingInvoiceListItem[];
  selectedInvoice: BillingInvoiceListItem | null;
  selectedItems: BillingInvoiceItem[];
  selectedPayment: PixPaymentSummary | null;
};
