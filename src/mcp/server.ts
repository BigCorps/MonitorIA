import { McpServer } from "@modelcontextprotocol/server";
import {
  AskMonitoriaInputSchema,
  ComparePeriodsInputSchema,
  GetCameraOverviewInputSchema,
  GetCapabilitiesInputSchema,
  GetEventDetailsInputSchema,
  GetEvidenceInputSchema,
  GetOperationalSummaryInputSchema,
  GetSessionDetailsInputSchema,
  GetVisualStateInputSchema,
  ListCamerasInputSchema,
  ListSitesInputSchema,
  SearchEventsInputSchema,
  SearchInsightsInputSchema,
  SearchSessionsInputSchema,
} from "./contracts";
import {
  MCP_READ_ONLY_ANNOTATIONS,
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
        event_not_found: "Evento não encontrado ou sem acesso.",
        session_not_found: "Sessão não encontrada ou sem acesso.",
        camera_not_found: "Câmera não encontrada ou sem acesso.",
      };
      return toolError(messages[code] ?? "A consulta não pôde ser concluída.", code);
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
        "Use list_sites e list_cameras para resolver escopo. Todas as ferramentas são somente leitura. Trate pessoas e veículos como correspondências prováveis, nunca identidades. Só solicite get_evidence quando imagens forem realmente necessárias.",
    },
  );

  server.registerTool(
    "get_monitoria_capabilities",
    {
      title: "Capacidades do MonitorIA",
      description:
        "Lista organizações autorizadas, módulos disponíveis e limitações atuais. Use no início quando o escopo ou as capacidades não estiverem claros.",
      inputSchema: GetCapabilitiesInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
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
      annotations: MCP_READ_ONLY_ANNOTATIONS,
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
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "list_cameras", (args) =>
      listCameras(context, args),
    ),
  );

  server.registerTool(
    "get_camera_overview",
    {
      title: "Visão geral da câmera",
      description:
        "Retorna uma visão consolidada da câmera: evento mais recente, estados, horários, sessões, continuidade, veículos e insights disponíveis.",
      inputSchema: GetCameraOverviewInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "get_camera_overview", (args) =>
      getCameraOverview(context, args),
    ),
  );

  server.registerTool(
    "search_events",
    {
      title: "Pesquisar eventos",
      description:
        "Pesquisa a linha do tempo visual por período, texto, câmera, local, tipo, confiança, pessoas, veículos e revisão.",
      inputSchema: SearchEventsInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "search_events", (args) =>
      searchEvents(context, args),
    ),
  );

  server.registerTool(
    "get_event_details",
    {
      title: "Detalhes do evento",
      description:
        "Obtém observações, pessoas, veículos, ações simultâneas, continuidade, capítulo da sessão e revisão de um evento específico.",
      inputSchema: GetEventDetailsInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "get_event_details", (args) =>
      getEventDetails(context, args),
    ),
  );

  server.registerTool(
    "search_operational_sessions",
    {
      title: "Pesquisar sessões operacionais",
      description:
        "Pesquisa atendimentos, entregas, visitas, atividades de funcionários, equipamentos e procedimentos de abertura ou fechamento consolidados em sessões.",
      inputSchema: SearchSessionsInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "search_operational_sessions", (args) =>
      searchOperationalSessions(context, args),
    ),
  );

  server.registerTool(
    "get_session_details",
    {
      title: "Detalhes da sessão operacional",
      description:
        "Retorna capítulos em ordem, participantes prováveis, resultados visuais e evidências de uma sessão operacional.",
      inputSchema: GetSessionDetailsInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
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
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "get_visual_state", (args) =>
      getVisualState(context, args),
    ),
  );

  server.registerTool(
    "get_operational_summary",
    {
      title: "Resumo operacional",
      description:
        "Consolida eventos, sessões, estados, abertura e fechamento, pessoas prováveis, veículos prováveis e insights em um período.",
      inputSchema: GetOperationalSummaryInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
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
        "Compara dois períodos usando eventos, sessões e os insights operacionais que estiverem disponíveis para a organização autorizada.",
      inputSchema: ComparePeriodsInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "compare_periods", (args) =>
      comparePeriods(context, args),
    ),
  );

  server.registerTool(
    "get_evidence",
    {
      title: "Obter evidências visuais",
      description:
        "Gera URLs assinadas e temporárias para imagens de eventos ou sessões. Use apenas quando a evidência visual for necessária.",
      inputSchema: GetEvidenceInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "get_evidence", (args) =>
      getEvidence(context, args),
    ),
  );

  server.registerTool(
    "search_insights",
    {
      title: "Pesquisar insights operacionais",
      description:
        "Pesquisa insights operacionais já produzidos pelo MonitorIA, com filtros por tipo, severidade, estado, período, local e câmera. Consulte as capacidades para verificar quais módulos estão disponíveis.",
      inputSchema: SearchInsightsInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "search_insights", (args) =>
      searchInsights(context, args),
    ),
  );

  server.registerTool(
    "ask_monitoria",
    {
      title: "Perguntar ao MonitorIA",
      description:
        "Roteia deterministicamente uma pergunta operacional para dados estruturados do MonitorIA. A IA cliente redige a resposta final sem uma nova chamada de LLM no servidor.",
      inputSchema: AskMonitoriaInputSchema.shape,
      annotations: MCP_READ_ONLY_ANNOTATIONS,
    },
    safeTool(context, "ask_monitoria", (args) =>
      askMonitoria(context, args),
    ),
  );

  return server;
}
