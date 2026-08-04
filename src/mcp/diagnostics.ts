export type McpDiagnosticStatus = "ok" | "warning" | "error";

export type McpDiagnosticCheck = {
  id: string;
  label: string;
  status: McpDiagnosticStatus;
  detail: string;
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export function oauthAuthorizationMetadataUrl(issuer: string) {
  const url = new URL(issuer);
  const pathname = url.pathname.replace(/\/$/, "");
  return `${url.origin}/.well-known/oauth-authorization-server${pathname}`;
}

export function evaluateMcpDiagnostics(input: {
  canonicalMcpUrl: string;
  endpointStatus: number;
  endpointLocation: string | null;
  wwwAuthenticate: string | null;
  protectedResourceStatus: number;
  protectedResource: Record<string, unknown> | null;
  authorizationMetadataStatus: number;
  authorizationMetadata: Record<string, unknown> | null;
  allowlistConfigured: boolean;
}): McpDiagnosticCheck[] {
  const checks: McpDiagnosticCheck[] = [];

  const endpointIsCanonical =
    input.endpointStatus === 401 && !input.endpointLocation;
  checks.push({
    id: "mcp_endpoint",
    label: "Endpoint MCP canônico",
    status: endpointIsCanonical ? "ok" : "error",
    detail: endpointIsCanonical
      ? "O endpoint respondeu 401 sem redirecionamento, como esperado antes do OAuth."
      : `Resposta ${input.endpointStatus}${
          input.endpointLocation
            ? ` com redirecionamento para ${input.endpointLocation}`
            : ""
        }. Use a URL canônica sem redirecionamento.`,
  });

  const resourceMetadataAdvertised =
    Boolean(input.wwwAuthenticate) &&
    input.wwwAuthenticate!.includes("resource_metadata=");
  checks.push({
    id: "www_authenticate",
    label: "Descoberta do recurso protegido",
    status: resourceMetadataAdvertised ? "ok" : "error",
    detail: resourceMetadataAdvertised
      ? "WWW-Authenticate anuncia o Protected Resource Metadata."
      : "O cabeçalho WWW-Authenticate não anunciou resource_metadata.",
  });

  const resource = String(input.protectedResource?.resource ?? "");
  const protectedResourceOk =
    input.protectedResourceStatus === 200 &&
    resource === input.canonicalMcpUrl;
  checks.push({
    id: "protected_resource",
    label: "Protected Resource Metadata",
    status: protectedResourceOk ? "ok" : "error",
    detail: protectedResourceOk
      ? `O campo resource corresponde a ${input.canonicalMcpUrl}.`
      : `O metadata respondeu ${input.protectedResourceStatus} e declarou “${
          resource || "vazio"
        }”.`,
  });

  const authorizationEndpoint = String(
    input.authorizationMetadata?.authorization_endpoint ?? "",
  );
  const tokenEndpoint = String(
    input.authorizationMetadata?.token_endpoint ?? "",
  );
  const discoveryOk =
    input.authorizationMetadataStatus === 200 &&
    Boolean(authorizationEndpoint) &&
    Boolean(tokenEndpoint);

  checks.push({
    id: "oauth_discovery",
    label: "Descoberta OAuth",
    status: discoveryOk ? "ok" : "error",
    detail: discoveryOk
      ? "Os endpoints de autorização e token foram encontrados."
      : `O documento OAuth respondeu ${input.authorizationMetadataStatus} ou está incompleto.`,
  });

  const registrationEndpoint = String(
    input.authorizationMetadata?.registration_endpoint ?? "",
  );
  checks.push({
    id: "dynamic_registration",
    label: "Dynamic Client Registration",
    status: registrationEndpoint ? "ok" : "error",
    detail: registrationEndpoint
      ? "O registration_endpoint está publicado. ChatGPT, Claude e Cursor podem criar clientes automaticamente."
      : "O registration_endpoint não foi publicado. Ative Dynamic Client Registration no Supabase.",
  });

  const codeChallengeMethods = stringArray(
    input.authorizationMetadata?.code_challenge_methods_supported,
  );
  checks.push({
    id: "pkce",
    label: "PKCE S256",
    status: codeChallengeMethods.includes("S256") ? "ok" : "error",
    detail: codeChallengeMethods.includes("S256")
      ? "O servidor anuncia PKCE com S256."
      : "O servidor não anunciou S256 em code_challenge_methods_supported.",
  });

  const grantTypes = stringArray(
    input.authorizationMetadata?.grant_types_supported,
  );
  const refreshSupported = grantTypes.includes("refresh_token");
  checks.push({
    id: "refresh_token",
    label: "Renovação da autorização",
    status: refreshSupported ? "ok" : "warning",
    detail: refreshSupported
      ? "O servidor anuncia refresh_token para manter a conexão."
      : "refresh_token não apareceu em grant_types_supported. A conexão pode exigir novo login.",
  });

  checks.push({
    id: "client_allowlist",
    label: "Allowlist de clientes",
    status: input.allowlistConfigured ? "warning" : "ok",
    detail: input.allowlistConfigured
      ? "MCP_ALLOWED_OAUTH_CLIENT_IDS está preenchido. Clientes criados por DCR serão bloqueados até entrarem na lista."
      : "A allowlist está vazia, adequada para a fase de testes com DCR e consentimento obrigatório.",
  });

  return checks;
}
