import type {
  AnalyzeEventInput,
  VisionAnalysisMode,
} from "./types";

function modeInstructions(mode: VisionAnalysisMode) {
  if (mode === "economic") {
    return [
      "Modo Econômico: seja extremamente conciso.",
      "Use no máximo uma observação principal e até cinco tags.",
      "Só descreva entidades necessárias para sustentar o acontecimento.",
      "Mantenha o resumo preferencialmente abaixo de 220 caracteres.",
    ];
  }

  if (mode === "detailed") {
    return [
      "Modo Detalhado: use todos os quadros para reconstruir a sequência temporal.",
      "Diferencie início, mudança principal, pico e encerramento quando visíveis.",
      "Registre entidades e objetos relevantes sem extrapolar o que aparece.",
      "Mantenha o resumo objetivo, mesmo com maior riqueza de detalhes.",
    ];
  }

  return [
    "Modo Equilibrado: descreva o acontecimento com contexto suficiente e sem redundância.",
    "Use até três observações principais.",
    "Registre pessoas, veículos e objetos somente quando contribuírem para a pesquisa futura.",
  ];
}

export function buildVisionInstructions(
  mode: VisionAnalysisMode = "balanced",
): string {
  return [
    "Você analisa eventos de câmeras estáticas para o MonitorIA.",
    "Descreva somente fatos visualmente sustentados pelos quadros e pelo contexto fornecido.",
    "Não faça reconhecimento facial e não tente identificar pessoas reais.",
    "Para pessoas, use somente posição, zonas, ações, roupas, cores e objetos carregados.",
    "Classifique role=staff, customer, delivery_person, visitor ou unknown usando apenas a função espacial da zona e a atividade observada.",
    "Uma pessoa na zona com personRoleHint=staff, operando terminal ou permanecendo no lado interno pode ser staff.",
    "Uma pessoa na zona com personRoleHint=customer, aproximando-se do atendimento, pode ser customer.",
    "Use delivery_person somente quando houver entrega ou retirada observável; visitor quando houver circulação sem relação clara; caso contrário unknown.",
    "Nunca determine papel por rosto, identidade ou uma roupa específica.",
    "O título headline deve ser curto, específico e descrever a ação principal, por exemplo: Atendimento com pacote no balcão, Cliente entrou na loja, Objeto retirado do balcão ou Atividade no terminal.",
    "Não use Pessoa presente como headline quando houver uma ação mais específica.",
    "Escolha primaryEventType pela seguinte prioridade quando visualmente sustentado: objeto removido/movido/apareceu; pessoa entrou/saiu; veículo entrou/saiu/parou; zona restrita/atividade incomum; mudança de cena; somente então mera presença.",
    "person_present e vehicle_present só devem ser usados quando nenhuma transição ou interação mais específica for sustentada.",
    "Leitura de placas está desativada nesta versão. Use plateSuggestion=null para todos os veículos.",
    "Não afirme crime, roubo, agressão ou intenção. Use possível atividade incomum e marque requiresReview quando necessário.",
    "Use somente IDs de zonas presentes no perfil. Não invente IDs.",
    "Se não houver mudança relevante, use primaryEventType=no_relevant_change.",
    ...modeInstructions(mode),
    "Retorne dados objetivos e consistentes com o esquema estruturado.",
  ].join("\n");
}

export function buildVisionStableContext(
  input: AnalyzeEventInput,
): string {
  return JSON.stringify(
    {
      cameraProfile: {
        cameraId: input.profile.cameraId,
        profileVersion: input.profile.profileVersion,
        environmentDescription:
          input.profile.environmentDescription,
        monitoringGoals: input.profile.monitoringGoals,
        ignoreInstructions:
          input.profile.ignoreInstructions,
        timezone: input.profile.timezone,
        zones: input.profile.zones.map((zone) => ({
          id: zone.id,
          name: zone.name,
          type: zone.type,
          personRoleHint: zone.personRoleHint,
          description: zone.description,
        })),
      },
      analysisMode: input.analysisMode ?? "balanced",
    },
    null,
    2,
  );
}

export function buildVisionEventContext(
  input: AnalyzeEventInput,
): string {
  return JSON.stringify(
    {
      event: {
        id: input.eventId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        localMetrics: input.localMetrics,
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

export function buildVisionContext(
  input: AnalyzeEventInput,
): string {
  return `${buildVisionStableContext(
    input,
  )}\n${buildVisionEventContext(input)}`;
}
