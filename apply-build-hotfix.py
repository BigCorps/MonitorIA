#!/usr/bin/env python3
from pathlib import Path
import sys

repository = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()

def replace_once(path: Path, old: str, new: str) -> bool:
    if not path.exists():
        raise SystemExit(f"Arquivo não encontrado: {path}")

    content = path.read_text(encoding="utf-8")

    if new in content:
        print(f"Já corrigido: {path.relative_to(repository)}")
        return False

    if old not in content:
        raise SystemExit(
            f"Trecho esperado não encontrado em {path.relative_to(repository)}. "
            "Nenhuma alteração foi feita nesse arquivo."
        )

    path.write_text(content.replace(old, new, 1), encoding="utf-8")
    print(f"Corrigido: {path.relative_to(repository)}")
    return True

changed = 0

client_path = repository / "src/lib/supabase/client.ts"

changed += replace_once(
    client_path,
    'import { createBrowserClient } from "@supabase/ssr";\n',
    'import { createBrowserClient } from "@supabase/ssr";\n'
    'import type { SupabaseClient } from "@supabase/supabase-js";\n',
)

changed += replace_once(
    client_path,
    'let browserClient:\n'
    '  | ReturnType<typeof createBrowserClient>\n'
    '  | null = null;\n',
    'let browserClient: SupabaseClient | null = null;\n',
)

changed += replace_once(
    client_path,
    'export function createClient() {\n',
    'export function createClient(): SupabaseClient {\n',
)

callbacks = [
    (
        "app/dashboard/camera-health/camera-health-realtime-refresh.tsx",
        ".subscribe((next) =>",
        ".subscribe((next: string) =>",
    ),
    (
        "app/dashboard/processes/processes-realtime-refresh.tsx",
        ".subscribe((status) =>",
        ".subscribe((status: string) =>",
    ),
    (
        "app/dashboard/routines/routines-realtime-refresh.tsx",
        ".subscribe((status) =>",
        ".subscribe((status: string) =>",
    ),
    (
        "app/dashboard/sessions/sessions-realtime-refresh.tsx",
        ".subscribe((status) =>",
        ".subscribe((status: string) =>",
    ),
    (
        "app/dashboard/events/events-realtime-refresh.tsx",
        ".subscribe((status) =>",
        ".subscribe((status: string) =>",
    ),
    (
        "app/dashboard/operational-profiles/profiles-realtime-refresh.tsx",
        ".subscribe((next) =>",
        ".subscribe((next: string) =>",
    ),
]

for relative, old, new in callbacks:
    changed += replace_once(repository / relative, old, new)

print(f"Concluído. Alterações aplicadas: {changed}")
print("Agora execute: npm run check && npm run build")
