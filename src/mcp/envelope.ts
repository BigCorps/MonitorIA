import {
  MCP_RESPONSE_SCHEMA_VERSION,
  MCP_TOOLSET_VERSION,
} from "./constants";
import type { McpResponseEnvelope } from "./contracts";

export function createEnvelope(input: {
  organizationId?: string | null;
  timezone?: string | null;
  data?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  limitations?: string[];
  evidence?: Array<Record<string, unknown>>;
  pagination?: Record<string, unknown> | null;
}): McpResponseEnvelope {
  return {
    schema_version: MCP_RESPONSE_SCHEMA_VERSION,
    toolset_version: MCP_TOOLSET_VERSION,
    generated_at: new Date().toISOString(),
    organization_id: input.organizationId ?? null,
    timezone: input.timezone ?? null,
    data: input.data ?? {},
    capabilities: input.capabilities ?? {},
    limitations: input.limitations ?? [],
    evidence: input.evidence ?? [],
    pagination: input.pagination ?? null,
  };
}

export function toolResult(envelope: McpResponseEnvelope) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(envelope),
      },
    ],
    structuredContent: { ...envelope },
  };
}

export function toolError(message: string, code = "tool_error") {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: code, message }),
      },
    ],
    isError: true,
  };
}
