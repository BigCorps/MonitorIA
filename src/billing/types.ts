export type CommercialPlanCode =
  | "basic"
  | "standard"
  | "intensive";

export type CommercialPlan = {
  code: CommercialPlanCode;
  displayName: string;
  shortDescription: string;
  amountCents: number;
  currency: "BRL";
  billingPeriodDays: number;
  metadataRetentionDays: number;
  longTermKeyframes: number;
  temporaryFrameDays: number;
  clipEnabled: boolean;
  clipDurationSeconds: number | null;
  clipRetentionDays: number | null;
  maximumAnalysisFrames: number;
  maximumEscalationPercent: number;
  features: Record<string, unknown>;
  sortOrder: number;
};

export type VolumeDiscountTier = {
  minimumPosition: number;
  maximumPosition: number | null;
  discountBasisPoints: number;
  label: string;
};

export type CameraPlanSelection = {
  cameraId: string;
  cameraName: string;
  planCode: CommercialPlanCode;
};

export type VolumePricingItem = {
  cameraId: string;
  cameraName: string;
  planCode: CommercialPlanCode;
  planName: string;
  billingPosition: number;
  baseAmountCents: number;
  discountBasisPoints: number;
  discountAmountCents: number;
  totalAmountCents: number;
};

export type VolumePricingResult = {
  calculationVersion: "volume-marginal-v1";
  currency: "BRL";
  cameraCount: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  items: VolumePricingItem[];
};

export type CameraSubscriptionSummary = {
  cameraId: string;
  planCode: CommercialPlanCode;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
};

export type DraftInvoiceItemSummary = {
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

export type DraftInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  createdAt: string;
  items: DraftInvoiceItemSummary[];
};

export type TrialSummary = {
  id: string;
  cameraId: string | null;
  selectedPlanCode: CommercialPlanCode | null;
  status: string;
  captureStartedAt: string | null;
  captureEndsAt: string | null;
  explorationEndsAt: string | null;
  interactionsUsed: number;
  interactionLimit: number;
};

export type AssistantAllowanceSummary = {
  id: string;
  source: string;
  periodStart: string;
  periodEnd: string;
  includedInteractions: number;
  usedInteractions: number;
  remainingInteractions: number;
};

export type BillingAccountSummary = {
  status: string;
  currency: string;
  gracePeriodDays: number;
  monthlyAssistantAllowance: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
};
