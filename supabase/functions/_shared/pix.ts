export const PAID_BANK_STATUSES = new Set([
  "CONCLUIDA",
  "PAGO",
  "REALIZADO",
]);

export function normalizeBankStatus(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const cleaned = value
    .trim()
    .replace(/\s/g, "")
    .replace(/^R\$/i, "");

  if (!cleaned) return null;

  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function bankAmountToCents(data: unknown): number | null {
  const object =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  const valor = object.valor;
  const amount = object.amount;

  const candidates: unknown[] = [
    object.valorPago,
    object.paidAmount,
    valor && typeof valor === "object"
      ? (valor as Record<string, unknown>).original
      : valor,
    amount && typeof amount === "object"
      ? (amount as Record<string, unknown>).original
      : amount,
  ];

  for (const candidate of candidates) {
    const numeric = numericValue(candidate);
    if (numeric !== null) return Math.round(numeric * 100);
  }

  return null;
}

export function bankResponseData(value: unknown) {
  const object =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const nested = object.data;
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as Record<string, unknown>)
    : object;
}

export function qrCodeSource(value: unknown): string | null {
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
