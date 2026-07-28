import type { AnalyzeEventInput } from "./types.js";

export function buildVisionInstructions(): string {
  return [
    "Você analisa eventos de câmeras estáticas para o MonitorIA.",
    "Descreva somente fatos visualmente sustentados pelos quadros e pelo contexto fornecido.",
    "Não faça reconhecimento facial e não tente identificar pessoas reais.",
    "Para pessoas, use apenas roupas, cores, objetos carregados, movimento e zonas.",
    "Placas são apenas sugestões: preencha text somente quando houver caracteres visualmente plausíveis; nunca trate como confirmação.",
    "Não afirme crime, roubo, agressão ou intenção. Use 'possível atividade incomum' e marque requiresReview quando necessário.",
    "Use os IDs exatos das zonas fornecidas. Não invente IDs.",
    "Se não houver mudança relevante, use primaryEventType=no_relevant_change.",
    "Retorne dados objetivos, curtos e consistentes com o esquema.",
  ].join("\n");
}

export function buildVisionContext(input: AnalyzeEventInput): string {
  return JSON.stringify(
    {
      event: {
        id: input.eventId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        localMetrics: input.localMetrics,
      },
      cameraProfile: {
        cameraId: input.profile.cameraId,
        profileVersion: input.profile.profileVersion,
        environmentDescription: input.profile.environmentDescription,
        monitoringGoals: input.profile.monitoringGoals,
        ignoreInstructions: input.profile.ignoreInstructions,
        timezone: input.profile.timezone,
        zones: input.profile.zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          type: zone.type,
          description: zone.description,
        })),
      },
      frameOrder: input.frames.map((frame) => ({
        label: frame.label,
        capturedAt: frame.capturedAt,
      })),
    },
    null,
    2,
  );
}
