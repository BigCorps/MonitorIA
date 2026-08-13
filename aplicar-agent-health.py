#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys

patch = Path(__file__).with_name("monitoria-agent-health.patch")
if not patch.exists():
    raise SystemExit("monitoria-agent-health.patch não encontrado.")

result = subprocess.run(
    ["git", "apply", "--check", str(patch)],
    text=True,
    capture_output=True,
)

if result.returncode != 0:
    print("A correção não pôde ser aplicada automaticamente.")
    print(result.stderr.strip())
    print("Não alterei nenhum arquivo.")
    raise SystemExit(1)

subprocess.run(["git", "apply", str(patch)], check=True)
print("Correção do Agent aplicada com sucesso.")
print("Arquivos alterados: agent/src/api.ts e agent/src/service.ts")
