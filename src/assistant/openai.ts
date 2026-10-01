import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  AssistantPlanSchema,
  type AssistantDirectory,
  type AssistantHistoryItem,
  type AssistantPlan,
  type AssistantUsage,
} from "./contracts";
import {
  ZERO_ASSISTANT_USAGE,
  answerDeterministically,
  planDeterministically,
} from "./deterministic";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return client;
}

/**
 * Fallback deliberadamente fixo em nano.
 *
 * A Pesquisa IA resolve primeiro a pergunta localmente. OpenAI só é chamada
 * quando o motor determinístico não consegue produzir um plano com confiança
 * suficiente. Não existe fallback para mini nesta camada.
 */
const model = "gpt-5-nano";

function usageFromResponse(
  usage:
    | {
        input_tokens?: number;
        input_tokens_details?: {
          cached_tokens?: number;
        };
        output_tokens?: number;
        output_tokens_details?: {
          reasoning_tokens?: number;
        };
        total_tokens?: number;
      }
    | null
    | undefined,
): AssistantUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens:
      usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    reasoningTokens:
      usage?.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

export function addAssistantUsage(
  left: AssistantUsage,
  right: AssistantUsage,
): AssistantUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens:
      left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens:
      left.reasoningTokens + right.reasoningTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

export async function planAssistantQuery(input: {
  organizationId: string;
  message: string;
  currentDate: string;
  timezone: string;
  selectedFrom: string | null;
  selectedTo: string | null;
  selectedCameraId: string | null;
  selectedSiteId: string | null;
  directory: AssistantDirectory;
  history: AssistantHistoryItem[];
}) {
  const local = planDeterministically({
    message: input.message,
    currentDate: input.currentDate,
    timezone: input.timezone,
    selectedFrom: input.selectedFrom,
    selectedTo: input.selectedTo,
    selectedCameraId: input.selectedCameraId,
    selectedSiteId: input.selectedSiteId,
    directory: input.directory,
    history: input.history,
  });

  if (local.understood) {
    return {
      plan: local.plan,
      responseId: null,
      usage: ZERO_ASSISTANT_USAGE,
      model,
      source: "deterministic" as const,
      localConfidence: local.confidence,
    };
  }

  const requestPlan = (maxOutputTokens: number) =>
    getClient().responses.parse({
      model,
      store: false,
      max_output_tokens: maxOutputTokens,
      prompt_cache_key: `monitoria-assistant-fallback-plan-${input.organizationId}`,
      // O fallback é raro. Quando necessário, usa mais raciocínio do que o
      // antigo caminho "minimal" para maximizar a chance de uma única chamada
      // resolver a ambiguidade sem precisar de outra IA para redigir resposta.
      reasoning: { effort: "medium" },
      instructions: [
        "Você é SOMENTE o fallback de interpretação da Pesquisa IA MonitorIA.",
        "Não responda a pergunta do usuário. Produza apenas o plano estruturado solicitado.",
        "O backend fará consultas determinísticas e escreverá a resposta sem outra chamada de IA.",
        "Escolha operating_hours para abertura, fechamento, horário real de funcionamento, duração aberta, atraso ou fechamento antecipado.",
        "Escolha visual_state para estado atual ou histórico de porta, portão, caixa, gaveta, armário, equipamento, iluminação ou área configurada.",
        "Escolha continuity_summary para pessoas/clientes distintos prováveis ou registros provavelmente pertencentes à mesma visita.",
        "Escolha interaction_sessions para atendimentos, entregas, visitas ou procedimentos compostos por vários registros.",
        "Escolha interaction_summary para quantidades de interações/atendimentos distintos prováveis.",
        "Escolha vehicle_continuity para veículos distintos prováveis, permanência, retorno ou aparições relacionadas.",
        "Escolha cross_camera_sequence para passagem, direção ou sequência provável entre câmeras do mesmo local.",
        "Escolha routine_deviation para diferenças em relação à rotina, horários habituais, volumes fora da faixa ou atividade após fechamento.",
        "Escolha staff_activity para atividade ou padrões de funcionários prováveis, sem identidade civil.",
        "Escolha queue_analysis para fila, espera ou pico de fila.",
        "Escolha object_history para aparecimento, ausência, remoção ou deslocamento de objetos.",
        "Escolha equipment_history para histórico/mudança de estado de equipamentos.",
        "Escolha camera_health para câmera offline, escura, desfocada, obstruída, movida ou sem observação recente.",
        "Escolha daily_operations para um resumo do dia combinando acontecimentos, rotinas, processos e saúde.",
        "Escolha period_summary para contagens, métricas, câmera com mais eventos ou panorama de um período.",
        "Escolha search_events quando o usuário pedir uma lista/localização de acontecimentos específicos.",
        "Escolha compare_periods somente quando houver comparação explícita.",
        "Escolha general_help apenas para capacidades/uso da Pesquisa IA.",
        "Datas são inclusivas e absolutas no formato YYYY-MM-DD.",
        "Resolva hoje, ontem, semana e expressões semelhantes usando currentDate/timezone.",
        "Se não houver período explícito, use currentDate como início e fim.",
        "Use somente IDs presentes no directory. Nunca invente organization_id, site_id ou camera_id.",
        "Filtros selecionados na interface têm prioridade.",
        "live_camera é monitoramento contínuo; local_recording é gravação histórica.",
        "Nunca escolha camera_health ou cross_camera_sequence para uma seleção composta apenas por local_recording.",
        "Defina wantsChart=true apenas se o usuário pedir gráfico/visualização.",
        "Nunca planeje reconhecimento facial, identidade civil, emoção, gênero, crime, fraude ou intenção.",
        "Aparições não são pessoas únicas e sinais de atendimento não confirmam venda.",
        "A query deve conter termos objetivos curtos; nunca SQL, operadores SQL ou nomes de tabelas.",
        "Responda somente no esquema estruturado solicitado.",
      ].join("\n"),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(
                {
                  currentDate: input.currentDate,
                  timezone: input.timezone,
                  selectedFilters: {
                    fromDate: input.selectedFrom,
                    toDate: input.selectedTo,
                    cameraId: input.selectedCameraId,
                    siteId: input.selectedSiteId,
                  },
                  directory: input.directory,
                  recentConversation: input.history,
                  localAttempt: {
                    confidence: local.confidence,
                    reason: local.reason,
                    proposedPlan: local.plan,
                  },
                  userMessage: input.message,
                },
                null,
                2,
              ),
            },
          ],
        },
      ],
      text: {
        format: zodTextFormat(
          AssistantPlanSchema,
          "monitoria_assistant_fallback_plan",
        ),
      },
    });

  // Uma única chamada de fallback. Reservamos tokens suficientes já na
  // primeira tentativa para não transformar uma pergunta ambígua em duas
  // chamadas pagas. Se ainda assim o plano vier incompleto, usamos o plano
  // local conservador em vez de repetir a API.
  const response = await requestPlan(1600);
  const usage = usageFromResponse(response.usage);

  if (!response.output_parsed) {
    // Mesmo quando o fallback falha, não dispara uma segunda família/modelo.
    // Usa o plano local conservador para manter a pesquisa disponível.
    return {
      plan: local.plan,
      responseId: response.id,
      usage,
      model,
      source: "deterministic_after_fallback" as const,
      localConfidence: local.confidence,
    };
  }

  return {
    plan: AssistantPlanSchema.parse(
      response.output_parsed,
    ) as AssistantPlan,
    responseId: response.id,
    usage,
    model,
    source: "openai_fallback" as const,
    localConfidence: local.confidence,
  };
}

/**
 * A redação da resposta não chama OpenAI.
 *
 * O conteúdo é montado a partir dos dados estruturados já recuperados pelo
 * endpoint, com frases específicas para fato observado, cálculo, desvio e
 * inferência limitada. Assim a pergunta simples custa 0 chamadas de LLM e a
 * pergunta ambígua custa, no máximo, a chamada do planner acima.
 */
export async function answerAssistantQuery(input: {
  organizationId: string;
  message: string;
  plan: AssistantPlan;
  retrievedData: unknown;
  allowedEvidenceIds: string[];
  history: AssistantHistoryItem[];
}) {
  const answer = answerDeterministically({
    message: input.message,
    plan: input.plan,
    retrievedData: input.retrievedData,
    allowedEvidenceIds: input.allowedEvidenceIds,
  });

  return {
    answer,
    responseId: null,
    usage: ZERO_ASSISTANT_USAGE,
    model,
  };
}
