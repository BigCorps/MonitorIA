import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAgentApiBaseUrl,
  requestAgentJsonV102,
} from "../agent/src/v102/api.js";

test("1.0.2 normaliza www.monitoria.cam para a origem canônica", () => {
  assert.equal(
    normalizeAgentApiBaseUrl("https://www.monitoria.cam/"),
    "https://monitoria.cam",
  );
  assert.equal(
    normalizeAgentApiBaseUrl("https://monitoria.cam"),
    "https://monitoria.cam",
  );
});

test("1.0.2 preserva Authorization em redirect HTTPS do mesmo domínio", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      authorization: headers.get("authorization"),
    });

    if (calls.length === 1) {
      return new Response(null, {
        status: 308,
        headers: { location: "https://monitoria.cam/api/test" },
      });
    }

    return Response.json({ ok: true }, { status: 200 });
  };

  try {
    const result = await requestAgentJsonV102<{ ok: boolean }>(
      "https://legacy.monitoria.cam",
      "token-de-teste",
      "/api/test",
      { method: "GET" },
    );

    assert.equal(result.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.authorization, "Bearer token-de-teste");
    assert.equal(calls[1]?.authorization, "Bearer token-de-teste");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("1.0.2 remove Authorization antes de seguir redirect para terceiro", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; authorization: string | null }> = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      authorization: headers.get("authorization"),
    });

    if (calls.length === 1) {
      return new Response(null, {
        status: 308,
        headers: { location: "https://terceiro.invalid/api/test" },
      });
    }

    return Response.json({ ok: true }, { status: 200 });
  };

  try {
    await requestAgentJsonV102(
      "https://legacy.monitoria.cam",
      "token-de-teste",
      "/api/test",
      { method: "GET" },
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.authorization, "Bearer token-de-teste");
    assert.equal(calls[1]?.authorization, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
