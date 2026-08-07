import { createAdminClient } from "@/src/lib/supabase/admin";

export type PlatformComponentState = "operational" | "degraded" | "checking";
export type PlatformComponent = { name: string; state: PlatformComponentState; detail: string };

export async function getPlatformStatus(): Promise<{
  generatedAt: string;
  overall: PlatformComponentState;
  components: PlatformComponent[];
}> {
  const generatedAt = new Date().toISOString();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("operational_refresh_runs")
      .select("status,started_at,finished_at,error_code")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;

    const ageMs = data?.finished_at
      ? Date.now() - new Date(data.finished_at).getTime()
      : Number.POSITIVE_INFINITY;
    const automationState: PlatformComponentState = !data
      ? "checking"
      : data.status === "completed" && ageMs <= 20 * 60 * 1000
        ? "operational"
        : "degraded";
    const components: PlatformComponent[] = [
      { name: "Aplicação web", state: "operational", detail: "Página e autenticação disponíveis." },
      { name: "Banco de dados", state: "operational", detail: "Consulta de integridade respondendo normalmente." },
      {
        name: "Automações operacionais",
        state: automationState,
        detail: automationState === "operational"
          ? "Último ciclo concluído dentro da janela esperada."
          : automationState === "checking"
            ? "Primeiro ciclo de integridade ainda não registrado."
            : "Último ciclo atrasado ou com falha; a equipe deve verificar.",
      },
      { name: "Atendimento", state: "operational", detail: "Central de ajuda e WhatsApp disponíveis." },
    ];
    const overall = components.some((component) => component.state === "degraded")
      ? "degraded"
      : components.some((component) => component.state === "checking")
        ? "checking"
        : "operational";
    return { generatedAt, overall, components };
  } catch {
    return {
      generatedAt,
      overall: "degraded",
      components: [
        { name: "Aplicação web", state: "operational", detail: "Página pública disponível." },
        { name: "Banco de dados", state: "degraded", detail: "A verificação de integridade não respondeu." },
        { name: "Automações operacionais", state: "checking", detail: "Estado não confirmado nesta consulta." },
        { name: "Atendimento", state: "operational", detail: "Central de ajuda e WhatsApp disponíveis." },
      ],
    };
  }
}

