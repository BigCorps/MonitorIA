import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { AssistantUsage } from "./contracts";
import { ZERO_ASSISTANT_USAGE } from "./deterministic";
import {
  answerDeterministicallyV2,
  planDeterministicallyV2,
} from "./deterministic-v2";
import {
  AssistantPlanV2Schema,
  type AssistantDirectoryV2,
  type AssistantHistoryItemV2,
  type AssistantPlanV2,
} from "./v2-contracts";

let client: OpenAI | null = null;
const model = "gpt-5-nano";

function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

function usageFromResponse(usage: any): AssistantUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    cachedInputTokens: usage?.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    reasoningTokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0,
  };
}

export function addAssistantUsage(left: AssistantUsage, right: AssistantUsage): AssistantUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningTokens: left.reasoningTokens + right.reasoningTokens,
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
  directory: AssistantDirectoryV2;
  history: AssistantHistoryItemV2[];
}) {
  const local = planDeterministicallyV2(input);
  if (local.understood) {
    return {
      plan: local.plan,
      responseId: null,
      usage: ZERO_ASSISTANT_USAGE,
      model,
      source: "deterministic_v2" as const,
      localConfidence: local.confidence,
    };
  }

  // A Pesquisa IA continua útil mesmo se a OpenAI estiver indisponível.
  // Somente a interpretação rara/ambígua perde o fallback.
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      plan: local.plan,
      responseId: null,
      usage: ZERO_ASSISTANT_USAGE,
      model,
      source: "deterministic_no_api" as const,
      localConfidence: local.confidence,
    };
  }

  const response = await getClient().responses.parse({
    model,
    store: false,
    max_output_tokens: 2200,
    prompt_cache_key: `monitoria-assistant-v2-plan-${input.organizationId}`,
    reasoning: { effort: "medium" },
    instructions: [
      "Você é somente o fallback de planejamento da Pesquisa IA MonitorIA 2.0.",
      "Nunca responda ao usuário; devolva apenas o plano estruturado.",
      "O backend executará todas as consultas e escreverá a resposta sem outra chamada de IA.",
      "Uma pergunta pode conter várias operações. Decomponha em até 6 operações independentes.",
      "Use apenas IDs existentes no directory e nunca invente organization_id.",
      "Use camera_health_current somente para estado atual. Para período passado use camera_health_history.",
      "Use attention_summary para perguntas sobre prioridade, alertas, incidentes ou o que merece atenção.",
      "Use cross_camera_sequence com fromCameraId/toCameraId quando a direção estiver explícita.",
      "Use visual_state quando a pergunta citar uma visualEntity do diretório.",
      "Use process_summary quando citar um processo operacional do diretório.",
      "Use search_events com zoneId quando uma zona configurada estiver explícita.",
      "Use period_summary para COUNT/RANK/PEAK/AVERAGE de métricas do período.",
      "Nunca gere SQL, nomes de tabelas ou código executável.",
      "Nunca planeje reconhecimento facial, identidade civil, emoção, gênero, crime, fraude ou intenção.",
      "Passagens entre câmeras são hipóteses não biométricas, não identidade.",
      "Objeto removido não significa furto; atividade após fechamento não significa ato oculto.",
      "Ausência de registros não prova ausência de acontecimento.",
      "Mantenha legacyPlan compatível com o contrato legado; operations carrega a composição 2.0.",
    ].join("\n"),
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          currentDate: input.currentDate,
          timezone: input.timezone,
          selectedFilters: {
            fromDate: input.selectedFrom,
            toDate: input.selectedTo,
            cameraId: input.selectedCameraId,
            siteId: input.selectedSiteId,
          },
          directory: input.directory,
          recentConversation: input.history.slice(-8),
          localAttempt: local,
          userMessage: input.message,
        }),
      }],
    }],
    text: { format: zodTextFormat(AssistantPlanV2Schema, "monitoria_assistant_v2_plan") },
  });

  const usage = usageFromResponse(response.usage);
  const parsed = AssistantPlanV2Schema.safeParse(response.output_parsed);
  return {
    plan: parsed.success ? parsed.data : local.plan,
    responseId: response.id,
    usage,
    model,
    source: parsed.success ? "openai_fallback_v2" as const : "deterministic_after_fallback" as const,
    localConfidence: local.confidence,
  };
}

export async function answerAssistantQuery(input: {
  organizationId: string;
  message: string;
  plan: AssistantPlanV2;
  retrievedData: unknown;
  allowedEvidenceIds: string[];
  history: AssistantHistoryItemV2[];
}) {
  return {
    answer: answerDeterministicallyV2(input),
    responseId: null,
    usage: ZERO_ASSISTANT_USAGE,
    model,
  };
}
