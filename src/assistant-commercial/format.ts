import type { AssistantBalance, AssistantCreditPackage } from "./types";

export function assistantBalanceLabel(balance: AssistantBalance) {
  if (balance.unlimited) return "Acesso de homologação";
  if (balance.blockReason === "subscription_or_trial_required") {
    return "Assinatura necessária";
  }
  if (!balance.accessAllowed) return "Sem interações disponíveis";
  return `${balance.totalRemaining ?? 0} interações disponíveis`;
}

export function assistantBalanceTone(balance: AssistantBalance) {
  if (balance.unlimited) return "legacy" as const;
  if (balance.blockReason === "subscription_or_trial_required") {
    return "blocked" as const;
  }
  const remaining = balance.totalRemaining ?? 0;
  if (remaining <= 0) return "blocked" as const;
  if (remaining <= 10) return "warning" as const;
  return "healthy" as const;
}

export function sortAssistantPackages(
  packages: AssistantCreditPackage[],
) {
  return [...packages].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.interactions - right.interactions,
  );
}
