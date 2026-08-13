#!/usr/bin/env python3
from pathlib import Path

FILES = {
    "agent/src/service.ts": [
        ('export const AGENT_VERSION = "0.15.0";', 'export const AGENT_VERSION = "0.15.1";'),
    ],
    "agent/package.json": [
        ('"version": "0.15.0"', '"version": "0.15.1"'),
        ('--windows-version=0.15.0', '--windows-version=0.15.1'),
    ],
    "installer/monitoria.iss": [
        ('ISCC.exe /DAppVersion=0.15.0', 'ISCC.exe /DAppVersion=0.15.1'),
    ],
    ".github/workflows/build-agent.yml": [
        ('AGENT_VERSION: "0.15.0"', 'AGENT_VERSION: "0.15.1"'),
    ],
    ".github/workflows/build-agent-linux.yml": [
        ('AGENT_VERSION: "0.15.0"', 'AGENT_VERSION: "0.15.1"'),
    ],
    "src/lib/installer-data.ts": [
        ('process.env.AGENT_RECOMMENDED_VERSION?.trim() || "0.15.0"', 'process.env.AGENT_RECOMMENDED_VERSION?.trim() || "0.15.1"'),
    ],
    "src/lib/support-diagnostics.ts": [
        ('process.env.AGENT_RECOMMENDED_VERSION ?? "0.15.0"', 'process.env.AGENT_RECOMMENDED_VERSION ?? "0.15.1"'),
    ],
    "app/api/cron/operations/route.ts": [
        ('process.env.AGENT_RECOMMENDED_VERSION?.trim() || "0.15.0"', 'process.env.AGENT_RECOMMENDED_VERSION?.trim() || "0.15.1"'),
    ],
    "test/agent-0102-production.test.ts": [
        ('Agent e defaults de produção apontam para 0.15.0', 'Agent e defaults de produção apontam para 0.15.1'),
        ('assert.equal(AGENT_VERSION, "0.15.0");', 'assert.equal(AGENT_VERSION, "0.15.1");'),
        ('assert.equal(packageJson.version, "0.15.0");', 'assert.equal(packageJson.version, "0.15.1");'),
        ('/AGENT_VERSION: \\"0\\\\.15\\\\.0\\"/', '/AGENT_VERSION: \\"0\\\\.15\\\\.1\\"/'),
    ],
    "test/agent-0106-auto-discovery.test.ts": [
        ('instalador 0.15.0 só pede o código de pareamento', 'instalador 0.15.1 só pede o código de pareamento'),
    ],
}

def fail(msg):
    print(f"ERRO: {msg}")
    print("Nenhum arquivo foi alterado.")
    raise SystemExit(1)

pending = {}
for rel, replacements in FILES.items():
    p = Path(rel)
    if not p.exists():
        fail(f"arquivo não encontrado: {rel}")
    text = p.read_text(encoding="utf-8")
    new = text
    for old, repl in replacements:
        if old not in new:
            fail(f"trecho esperado não encontrado em {rel}: {old}")
        new = new.replace(old, repl)
    pending[p] = new

# Só escreve depois de validar tudo.
for p, content in pending.items():
    p.write_text(content, encoding="utf-8")

print("Versão 0.15.1 aplicada com sucesso.")
print("Arquivos alterados:")
for p in pending:
    print(f"  - {p}")
print("")
print("Agora rode:")
print("  npm run check")
print("  npm test")
print("")
print("Depois faça commit/push e rode o workflow Build MonitorIA Agent.")
