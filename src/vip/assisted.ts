export const VIP_ASSIST_COOKIE = "monitoria_vip_assist";

export const VIP_ASSIST_SECTIONS = [
  "inicio",
  "como_funciona",
  "evidencias",
  "inteligencia",
  "planos",
  "duvidas",
  "pronto",
] as const;

export type VipAssistSection = (typeof VIP_ASSIST_SECTIONS)[number];

export function vipAssistAlias(inviteId: string) {
  const compact = inviteId.replaceAll("-", "").slice(0, 8).toUpperCase();
  return `VIP-${compact || "ASSIST"}`;
}

export function isVipAssistSection(value: unknown): value is VipAssistSection {
  return VIP_ASSIST_SECTIONS.includes(String(value) as VipAssistSection);
}
