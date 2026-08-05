#!/usr/bin/env python3
from pathlib import Path
import sys

repository = Path(
    sys.argv[1] if len(sys.argv) > 1 else "."
).resolve()

def read(path: Path) -> str:
    if not path.exists():
        raise SystemExit(f"Arquivo não encontrado: {path}")
    return path.read_text(encoding="utf-8")

def replace_once(
    path: Path,
    old: str,
    new: str,
    label: str,
) -> bool:
    content = read(path)

    if new in content:
        print(f"Já corrigido: {label}")
        return False

    if old not in content:
        raise SystemExit(
            f"Trecho esperado não encontrado em {label}. "
            "Nenhuma alteração foi feita nesse arquivo."
        )

    path.write_text(
        content.replace(old, new, 1),
        encoding="utf-8",
    )
    print(f"Corrigido: {label}")
    return True

changed = 0
package_root = Path(__file__).resolve().parent.parent

proxy_path = repository / "proxy.ts"
proxy_new = (package_root / "files/proxy.ts").read_text(
    encoding="utf-8"
)
if read(proxy_path) != proxy_new:
    proxy_path.write_text(proxy_new, encoding="utf-8")
    changed += 1
    print("Corrigido: proxy.ts")
else:
    print("Já corrigido: proxy.ts")

helper_source = package_root / "files/src/lib/auth-origin.ts"
helper_target = repository / "src/lib/auth-origin.ts"
helper_target.parent.mkdir(parents=True, exist_ok=True)
helper_text = helper_source.read_text(encoding="utf-8")
if not helper_target.exists() or read(helper_target) != helper_text:
    helper_target.write_text(helper_text, encoding="utf-8")
    changed += 1
    print("Criado/corrigido: src/lib/auth-origin.ts")
else:
    print("Já corrigido: src/lib/auth-origin.ts")

buttons_path = repository / "app/login/auth-buttons.tsx"

changed += replace_once(
    buttons_path,
    'import { createClient } from "@/src/lib/supabase/client";\n',
    'import { createClient } from "@/src/lib/supabase/client";\n'
    'import { ensureCanonicalAuthOrigin } from "@/src/lib/auth-origin";\n',
    "app/login/auth-buttons.tsx (import)",
)

changed += replace_once(
    buttons_path,
    '  async function signInWithGoogle() {\n'
    '    setLoading("google");\n',
    '  async function signInWithGoogle() {\n'
    '    if (!ensureCanonicalAuthOrigin()) return;\n\n'
    '    setLoading("google");\n',
    "app/login/auth-buttons.tsx (Google)",
)

changed += replace_once(
    buttons_path,
    '  async function signInWithPasskey() {\n'
    '    setLoading("passkey");\n',
    '  async function signInWithPasskey() {\n'
    '    if (!ensureCanonicalAuthOrigin()) return;\n\n'
    '    if (\n'
    '      !("PublicKeyCredential" in window) ||\n'
    '      !navigator.credentials\n'
    '    ) {\n'
    '      setError(\n'
    '        "Este navegador ou aparelho não oferece suporte a passkeys.",\n'
    '      );\n'
    '      return;\n'
    '    }\n\n'
    '    setLoading("passkey");\n',
    "app/login/auth-buttons.tsx (passkey)",
)

security_path = (
    repository /
    "app/dashboard/profile/security-settings.tsx"
)

changed += replace_once(
    security_path,
    'import { createClient } from "@/src/lib/supabase/client";\n',
    'import { createClient } from "@/src/lib/supabase/client";\n'
    'import { ensureCanonicalAuthOrigin } from "@/src/lib/auth-origin";\n',
    "security-settings.tsx (import)",
)

changed += replace_once(
    security_path,
    '  async function linkGoogle() {\n'
    '    if (!settings) return;\n',
    '  async function linkGoogle() {\n'
    '    if (!settings) return;\n'
    '    if (!ensureCanonicalAuthOrigin()) return;\n',
    "security-settings.tsx (link Google)",
)

changed += replace_once(
    security_path,
    '  async function registerPasskey() {\n'
    '    if (!settings) return;\n',
    '  async function registerPasskey() {\n'
    '    if (!settings) return;\n'
    '    if (!ensureCanonicalAuthOrigin()) return;\n\n'
    '    if (\n'
    '      !("PublicKeyCredential" in window) ||\n'
    '      !navigator.credentials\n'
    '    ) {\n'
    '      setError(\n'
    '        "Este navegador ou aparelho não oferece suporte a passkeys.",\n'
    '      );\n'
    '      return;\n'
    '    }\n',
    "security-settings.tsx (registrar passkey)",
)

callback_path = repository / "app/auth/callback/route.ts"

changed += replace_once(
    callback_path,
    'import { normalizeNextPath } from "@/src/lib/auth";\n',
    'import { normalizeNextPath } from "@/src/lib/auth";\n'
    'import { appConfig } from "@/src/lib/app-config";\n',
    "app/auth/callback/route.ts (import)",
)

changed += replace_once(
    callback_path,
    'function appDestination(\n'
    '  request: NextRequest,\n'
    '  path: string,\n'
    ') {\n'
    '  const forwardedHost =\n'
    '    request.headers.get("x-forwarded-host");\n',
    'function appDestination(\n'
    '  request: NextRequest,\n'
    '  path: string,\n'
    ') {\n'
    '  if (\n'
    '    process.env.VERCEL_ENV === "production" ||\n'
    '    request.nextUrl.hostname === appConfig.domain ||\n'
    '    request.nextUrl.hostname === `www.${appConfig.domain}`\n'
    '  ) {\n'
    '    return `${appConfig.url}${path}`;\n'
    '  }\n\n'
    '  const forwardedHost =\n'
    '    request.headers.get("x-forwarded-host");\n',
    "app/auth/callback/route.ts (destino)",
)

print(f"Concluído. Arquivos alterados/criados: {changed}")
print("Execute: npm run check && npm run build")
