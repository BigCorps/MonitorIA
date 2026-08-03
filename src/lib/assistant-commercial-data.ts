import { createClient } from "@/src/lib/supabase/server";
import { createAdminClient } from "@/src/lib/supabase/admin";
import { sortAssistantPackages } from "@/src/assistant-commercial/format";
import type {
  AssistantBalance,
  AssistantCreditInvoiceView,
  AssistantCreditPackage,
  AssistantCreditPurchaseView,
  AssistantCreditsWorkspace,
} from "@/src/assistant-commercial/types";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function integer(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function parseAssistantBalance(value: unknown): AssistantBalance {
  const row = objectValue(value);
  const source = String(row.accessSource ?? "none");
  const allowedSources = new Set([
    "legacy",
    "trial",
    "subscription",
    "manual",
    "none",
  ]);

  return {
    organizationId: String(row.organizationId ?? ""),
    enforcementEnabled: row.enforcementEnabled === true,
    serviceAccessAllowed: row.serviceAccessAllowed === true,
    blockReason:
      row.blockReason === "subscription_or_trial_required" ||
      row.blockReason === "assistant_allowance_exhausted"
        ? row.blockReason
        : null,
    accessSource: allowedSources.has(source)
      ? (source as AssistantBalance["accessSource"])
      : "none",
    unlimited: row.unlimited === true,
    accessAllowed: row.accessAllowed === true,
    includedTotal: integer(row.includedTotal),
    includedUsed: integer(row.includedUsed),
    includedReserved: integer(row.includedReserved),
    includedRemaining: integer(row.includedRemaining),
    purchasedRemaining: integer(row.purchasedRemaining),
    purchasedReserved: integer(row.purchasedReserved),
    totalRemaining:
      row.totalRemaining === null || row.totalRemaining === undefined
        ? null
        : integer(row.totalRemaining),
    nextResetAt: nullableString(row.nextResetAt),
    nextPurchasedExpiryAt: nullableString(row.nextPurchasedExpiryAt),
    calculatedAt:
      nullableString(row.calculatedAt) ?? new Date().toISOString(),
  };
}

export async function getAssistantBalance(
  organizationId: string,
): Promise<AssistantBalance> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_assistant_balance", {
    p_organization_id: organizationId,
  });

  if (error) throw new Error(error.message);
  return parseAssistantBalance(data);
}

export async function getAssistantCreditsWorkspace(
  organizationId: string,
): Promise<AssistantCreditsWorkspace> {
  const admin = createAdminClient();
  const [balance, packagesResult, purchasesResult, invoiceItemsResult] =
    await Promise.all([
      getAssistantBalance(organizationId),
      admin
        .from("addon_catalog")
        .select(
          "code,display_name,description,amount_cents,currency,configuration",
        )
        .eq("is_active", true)
        .eq("billing_scope", "organization")
        .eq("configuration->>kind", "assistant_credit_pack"),
      admin
        .from("assistant_credit_purchases")
        .select(
          `
            id,
            package_code,
            purchased_interactions,
            remaining_interactions,
            amount_cents,
            status,
            valid_until,
            activated_at,
            created_at,
            invoice:billing_invoices(invoice_number,status)
          `,
        )
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(50),
      admin
        .from("billing_invoice_items")
        .select(
          `
            invoice_id,
            description,
            total_amount_cents,
            metadata,
            created_at,
            invoice:billing_invoices(invoice_number,status)
          `,
        )
        .eq("organization_id", organizationId)
        .eq("item_type", "assistant_credit_pack")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (packagesResult.error) throw new Error(packagesResult.error.message);
  if (purchasesResult.error) throw new Error(purchasesResult.error.message);
  if (invoiceItemsResult.error) throw new Error(invoiceItemsResult.error.message);

  const packages: AssistantCreditPackage[] = sortAssistantPackages(
    (packagesResult.data ?? []).map((item: any) => {
      const configuration = objectValue(item.configuration);
      return {
        code: String(item.code),
        displayName: String(item.display_name),
        description: String(item.description ?? ""),
        amountCents: integer(item.amount_cents),
        currency: "BRL",
        interactions: integer(configuration.interactions),
        validityDays: integer(configuration.validityDays, 365),
        sortOrder: integer(configuration.sortOrder),
      };
    }),
  );
  const packageByCode = new Map(packages.map((item) => [item.code, item]));

  const purchases: AssistantCreditPurchaseView[] = (
    purchasesResult.data ?? []
  ).map((item: any) => {
    const invoice = relationOne(item.invoice);
    const packageItem = item.package_code
      ? packageByCode.get(String(item.package_code))
      : null;
    return {
      id: String(item.id),
      packageCode: nullableString(item.package_code),
      displayName:
        packageItem?.displayName ??
        `${integer(item.purchased_interactions).toLocaleString("pt-BR")} interações extras`,
      purchasedInteractions: integer(item.purchased_interactions),
      remainingInteractions: integer(item.remaining_interactions),
      amountCents:
        item.amount_cents === null ? null : integer(item.amount_cents),
      status: String(item.status),
      validUntil: nullableString(item.valid_until),
      activatedAt: nullableString(item.activated_at),
      createdAt: String(item.created_at),
      invoiceNumber: nullableString((invoice as any)?.invoice_number),
      invoiceStatus: nullableString((invoice as any)?.status),
    };
  });

  const activePurchaseInvoiceIds = new Set(
    purchases
      .map((purchase) => purchase.invoiceNumber)
      .filter((value): value is string => Boolean(value)),
  );

  const pendingInvoices: AssistantCreditInvoiceView[] = (
    invoiceItemsResult.data ?? []
  ).flatMap((item: any) => {
    const invoice = relationOne(item.invoice);
    const status = String((invoice as any)?.status ?? "");
    const invoiceNumber = String((invoice as any)?.invoice_number ?? "");
    if (!invoiceNumber || !["draft", "open", "pending_payment"].includes(status)) {
      return [];
    }
    if (activePurchaseInvoiceIds.has(invoiceNumber)) return [];
    const metadata = objectValue(item.metadata);
    return [
      {
        invoiceId: String(item.invoice_id),
        invoiceNumber,
        packageCode: nullableString(metadata.packageCode),
        displayName: String(item.description),
        interactions: integer(metadata.interactions),
        amountCents: integer(item.total_amount_cents),
        status,
        createdAt: String(item.created_at),
      },
    ];
  });

  return { balance, packages, purchases, pendingInvoices };
}
