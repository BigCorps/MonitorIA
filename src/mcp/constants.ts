export const MCP_SERVER_NAME = "MonitorIA";
export const MCP_SERVER_VERSION = "1.0.0";
export const MCP_TOOLSET_VERSION =
  process.env.MCP_TOOLSET_VERSION ?? "1.0.0";
export const MCP_RESPONSE_SCHEMA_VERSION = "1.0";

export const MCP_AUDITED_QUERY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const MCP_PUBLIC_TOOL_NAMES = [
  "get_monitoria_capabilities",
  "list_sites",
  "list_cameras",
  "get_camera_overview",
  "search_events",
  "get_event_details",
  "search_operational_sessions",
  "get_session_details",
  "get_visual_state",
  "get_operational_summary",
  "compare_periods",
  "get_evidence",
  "search_insights",
  "ask_monitoria",
] as const;

export type McpPublicToolName =
  (typeof MCP_PUBLIC_TOOL_NAMES)[number];

export const MCP_DEFAULT_LIMIT = 25;
export const MCP_MAX_LIMIT = 100;
