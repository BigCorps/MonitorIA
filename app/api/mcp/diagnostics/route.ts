import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/src/lib/auth";
import {
  evaluateMcpDiagnostics,
  oauthAuthorizationMetadataUrl,
} from "@/src/mcp/diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canonicalMcpUrl(request: Request) {
  const configured = process.env.MCP_RESOURCE_URI?.trim();
  if (configured) return configured;

  const base =
    process.env.MCP_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
    new URL(request.url).origin;

  return `${base}/mcp`;
}

async function jsonResponse(response: Response) {
  if (!response.ok) return null;

  try {
    const value = await response.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  await requireAuthenticatedUser();

  const mcpUrl = canonicalMcpUrl(request);
  const resourceOrigin = new URL(mcpUrl).origin;
  const protectedResourceMetadataUrl =
    `${resourceOrigin}/.well-known/oauth-protected-resource/mcp`;

  try {
    const [endpointResponse, protectedResourceResponse] = await Promise.all([
      fetch(mcpUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
      fetch(protectedResourceMetadataUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    ]);

    const protectedResource =
      await jsonResponse(protectedResourceResponse);
    const authorizationServers = Array.isArray(
      protectedResource?.authorization_servers,
    )
      ? protectedResource.authorization_servers.filter(
          (value): value is string => typeof value === "string",
        )
      : [];

    const authorizationServer = authorizationServers[0] ?? null;
    const authorizationMetadataUrl = authorizationServer
      ? oauthAuthorizationMetadataUrl(authorizationServer)
      : null;

    let authorizationMetadataResponse: Response | null = null;
    let authorizationMetadata: Record<string, unknown> | null = null;

    if (authorizationMetadataUrl) {
      authorizationMetadataResponse = await fetch(authorizationMetadataUrl, {
        method: "GET",
        redirect: "manual",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      authorizationMetadata =
        await jsonResponse(authorizationMetadataResponse);
    }

    const checks = evaluateMcpDiagnostics({
      canonicalMcpUrl: mcpUrl,
      endpointStatus: endpointResponse.status,
      endpointLocation: endpointResponse.headers.get("location"),
      wwwAuthenticate: endpointResponse.headers.get("www-authenticate"),
      protectedResourceStatus: protectedResourceResponse.status,
      protectedResource,
      authorizationMetadataStatus:
        authorizationMetadataResponse?.status ?? 0,
      authorizationMetadata,
      allowlistConfigured: Boolean(
        process.env.MCP_ALLOWED_OAUTH_CLIENT_IDS?.trim(),
      ),
    });

    return NextResponse.json(
      {
        ok: checks.every((check) => check.status !== "error"),
        generatedAt: new Date().toISOString(),
        canonicalMcpUrl: mcpUrl,
        protectedResourceMetadataUrl,
        authorizationServer,
        authorizationMetadataUrl,
        checks,
      },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    console.error(
      "Falha no diagnóstico MCP:",
      error instanceof Error ? error.message : error,
    );

    return NextResponse.json(
      { error: "mcp_diagnostic_unavailable" },
      { status: 500 },
    );
  }
}
