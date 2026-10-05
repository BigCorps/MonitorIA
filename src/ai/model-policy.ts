export type MonitoriaAiTrack = "standard" | "vip";

export const STANDARD_OPENAI_MODEL = "gpt-5-nano";
export const VIP_OPENAI_MODEL = "gpt-6-luna";

function supportedModel(value: string) {
  return (
    value === "gpt-5-nano" ||
    value.startsWith("gpt-5-nano-") ||
    value === "gpt-6-luna" ||
    value.startsWith("gpt-6-luna-")
  );
}

export function normalizeMonitoriaModel(
  value: string | null | undefined,
  fallback = STANDARD_OPENAI_MODEL,
) {
  const candidate = value?.trim();
  return candidate && supportedModel(candidate) ? candidate : fallback;
}

/**
 * Mantém o produto padrão em GPT-5 nano durante o piloto e libera Luna
 * somente para organizações vinculadas a um Projeto VIP.
 *
 * As variáveis novas são intencionais: valores VISION_MODEL_* antigos não
 * podem promover o produto inteiro silenciosamente.
 */
export function configuredMonitoriaModel(
  track: MonitoriaAiTrack,
  legacyCandidate?: string | null,
) {
  if (track === "vip") {
    return normalizeMonitoriaModel(
      process.env.MONITORIA_VIP_OPENAI_MODEL,
      VIP_OPENAI_MODEL,
    );
  }

  const explicit = process.env.MONITORIA_STANDARD_OPENAI_MODEL?.trim();
  if (explicit) {
    return normalizeMonitoriaModel(explicit, STANDARD_OPENAI_MODEL);
  }

  const legacy = legacyCandidate?.trim();
  return legacy && (legacy === "gpt-5-nano" || legacy.startsWith("gpt-5-nano-"))
    ? legacy
    : STANDARD_OPENAI_MODEL;
}

export function monitoriaTrackForModel(model: string): MonitoriaAiTrack {
  return model === "gpt-6-luna" || model.startsWith("gpt-6-luna-")
    ? "vip"
    : "standard";
}

export function visionReasoningEffortForModel(
  model: string,
): "minimal" | "low" {
  return monitoriaTrackForModel(model) === "vip" ? "low" : "minimal";
}

/**
 * Projeto VIP, e não o plano Intensive isoladamente, decide o track.
 * Assim um cliente padrão no plano Detalhada continua no modelo padrão.
 */
export async function resolveOrganizationAiTrack(
  supabase: any,
  organizationId: string,
): Promise<MonitoriaAiTrack> {
  const { data, error } = await supabase
    .from("vip_projects")
    .select("id")
    .eq("organization_id", organizationId)
    .neq("status", "cancelled")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Falha ao resolver track de IA VIP:", error.message);
    return "standard";
  }

  return data ? "vip" : "standard";
}
