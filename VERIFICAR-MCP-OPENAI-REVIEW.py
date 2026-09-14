#!/usr/bin/env python3
from pathlib import Path
import sys

checks = []
def require(path, needle, label):
    ok = needle in Path(path).read_text(encoding="utf-8")
    checks.append((ok, label))
def forbid(path, needle, label):
    ok = needle not in Path(path).read_text(encoding="utf-8")
    checks.append((ok, label))

require("src/mcp/constants.ts", "MCP_TOOLSET_VERSION = MCP_SERVER_VERSION", "toolset version canônica")
require("src/mcp/data.ts", "public_tools: [...MCP_PUBLIC_TOOL_NAMES]", "lista pública única")
require("src/mcp/data.ts", "scope_selection_required", "descoberta multiempresa")
forbid("src/mcp/auth.ts", "MCP_STATIC_TEST_TOKEN", "sem bypass static token")
require(".env.example", "MCP_PUBLIC_BASE_URL=https://monitoria.cam", "base sem www")
require(".env.example", "MCP_RESOURCE_URI=https://monitoria.cam/mcp", "resource URI sem www")
forbid(".env.example", "MCP_TOOLSET_VERSION=1.0.0", "sem override antigo")
require("src/mcp/server.ts", "prefira ask_monitoria como ponto de entrada", "roteamento natural")

for ok, label in checks:
    print(("[OK] " if ok else "[FALHA] ") + label)
if not all(ok for ok, _ in checks):
    sys.exit(1)
print("\nVerificação MCP/OpenAI aprovada.")
