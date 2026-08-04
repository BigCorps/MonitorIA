import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateMcpDiagnostics,
  oauthAuthorizationMetadataUrl,
} from "../src/mcp/diagnostics.js";

test("deriva o discovery OAuth para issuer com caminho", () => {
  assert.equal(
    oauthAuthorizationMetadataUrl(
      "https://projeto.supabase.co/auth/v1",
    ),
    "https://projeto.supabase.co/.well-known/oauth-authorization-server/auth/v1",
  );
});

test("DCR ausente é erro de conexão automática", () => {
  const checks = evaluateMcpDiagnostics({
    canonicalMcpUrl: "https://www.monitoria.cam/mcp",
    endpointStatus: 401,
    endpointLocation: null,
    wwwAuthenticate:
      'Bearer resource_metadata="https://www.monitoria.cam/.well-known/oauth-protected-resource/mcp"',
    protectedResourceStatus: 200,
    protectedResource: {
      resource: "https://www.monitoria.cam/mcp",
    },
    authorizationMetadataStatus: 200,
    authorizationMetadata: {
      authorization_endpoint: "https://auth.example/authorize",
      token_endpoint: "https://auth.example/token",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    },
    allowlistConfigured: false,
  });

  assert.equal(
    checks.find((check) => check.id === "dynamic_registration")?.status,
    "error",
  );
});

test("configuração OAuth completa fica sem erros", () => {
  const checks = evaluateMcpDiagnostics({
    canonicalMcpUrl: "https://www.monitoria.cam/mcp",
    endpointStatus: 401,
    endpointLocation: null,
    wwwAuthenticate:
      'Bearer resource_metadata="https://www.monitoria.cam/.well-known/oauth-protected-resource/mcp"',
    protectedResourceStatus: 200,
    protectedResource: {
      resource: "https://www.monitoria.cam/mcp",
    },
    authorizationMetadataStatus: 200,
    authorizationMetadata: {
      authorization_endpoint: "https://auth.example/authorize",
      token_endpoint: "https://auth.example/token",
      registration_endpoint: "https://auth.example/register",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
    },
    allowlistConfigured: false,
  });

  assert.equal(
    checks.filter((check) => check.status === "error").length,
    0,
  );
});
