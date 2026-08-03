export type AiOperationalStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "insufficient_data";

export function basisPoints(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return 0;
  if (denominator <= 0) return 0;
  return Math.round((numerator * 10_000) / denominator);
}

export function projectedCostStatus(
  utilizationBasisPoints: number | null,
  warningPercent: number,
  criticalPercent: number,
): AiOperationalStatus {
  if (utilizationBasisPoints === null) return "insufficient_data";
  if (utilizationBasisPoints >= criticalPercent * 100) return "critical";
  if (utilizationBasisPoints >= warningPercent * 100) return "warning";
  return "healthy";
}

export function escalationStatus(
  escalationRateBasisPoints: number,
  maximumEscalationPercent: number,
): Exclude<AiOperationalStatus, "insufficient_data"> {
  const limitBasisPoints = Math.max(0, maximumEscalationPercent * 100);

  if (limitBasisPoints === 0) {
    return escalationRateBasisPoints > 0 ? "critical" : "healthy";
  }

  if (escalationRateBasisPoints > limitBasisPoints) return "critical";
  if (escalationRateBasisPoints >= Math.round(limitBasisPoints * 0.8)) {
    return "warning";
  }

  return "healthy";
}

export function overallStatus(statuses: AiOperationalStatus[]): AiOperationalStatus {
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("insufficient_data")) return "insufficient_data";
  return "healthy";
}

export function statusLabel(status: AiOperationalStatus) {
  if (status === "critical") return "Crítico";
  if (status === "warning") return "Atenção";
  if (status === "insufficient_data") return "Dados insuficientes";
  return "Saudável";
}
