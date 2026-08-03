export type PixPaymentStatus =
  | "pending"
  | "confirmed"
  | "expired"
  | "cancelled"
  | "failed"
  | "manual_review";

export function normalizeQrCodeSource(
  value: string | null | undefined,
) {
  const candidate = String(value ?? "").trim();
  if (!candidate) return null;

  if (
    candidate.startsWith("data:image/") ||
    candidate.startsWith("https://") ||
    candidate.startsWith("http://")
  ) {
    return candidate;
  }

  return `data:image/png;base64,${candidate}`;
}

export function paymentCanGenerate(
  invoiceStatus: string,
  paymentStatus?: string | null,
) {
  if (invoiceStatus === "paid") return false;

  return !paymentStatus ||
    ["expired", "cancelled", "failed"].includes(paymentStatus);
}

export function paymentNeedsPolling(status: string | null) {
  return status === "pending";
}

export function pixStatusLabel(status: string) {
  const labels: Record<string, string> = {
    draft: "Aguardando geração",
    open: "Disponível para pagamento",
    pending_payment: "Aguardando pagamento",
    pending: "Aguardando pagamento",
    confirmed: "Pago",
    paid: "Pago",
    expired: "Expirado",
    cancelled: "Cancelado",
    failed: "Falha na geração",
    manual_review: "Em revisão",
    void: "Anulado",
  };

  return labels[status] ?? status;
}
