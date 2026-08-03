import type { SupabaseClient } from "@supabase/supabase-js";
import { createMcpSupabaseClient } from "./supabase";

export type McpAuthorizedOrganization = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

export type McpAuthContext = {
  accessToken: string;
  userId: string;
  email: string | null;
  clientId: string;
  clientName: string | null;
  organizationIds: string[];
  organizations: McpAuthorizedOrganization[];
  supabase: SupabaseClient;
};

export type McpAuthResult =
  | { ok: true; context: McpAuthContext }
  | {
      ok: false;
      status: 401 | 403 | 500;
      code: string;
      message: string;
    };

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function allowedClientIds() {
  return new Set(
    (process.env.MCP_ALLOWED_OAUTH_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

export function mcpResourceUri(request: Request) {
  const base =
    process.env.MCP_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;
  return process.env.MCP_RESOURCE_URI?.trim() || `${base}/mcp`;
}

function audienceIncludes(value: unknown, expected: string) {
  if (typeof value === "string") return value === expected;
  return Array.isArray(value) && value.some((item) => item === expected);
}

export async function authenticateMcpRequest(
  request: Request,
): Promise<McpAuthResult> {
  const accessToken = bearerToken(request);

  if (!accessToken) {
    return {
      ok: false,
      status: 401,
      code: "missing_bearer_token",
      message: "Autenticação OAuth necessária.",
    };
  }

  let supabase: SupabaseClient;

  try {
    supabase = createMcpSupabaseClient(accessToken);
  } catch {
    return {
      ok: false,
      status: 500,
      code: "mcp_server_not_configured",
      message: "O servidor MCP não está configurado.",
    };
  }

  const { data, error } = await supabase.auth.getClaims(accessToken);
  const claims = data?.claims as Record<string, unknown> | undefined;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  const clientId =
    typeof claims?.client_id === "string" ? claims.client_id : null;

  if (error || !userId || !clientId) {
    return {
      ok: false,
      status: 401,
      code: "invalid_oauth_token",
      message: "Token OAuth inválido ou sem client_id.",
    };
  }

  const expectedAudience = mcpResourceUri(request);
  if (
    !audienceIncludes(claims?.aud, expectedAudience) ||
    claims?.monitoria_mcp !== true ||
    claims?.role !== "monitoria_mcp_readonly"
  ) {
    return {
      ok: false,
      status: 401,
      code: "invalid_token_audience",
      message: "O token não foi emitido especificamente para o MonitorIA MCP.",
    };
  }

  const allowlist = allowedClientIds();
  if (allowlist.size && !allowlist.has(clientId)) {
    return {
      ok: false,
      status: 403,
      code: "oauth_client_not_allowed",
      message: "Este cliente OAuth não está autorizado no MonitorIA.",
    };
  }

  const { data: grants, error: grantsError } = await supabase
    .from("mcp_oauth_grants")
    .select(
      "organization_id,client_name,organization:organizations(id,name,slug)",
    )
    .eq("user_id", userId)
    .eq("client_id", clientId)
    .is("revoked_at", null);

  if (grantsError) {
    return {
      ok: false,
      status: 500,
      code: "oauth_grants_unavailable",
      message: "Não foi possível validar as organizações autorizadas.",
    };
  }

  const organizations: McpAuthorizedOrganization[] = [];
  let clientName: string | null = null;

  for (const grant of grants ?? []) {
    const organizationRelation = (grant as any).organization;
    const organization = Array.isArray(organizationRelation)
      ? organizationRelation[0]
      : organizationRelation;

    if (!organization) continue;

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", String((grant as any).organization_id))
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) continue;

    organizations.push({
      id: String(organization.id),
      name: String(organization.name),
      slug: String(organization.slug),
      role: String((membership as any).role ?? "member"),
    });

    if (!clientName && (grant as any).client_name) {
      clientName = String((grant as any).client_name);
    }
  }

  if (!organizations.length) {
    return {
      ok: false,
      status: 403,
      code: "no_authorized_organization",
      message:
        "O usuário não autorizou nenhuma organização para este cliente MCP.",
    };
  }

  return {
    ok: true,
    context: {
      accessToken,
      userId,
      email: typeof claims?.email === "string" ? claims.email : null,
      clientId,
      clientName,
      organizationIds: organizations.map((item) => item.id),
      organizations,
      supabase,
    },
  };
}

export function protectedResourceMetadataUrl(request: Request) {
  const base =
    process.env.MCP_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;
  return `${base}/.well-known/oauth-protected-resource/mcp`;
}

export function mcpAuthErrorResponse(
  request: Request,
  result: Exclude<McpAuthResult, { ok: true }>,
) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });

  if (result.status === 401) {
    headers.set(
      "WWW-Authenticate",
      `Bearer resource_metadata="${protectedResourceMetadataUrl(request)}"`,
    );
  }

  return new Response(
    JSON.stringify({
      error: result.code,
      error_description: result.message,
    }),
    { status: result.status, headers },
  );
}
