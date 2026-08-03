export type AssistantBalance = {
  organizationId: string;
  enforcementEnabled: boolean;
  serviceAccessAllowed: boolean;
  blockReason: "subscription_or_trial_required" | "assistant_allowance_exhausted" | null;
  accessSource: "legacy" | "trial" | "subscription" | "manual" | "none";
  unlimited: boolean;
  accessAllowed: boolean;
  includedTotal: number;
  includedUsed: number;
  includedReserved: number;
  includedRemaining: number;
  purchasedRemaining: number;
  purchasedReserved: number;
  totalRemaining: number | null;
  nextResetAt: string | null;
  nextPurchasedExpiryAt: string | null;
  calculatedAt: string;
};

export type AssistantCreditPackage = {
  code: string;
  displayName: string;
  description: string;
  amountCents: number;
  currency: "BRL";
  interactions: number;
  validityDays: number;
  sortOrder: number;
};

export type AssistantCreditPurchaseView = {
  id: string;
  packageCode: string | null;
  displayName: string;
  purchasedInteractions: number;
  remainingInteractions: number;
  amountCents: number | null;
  status: string;
  validUntil: string | null;
  activatedAt: string | null;
  createdAt: string;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
};

export type AssistantCreditInvoiceView = {
  invoiceId: string;
  invoiceNumber: string;
  packageCode: string | null;
  displayName: string;
  interactions: number;
  amountCents: number;
  status: string;
  createdAt: string;
};

export type AssistantCreditsWorkspace = {
  balance: AssistantBalance;
  packages: AssistantCreditPackage[];
  purchases: AssistantCreditPurchaseView[];
  pendingInvoices: AssistantCreditInvoiceView[];
};
