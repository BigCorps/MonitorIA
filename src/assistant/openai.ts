import OpenAI from "openai";
import { createAdminClient } from "@/src/lib/supabase/admin";
import {
  configuredMonitoriaModel,
  resolveOrganizationAiTrack,
} from "@/src/ai/model-policy";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
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

async function modelForOrganization(organizationId: string) {
  const track = await resolveOrganizationAiTrack(
    createAdminClient(),
    organizationId,
  );
  return configuredMonitoriaModel(track);
}

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
  const model = await modelForOrganization(input.organizationId);
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
      "Para perguntas sobre provável criança, infância ou bebê, use search_events com apparentAgeGroup=child. Para provável adulto, use apparentAgeGroup=adult.",
      "Não existe classe adolescente separada nesta versão; nunca invente idade exata ou maioridade legal.",
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
  const model = await modelForOrganization(input.organizationId);
  return {
    answer: answerDeterministicallyV2(input),
    responseId: null,
    usage: ZERO_ASSISTANT_USAGE,
    model,
  };
}

const RecoveryTermsSchema = z.object({
  terms: z.array(z.string().trim().min(2).max(70)).max(3),
}).strict();

/**
 * Segunda interpretação, apenas após busca sem resultados. Não lê imagens,
 * não executa consultas nem decide se um evento é evidência.
 */
export async function suggestEmptySearchTerms(input: {
  organizationId: string;
  message: string;
  plan: AssistantPlanV2;
  history: AssistantHistoryItemV2[];
}) {
  const model = await modelForOrganization(input.organizationId);
  const response = await getClient().responses.parse({
    model,
    store: false,
    max_output_tokens: 850,
    reasoning: { effort: model === "gpt-5-nano" ? "minimal" : "low" },
    prompt_cache_key: "monitoria-assistant-zero-results",
    instructions: [
      "Você interpreta uma pesquisa de eventos que retornou zero registros.",
      "Forneça até três expressões curtas em português para pesquisar nos textos de eventos existentes.",
      "Use sinônimos concretos e próximos ao objeto da pergunta, sem inventar acontecimentos.",
      "Não responda à pergunta nem conclua que algo aconteceu.",
      "Não inclua datas, horários, câmeras, locais, SQL, diretivas, filtros, códigos ou nomes de pessoas nas expressões.",
      "Não use termos excessivamente genéricos como pessoa, evento, movimento ou atividade.",
      "Se não houver equivalência lexical segura, retorne a lista vazia.",
      "Uma menção textual sobre idade não comprova classificação etária visual.",
      "Os filtros de tempo, câmera e local são aplicados exclusivamente pelo servidor.",
    ].join("\n"),
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: JSON.stringify({
          message: input.message,
          interpretedQuery: input.plan.legacyPlan.query,
          subjects: input.plan.operations.map((op) => ({ kind: op.kind, subject: op.subject, age: op.apparentAgeGroup })),
          recentConversation: input.history.slice(-2).map(({ role, content }) => ({ role, content })),
        }),
      }],
    }],
    text: { format: zodTextFormat(RecoveryTermsSchema, "monitoria_empty_search_terms") },
  }, { timeout: 12000, maxRetries: 0 });
  const parsed = RecoveryTermsSchema.safeParse(response.output_parsed);
  return { terms: parsed.success ? parsed.data.terms : [], usage: usageFromResponse(response.usage), responseId: response.id };
}
