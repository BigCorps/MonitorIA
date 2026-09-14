import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("toolset MCP tem uma única fonte de versão", async () => {
  const source = await read("src/mcp/constants.ts");
  assert.match(source, /MCP_TOOLSET_VERSION = MCP_SERVER_VERSION/);
  assert.doesNotMatch(source, /process\.env\.MCP_TOOLSET_VERSION/);
});

test("capabilities usa a lista canônica de tools públicas", async () => {
  const source = await read("src/mcp/data.ts");
  assert.match(source, /public_tools:\s*\[\.\.\.MCP_PUBLIC_TOOL_NAMES\]/);
  const constants = await read("src/mcp/constants.ts");
  for (const tool of [
    "get_routine_summary",
    "get_process_summary",
    "get_operation_patterns",
  ]) assert.ok(constants.includes(`"${tool}"`));
});

test("capabilities descobre organizações sem falhar no multiempresa", async () => {
  const source = await read("src/mcp/data.ts");
  assert.match(source, /scope_selection_required/);
  assert.match(source, /context\.organizationIds\.length === 1/);
});

test("autenticação não contém bypass por static token", async () => {
  const source = await read("src/mcp/auth.ts");
  assert.doesNotMatch(source, /MCP_STATIC_TEST_TOKEN/);
  assert.doesNotMatch(source, /MCP_STATIC_TEST_USER_ID/);
  assert.doesNotMatch(source, /MCP_STATIC_TEST_ORG_ID/);
});

test("endpoint canônico de exemplo é sem www", async () => {
  const source = await read(".env.example");
  assert.match(source, /MCP_PUBLIC_BASE_URL=https:\/\/monitoria\.cam/);
  assert.match(source, /MCP_RESOURCE_URI=https:\/\/monitoria\.cam\/mcp/);
  assert.doesNotMatch(source, /https:\/\/www\.monitoria\.cam\/mcp/);
});

test("ask_monitoria é entrada padrão para linguagem natural", async () => {
  const source = await read("src/mcp/server.ts");
  assert.match(source, /prefira ask_monitoria como ponto de entrada/);
  assert.match(source, /Ferramenta padrão para perguntas operacionais em linguagem natural/);
});

test("tools continuam somente leitura e idempotentes", async () => {
  const source = await read("src/mcp/constants.ts");
  assert.match(source, /readOnlyHint:\s*true/);
  assert.match(source, /destructiveHint:\s*false/);
  assert.match(source, /idempotentHint:\s*true/);
  assert.match(source, /openWorldHint:\s*false/);
});

test("capabilities não mantém cópia manual da lista pública", async () => {
  const source = await read("src/mcp/data.ts");
  assert.doesNotMatch(
    source,
    /public_tools:\s*\[\s*"get_monitoria_capabilities"[\s\S]*?"ask_monitoria"\s*\]/,
  );
});
