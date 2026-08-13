#!/usr/bin/env python3
from pathlib import Path

def load(rel):
    p = Path(rel)
    if not p.exists():
        raise SystemExit(f"ERRO: arquivo não encontrado: {rel}")
    return p, p.read_text(encoding="utf-8")

def replace_required(text, old, new, rel):
    if old not in text:
        raise SystemExit(f"ERRO: trecho esperado não encontrado em {rel}")
    return text.replace(old, new)

changes = {}

rel = "installer/monitoria.iss"
p, s = load(rel)
s = replace_required(
    s,
    "ISCC.exe /DAppVersion=0.15.2 installer\\monitoria.iss",
    "ISCC.exe /DAppVersion=0.15.3 installer\\monitoria.iss",
    rel,
)

old_uninstall = r'''[UninstallRun]
Filename: "{app}\monitoria-service.exe"; Parameters: "stop"; \
  Flags: runhidden waituntilterminated; RunOnceId: "StopService"

Filename: "{app}\monitoria-service.exe"; Parameters: "uninstall"; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

[UninstallDelete]
; Os logs e a fila são apagados. A configuração pareada em agent.json e a
; entropia em machine.key permanecem de propósito: reinstalar não deve
; obrigar a loja a gerar novo código de pareamento.
Type: filesandordirs; Name: "{commonappdata}\MonitorIA\logs"
Type: filesandordirs; Name: "{commonappdata}\MonitorIA\queue"
Type: filesandordirs; Name: "{commonappdata}\MonitorIA\frames"
'''

new_uninstall = r'''[UninstallRun]
; Primeiro pede encerramento limpo para o serviço e para o Agent.
Filename: "{app}\monitoria-service.exe"; Parameters: "stop"; \
  Flags: runhidden waituntilterminated; RunOnceId: "StopService"

; Em alguns computadores o wrapper retorna antes de o processo-filho liberar
; monitoria-agent.exe/FFmpeg. Mata somente a árvore iniciada pelo Agent para
; evitar que arquivos em uso sobrevivam à desinstalação.
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM monitoria-agent.exe"; \
  Flags: runhidden waituntilterminated; RunOnceId: "KillAgentTree"

Filename: "{app}\monitoria-service.exe"; Parameters: "uninstall"; \
  Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"

; Fallback idempotente: se o wrapper não removeu o registro do SCM,
; o Windows recebe uma segunda solicitação direta.
Filename: "{sys}\sc.exe"; Parameters: "delete MonitorIAAgent"; \
  Flags: runhidden waituntilterminated; RunOnceId: "DeleteServiceFallback"

[UninstallDelete]
; Desinstalar significa remover também todo o estado local. Isso evita deixar
; token pareado, chave de máquina, fila, logs ou segmentos temporários de vídeo
; no computador. Uma futura reinstalação começa limpa e exige novo pareamento.
Type: filesandordirs; Name: "{commonappdata}\MonitorIA"

; O Inno Setup remove automaticamente os arquivos que instalou. Esta limpeza
; adicional cobre arquivos residuais que tenham sido criados/alterados em
; execução ou que tenham ficado bloqueados em uma tentativa anterior.
Type: filesandordirs; Name: "{app}"
'''
s = replace_required(s, old_uninstall, new_uninstall, rel)
changes[p] = s

version_files = [
    "agent/src/service.ts",
    "agent/package.json",
    ".github/workflows/build-agent.yml",
    ".github/workflows/build-agent-linux.yml",
    "src/lib/installer-data.ts",
    "src/lib/support-diagnostics.ts",
    "app/api/cron/operations/route.ts",
    "test/agent-0102-production.test.ts",
    "test/agent-0106-auto-discovery.test.ts",
]

for rel in version_files:
    p, s = load(rel)
    before = s
    s = s.replace("0.15.2", "0.15.3").replace(r"0\.15\.2", r"0\.15\.3")
    if s == before:
        raise SystemExit(f"ERRO: nenhuma referência 0.15.2 encontrada em {rel}")
    changes[p] = s

test_path = Path("test/agent-uninstall-cleanup.test.ts")
test_content = r'''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const installerPath = new URL(
  "../installer/monitoria.iss",
  import.meta.url,
);

test("desinstalação remove serviço, processos e todo o estado local", async () => {
  const source = await readFile(installerPath, "utf8");

  assert.match(
    source,
    /Parameters:\s*"\/F \/T \/IM monitoria-agent\.exe"/,
  );

  assert.match(
    source,
    /Parameters:\s*"delete MonitorIAAgent"/,
  );

  assert.match(
    source,
    /Type:\s*filesandordirs;\s*Name:\s*"\{commonappdata\}\\MonitorIA"/,
  );

  assert.match(
    source,
    /Type:\s*filesandordirs;\s*Name:\s*"\{app\}"/,
  );

  assert.doesNotMatch(
    source,
    /machine\.key permanecem de propósito/,
  );

  assert.doesNotMatch(
    source,
    /agent\.json.*permanecem de propósito/,
  );
});
'''

if test_path.exists():
    existing = test_path.read_text(encoding="utf-8")
    if existing != test_content:
        raise SystemExit(f"ERRO: {test_path} já existe com outro conteúdo")
else:
    changes[test_path] = test_content

for path, content in changes.items():
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")

print("MonitorIA Agent atualizado para 0.15.3.")
print("Correção de desinstalação completa aplicada.")
print("Arquivos alterados/criados:")
for path in changes:
    print(f"  - {path}")
print("\nPróximos comandos:")
print("  npm run check")
print("  npm test")
