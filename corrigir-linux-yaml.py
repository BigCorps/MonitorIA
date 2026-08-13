#!/usr/bin/env python3
from pathlib import Path

path = Path(".github/workflows/build-agent-linux.yml")
if not path.exists():
    raise SystemExit("ERRO: .github/workflows/build-agent-linux.yml não encontrado.")

text = path.read_text(encoding="utf-8")

bad = """          printf '
' | sudo "${OUT}/install.sh"
"""
good = """          sudo "${OUT}/install.sh" </dev/null
"""

if bad not in text:
    raise SystemExit("ERRO: trecho quebrado do printf não foi encontrado. Não alterei nada.")

path.write_text(text.replace(bad, good, 1), encoding="utf-8")

print("Corrigido:")
print('  printf quebrado -> sudo "${OUT}/install.sh" </dev/null')
print()
print("Agora rode:")
print("  npm run check")
print("  npm test")
