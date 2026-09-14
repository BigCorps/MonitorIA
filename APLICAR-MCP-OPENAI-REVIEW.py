#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path.cwd()

def p(rel): return ROOT / rel
def read(rel):
    if not p(rel).exists():
        raise SystemExit(f"[ERRO] Arquivo ausente: {rel}")
    return p(rel).read_text(encoding="utf-8")
def write(rel, value):
    p(rel).write_text(value, encoding="utf-8")
    print(f"[OK] {rel}")
def replace_once(rel, old, new):
    value = read(rel)
    count = value.count(old)
    if count == 0 and new in value:
        print(f"[OK] {rel} já estava atualizado")
        return
    if count != 1:
        raise SystemExit(f"[ERRO] {rel}: substituição ambígua ({count} ocorrências)")
    write(rel, value.replace(old, new, 1))

# 1. Versão MCP: impedir override antigo do ambiente.
replace_once(
    "src/mcp/constants.ts",
    'export const MCP_SERVER_VERSION = "1.3.0";\nexport const MCP_TOOLSET_VERSION =\n  process.env.MCP_TOOLSET_VERSION ?? "1.3.0";',
    'export const MCP_SERVER_VERSION = "1.3.0";\nexport const MCP_TOOLSET_VERSION = MCP_SERVER_VERSION;',
)

# 2. Remover bypass temporário de autenticação.
replace_once(
    "src/mcp/auth.ts",
    'import { createAdminClient } from "@/src/lib/supabase/admin";\n',
    "",
)
auth = read("src/mcp/auth.ts")
start_marker = "  // DIAGNÓSTICO TEMPORÁRIO — remover após o teste.\n"
end_marker = "  let supabase: SupabaseClient;\n"
start = auth.find(start_marker)
end = auth.find(end_marker, start if start >= 0 else 0)
if start >= 0 and end >= 0:
    auth = auth[:start] + auth[end:]
    write("src/mcp/auth.ts", auth)
elif "MCP_STATIC_TEST_TOKEN" in auth:
    raise SystemExit("[ERRO] src/mcp/auth.ts: bloco static-token mudou; não removi parcialmente")
else:
    print("[OK] src/mcp/auth.ts já estava sem static token")

# 3. Capabilities: fonte canônica de tools + descoberta multiempresa.
data = read("src/mcp/data.ts")
import_line = 'import { MCP_PUBLIC_TOOL_NAMES } from "./constants";\n'
if import_line not in data:
    anchor = 'import { resolveOrganizationId } from "./grants";\n'
    if data.count(anchor) != 1:
        raise SystemExit("[ERRO] src/mcp/data.ts: import anchor inesperado")
    data = data.replace(anchor, anchor + import_line, 1)

start = data.find("export async function getMonitoriaCapabilities(")
end = data.find("export async function listSites(", start)
if start < 0 or end < 0:
    raise SystemExit("[ERRO] src/mcp/data.ts: funções esperadas não encontradas")

new_capabilities = '''export async function getMonitoriaCapabilities(
  context: McpAuthContext,
  args: { organization_id?: string },
) {
  const organizationId = args.organization_id
    ? resolveOrganizationId(context, args.organization_id)
    : context.organizationIds.length === 1
      ? (context.organizationIds[0] as string)
      : null;

  const timezone = organizationId
    ? await timezoneForScope(context, organizationId)
    : null;

  const capabilityData = organizationId
    ? await capabilities(context, organizationId)
    : {
        scope_selection_required: true,
        authorized_organizations: context.organizations.length,
      };

  return createEnvelope({
    organizationId,
    timezone,
    data: {
      organizations: context.organizations,
      public_tools: [...MCP_PUBLIC_TOOL_NAMES],
      scope_selection_required: organizationId === null,
    },
    capabilities: capabilityData,
    limitations: [
      "As correspondências de pessoas e veículos são probabilísticas, não identidade.",
      "O MCP público é somente leitura.",
      "Imagens só são liberadas por get_evidence e usam URLs temporárias.",
      ...(organizationId === null
        ? [
            "Há mais de uma organização autorizada. Use o id retornado em organizations nas próximas ferramentas.",
          ]
        : []),
    ],
  });
}

'''
data = data[:start] + new_capabilities + data[end:]
write("src/mcp/data.ts", data)

# 4. Tornar a escolha da ferramenta mais determinística.
server = read("src/mcp/server.ts")
old_instruction = '        "Use list_sites e list_cameras para resolver escopo. As ferramentas não alteram dados operacionais, mas cada chamada registra uma auditoria interna privada. Trate pessoas e veículos como correspondências prováveis, nunca identidades. Em rotinas, diferencie horário informado, padrão aprendido e comportamento observado. Em processos, diferencie modelos padrão observacionais de processos personalizados pelo cliente; somente regras personalizadas devem ser tratadas como expectativa operacional. Em padrões da operação, trate horários, áreas e atividades como recorrências contextuais não biométricas e considere as revisões humanas. Só solicite get_evidence quando imagens forem realmente necessárias.",'
new_instruction = '        "Para perguntas em linguagem natural sobre o que aconteceu, horários, abertura/fechamento, movimento, clientes, entregas, rotina, processos ou comparação de períodos, prefira ask_monitoria como ponto de entrada. Use get_monitoria_capabilities primeiro quando o escopo ou a organização não estiverem claros; ele pode listar as organizações autorizadas sem exigir organization_id. Use list_sites/list_cameras para resolver nomes e IDs apenas quando necessário. Use ferramentas específicas quando o usuário pedir uma listagem estruturada, um registro por ID ou um detalhe explícito. Todas as ferramentas são somente leitura e registram auditoria privada. Trate pessoas e veículos como correspondências prováveis, nunca identidades. Diferencie horário informado, padrão aprendido e comportamento observado. Só solicite get_evidence quando imagens forem realmente necessárias ou quando o usuário pedir evidência visual.",'
if old_instruction in server:
    server = server.replace(old_instruction, new_instruction, 1)
elif new_instruction not in server:
    raise SystemExit("[ERRO] src/mcp/server.ts: instruções esperadas não encontradas")

old_desc = '        "Roteia deterministicamente uma pergunta operacional para dados estruturados do MonitorIA. A IA cliente redige a resposta final sem uma nova chamada de LLM no servidor.",'
new_desc = '        "Ferramenta padrão para perguntas operacionais em linguagem natural. Use para perguntas como o que aconteceu, que horas abriu/fechou, quando houve movimento, quantos atendimentos/entregas ocorreram, o que mudou ou como dois períodos se comparam. Roteia deterministicamente a pergunta para dados estruturados do MonitorIA; a IA cliente redige a resposta final sem nova chamada de LLM no servidor.",'
if old_desc in server:
    server = server.replace(old_desc, new_desc, 1)
elif new_desc not in server:
    raise SystemExit("[ERRO] src/mcp/server.ts: descrição ask_monitoria inesperada")
write("src/mcp/server.ts", server)

# 5. Endpoint de exemplo alinhado ao domínio canônico real.
env = read(".env.example")
env = env.replace("MCP_PUBLIC_BASE_URL=https://www.monitoria.cam", "MCP_PUBLIC_BASE_URL=https://monitoria.cam")
env = env.replace("MCP_RESOURCE_URI=https://www.monitoria.cam/mcp", "MCP_RESOURCE_URI=https://monitoria.cam/mcp")
env = re.sub(r"^MCP_TOOLSET_VERSION=.*\n", "", env, flags=re.MULTILINE)
write(".env.example", env)

# 6. Copiar teste de regressão.
source_test = Path(__file__).with_name("mcp-openai-review.test.ts")
target_test = p("test/mcp-openai-review.test.ts")
target_test.parent.mkdir(parents=True, exist_ok=True)
target_test.write_text(source_test.read_text(encoding="utf-8"), encoding="utf-8")
print("[OK] test/mcp-openai-review.test.ts")

print("\nCorreção MCP/OpenAI aplicada.")
print("Rode: npm run check && npm test && npm run build")
