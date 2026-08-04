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

  if (
    candidate.startsWith("<svg") ||
    candidate.startsWith("<?xml")
  ) {
    return `data:image/svg+xml;charset=utf-8,${
      encodeURIComponent(candidate)
    }`;
  }

  const compact = candidate.replace(/\s+/g, "");

  // Evita tratar o próprio payload EMV do Pix como uma imagem
  // base64. Só formatos de imagem reconhecidos são aceitos.
  const mime =
    compact.startsWith("iVBORw0KGgo")
      ? "image/png"
      : compact.startsWith("/9j/")
        ? "image/jpeg"
        : compact.startsWith("UklGR")
          ? "image/webp"
          : compact.startsWith("PHN2Zy") ||
              compact.startsWith("PD94bW")
            ? "image/svg+xml"
            : null;

  if (!mime) return null;

  return `data:${mime};base64,${compact}`;
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
