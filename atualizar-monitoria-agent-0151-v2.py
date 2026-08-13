#!/usr/bin/env python3
from pathlib import Path

TEXT_REPLACEMENTS = {
    "agent/src/service.ts": [
        ('export const AGENT_VERSION = "0.15.0";', 'export const AGENT_VERSION = "0.15.1";'),
    ],
    "agent/package.json": [
        ('"version": "0.15.0"', '"version": "0.15.1"'),
        ('--windows-version=0.15.0', '--windows-version=0.15.1'),
    ],
    "installer/monitoria.iss": [
        ('0.15.0', '0.15.1'),
    ],
    ".github/workflows/build-agent.yml": [
        ('AGENT_VERSION: "0.15.0"', 'AGENT_VERSION: "0.15.1"'),
    ],
    ".github/workflows/build-agent-linux.yml": [
        ('AGENT_VERSION: "0.15.0"', 'AGENT_VERSION: "0.15.1"'),
    ],
    "src/lib/installer-data.ts": [
        ('"0.15.0"', '"0.15.1"'),
    ],
    "src/lib/support-diagnostics.ts": [
        ('"0.15.0"', '"0.15.1"'),
    ],
    "app/api/cron/operations/route.ts": [
        ('"0.15.0"', '"0.15.1"'),
    ],
    "test/agent-0102-production.test.ts": [
        ('0.15.0', '0.15.1'),
        (r'0\.15\.0', r'0\.15\.1'),
    ],
    "test/agent-0106-auto-discovery.test.ts": [
        ('0.15.0', '0.15.1'),
    ],
}

def fail(msg):
    print(f"ERRO: {msg}")
    print("Nenhum arquivo foi alterado.")
    raise SystemExit(1)

pending = {}

for rel, replacements in TEXT_REPLACEMENTS.items():
    p = Path(rel)
    if not p.exists():
        fail(f"arquivo não encontrado: {rel}")

    text = p.read_text(encoding="utf-8")
    new = text
    changed = False

    for old, replacement in replacements:
        if old in new:
            new = new.replace(old, replacement)
            changed = True

    # Aceita arquivo já atualizado, mas rejeita se ainda houver referência
    # legada relevante depois das substituições.
    if rel == "agent/src/service.ts" and 'AGENT_VERSION = "0.15.1"' not in new:
        fail(f"não consegui atualizar {rel}")
    if rel == "agent/package.json" and (
        '"version": "0.15.1"' not in new or '--windows-version=0.15.1' not in new
    ):
        fail(f"não consegui atualizar {rel}")
    if rel.endswith("build-agent.yml") and 'AGENT_VERSION: "0.15.1"' not in new:
        fail(f"não consegui atualizar {rel}")
    if rel.endswith("build-agent-linux.yml") and 'AGENT_VERSION: "0.15.1"' not in new:
        fail(f"não consegui atualizar {rel}")
    if rel == "test/agent-0102-production.test.ts":
        if 'assert.equal(AGENT_VERSION, "0.15.1");' not in new:
            fail("o teste principal ainda não aponta para 0.15.1")
        if 'assert.equal(packageJson.version, "0.15.1");' not in new:
            fail("o teste do package.json ainda não aponta para 0.15.1")
        if r'0\.15\.0' in new or '0.15.0' in new:
            fail("ainda restou referência 0.15.0 no teste principal")

    pending[p] = new

# Validação global antes de gravar.
must_not_contain = {
    "agent/src/service.ts": ['AGENT_VERSION = "0.15.0"'],
    "agent/package.json": ['"version": "0.15.0"', '--windows-version=0.15.0'],
    ".github/workflows/build-agent.yml": ['AGENT_VERSION: "0.15.0"'],
    ".github/workflows/build-agent-linux.yml": ['AGENT_VERSION: "0.15.0"'],
}

for rel, forbidden in must_not_contain.items():
    content = pending[Path(rel)]
    for item in forbidden:
        if item in content:
            fail(f"referência antiga permaneceu em {rel}: {item}")

for p, content in pending.items():
    p.write_text(content, encoding="utf-8")

print("Versão 0.15.1 aplicada com sucesso.")
print("Arquivos atualizados:")
for p in pending:
    print(f"  - {p}")
print("")
print("Agora rode:")
print("  npm run check")
print("  npm test")
