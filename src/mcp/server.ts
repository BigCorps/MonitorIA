import { McpServer } from "@modelcontextprotocol/server";
import {
  AskMonitoriaInputSchema,
  ComparePeriodsInputSchema,
  GetCameraOverviewInputSchema,
  GetCapabilitiesInputSchema,
  GetEventDetailsInputSchema,
  GetEvidenceInputSchema,
  GetOperationalSummaryInputSchema,
  GetRoutineSummaryInputSchema,
  GetSessionDetailsInputSchema,
  GetVisualStateInputSchema,
  ListCamerasInputSchema,
  ListSitesInputSchema,
  SearchEventsInputSchema,
  SearchInsightsInputSchema,
  SearchSessionsInputSchema,
} from "./contracts";
import {
  MCP_AUDITED_QUERY_ANNOTATIONS,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
} from "./constants";
import type { McpAuthContext } from "./auth";
import {
  askMonitoria,
  comparePeriods,
  executeMcpDataTool,
  getCameraOverview,
  getEventDetails,
  getEvidence,
  getMonitoriaCapabilities,
  getOperationalSummary,
  getSessionDetails,
  getVisualState,
  listCameras,
  listSites,
  searchEvents,
  searchInsights,
  searchOperationalSessions,
} from "./data";
import { getRoutineSummary } from "./routines";
import { toolError, toolResult } from "./envelope";

function safeTool(
  context: McpAuthContext,
  name: string,
  handler: (args: any) => Promise<any>,
) {
  return async (args: any) => {
    let organizationId: string | null = null;
    try {
      organizationId = args?.organization_id ?? null;
      const envelope = await executeMcpDataTool(
        context,
        name,
        args,
        () => handler(args),
        organizationId,
      );
      return toolResult(envelope);
    } catch (error) {
      const code = error instanceof Error ? error.message : "tool_error";
      const messages: Record<string, string> = {
        organization_id_required:
          "Informe organization_id porque mais de uma organização foi autorizada.",
        organization_not_authorized:
          "A organização não foi autorizada para este cliente MCP.",
        invalid_date_range: "O período informado é inválido.",
        invalid_cursor: "O cursor de paginação é inválido.",
        event_not_found: "Acontecimento não encontrado ou sem acesso.",
        session_not_found: "Período não encontrado ou sem acesso.",
        camera_not_found: "Câmera não encontrada ou sem acesso.",
        routine_summary_failed:
          "Não foi possível consultar as rotinas desta organização.",
      };
      return toolError(
        messages[code] ?? "A consulta não pôde ser concluída.",
        code,
      );
    }
  };
}

export function createMonitoriaMcpServer(context: McpAuthContext) {
  const server = new McpServer(
    {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
    },
    {
      instructions:
        "Use list_sites e list_cameras para resolver escopo. As ferramentas não alteram dados operacionais, mas cada chamada registra uma auditoria interna privada. Trate pessoas e veículos como correspondências prováveis, nunca identidades. Em rotinas, diferencie horário informado, padrão aprendido e comportamento observado. Só solicite get_evidence quando imagens forem realmente necessárias.",
    },
  );

  server.registerTool(
    "get_monitoria_capabilities",
    {
      title: "Capacidades do MonitorIA",
      description:
        "Lista organizações autorizadas, módulos disponíveis e limitações atuais. Use no início quando o escopo ou as capacidades não estiverem claros.",
      inputSchema: GetCapabilitiesInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_monitoria_capabilities", (args) =>
      getMonitoriaCapabilities(context, args),
    ),
  );

  server.registerTool(
    "list_sites",
    {
      title: "Listar locais",
      description:
        "Lista os locais da organização autorizada, incluindo fuso horário.",
      inputSchema: ListSitesInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "list_sites", (args) => listSites(context, args)),
  );

  server.registerTool(
    "list_cameras",
    {
      title: "Listar câmeras",
      description:
        "Lista câmeras, status, plano, modo de inteligência e configuração operacional básica.",
      inputSchema: ListCamerasInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "list_cameras", (args) => listCameras(context, args)),
  );

  server.registerTool(
    "get_camera_overview",
    {
      title: "Visão geral da câmera",
      description:
        "Retorna uma visão consolidada da câmera: acontecimento mais recente, estados, horários, períodos, continuidade, veículos e insights disponíveis.",
      inputSchema: GetCameraOverviewInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_camera_overview", (args) =>
      getCameraOverview(context, args),
    ),
  );

  server.registerTool(
    "search_events",
    {
      title: "Pesquisar acontecimentos",
      description:
        "Pesquisa a linha do tempo visual por período, texto, câmera, local, tipo, confiança, pessoas, veículos e revisão.",
      inputSchema: SearchEventsInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "search_events", (args) => searchEvents(context, args)),
  );

  server.registerTool(
    "get_event_details",
    {
      title: "Detalhes do acontecimento",
      description:
        "Obtém observações, pessoas, veículos, ações simultâneas, continuidade e revisão de um acontecimento específico.",
      inputSchema: GetEventDetailsInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_event_details", (args) =>
      getEventDetails(context, args),
    ),
  );

  server.registerTool(
    "search_operational_sessions",
    {
      title: "Pesquisar períodos",
      description:
        "Pesquisa atendimentos, entregas, visitas, atividades da equipe, equipamentos e procedimentos consolidados em períodos relacionados.",
      inputSchema: SearchSessionsInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "search_operational_sessions", (args) =>
      searchOperationalSessions(context, args),
    ),
  );

  server.registerTool(
    "get_session_details",
    {
      title: "Detalhes do período",
      description:
        "Retorna registros relacionados, participantes prováveis, resultados visuais e evidências de um período.",
      inputSchema: GetSessionDetailsInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_session_details", (args) =>
      getSessionDetails(context, args),
    ),
  );

  server.registerTool(
    "get_visual_state",
    {
      title: "Consultar estados visuais",
      description:
        "Consulta estado atual e histórico de transições de portões, portas, armários, equipamentos, objetos e áreas configuradas.",
      inputSchema: GetVisualStateInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_visual_state", (args) =>
      getVisualState(context, args),
    ),
  );

  server.registerTool(
    "get_routine_summary",
    {
      title: "Consultar rotinas",
      description:
        "Consulta separadamente horários informados pelo cliente, padrões aprendidos, observações e diferenças em relação ao esperado ou habitual.",
      inputSchema: GetRoutineSummaryInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_routine_summary", (args) =>
      getRoutineSummary(context, args),
    ),
  );

  server.registerTool(
    "get_operational_summary",
    {
      title: "Resumo operacional",
      description:
        "Consolida acontecimentos, períodos, estados, abertura e fechamento, pessoas prováveis, veículos prováveis e insights em um período.",
      inputSchema: GetOperationalSummaryInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_operational_summary", (args) =>
      getOperationalSummary(context, args),
    ),
  );

  server.registerTool(
    "compare_periods",
    {
      title: "Comparar períodos",
      description:
        "Compara dois intervalos usando acontecimentos, períodos e os insights operacionais disponíveis.",
      inputSchema: ComparePeriodsInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "compare_periods", (args) => comparePeriods(context, args)),
  );

  server.registerTool(
    "get_evidence",
    {
      title: "Obter evidências visuais",
      description:
        "Gera URLs assinadas e temporárias para imagens de acontecimentos ou períodos. Use apenas quando a evidência visual for necessária.",
      inputSchema: GetEvidenceInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "get_evidence", (args) => getEvidence(context, args)),
  );

  server.registerTool(
    "search_insights",
    {
      title: "Pesquisar insights operacionais",
      description:
        "Pesquisa insights operacionais já produzidos pelo MonitorIA, com filtros por tipo, severidade, estado, período, local e câmera.",
      inputSchema: SearchInsightsInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "search_insights", (args) => searchInsights(context, args)),
  );

  server.registerTool(
    "ask_monitoria",
    {
      title: "Perguntar ao MonitorIA",
      description:
        "Roteia deterministicamente uma pergunta operacional para dados estruturados do MonitorIA. A IA cliente redige a resposta final sem uma nova chamada de LLM no servidor.",
      inputSchema: AskMonitoriaInputSchema.shape,
      annotations: MCP_AUDITED_QUERY_ANNOTATIONS,
    },
    safeTool(context, "ask_monitoria", (args) => askMonitoria(context, args)),
  );

  return server;
}
