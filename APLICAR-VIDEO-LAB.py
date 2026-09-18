from pathlib import Path
import shutil
import sys

ROOT = Path.cwd()
PACKAGE = Path(__file__).resolve().parent

REQUIRED_ROOT = ["package.json", "app", "src", "test"]
for item in REQUIRED_ROOT:
    if not (ROOT / item).exists():
        print(f"ERRO: execute na raiz do MonitorIA. Não encontrei: {item}")
        sys.exit(1)

FILES = [
    "app/dashboard/admin/video-lab/page.tsx",
    "app/dashboard/admin/video-lab/video-lab-client.tsx",
    "app/dashboard/admin/video-lab/video-lab.module.css",
    "app/api/admin/video-lab/analyze/route.ts",
    "test/admin-video-lab.test.ts",
]

for rel in FILES:
    src = PACKAGE / rel
    dst = ROOT / rel
    if not src.exists():
        print(f"ERRO: arquivo ausente no pacote: {rel}")
        sys.exit(1)
    if src.resolve() == dst.resolve():
        print(f"OK    {rel} já está no lugar")
        continue
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)
    print(f"OK    {rel}")

shell = ROOT / "app/dashboard/admin/admin-shell.tsx"
content = shell.read_text(encoding="utf-8")
backup = shell.with_suffix(shell.suffix + ".before-video-lab")
if not backup.exists():
    backup.write_text(content, encoding="utf-8")

if '  | "video-lab"\n' not in content:
    marker = '  | "ai"\n  | "operations"'
    replacement = '  | "ai"\n  | "video-lab"\n  | "operations"'
    if marker not in content:
        print("ERRO: contrato de AdminSectionKey mudou; admin-shell não foi alterado.")
        sys.exit(1)
    content = content.replace(marker, replacement, 1)

nav_line = '  { key: "video-lab", label: "Vídeo Lab", href: "/dashboard/admin/video-lab", icon: "▶" },\n'
if nav_line not in content:
    marker = '  { key: "ai", label: "IA & custos", href: "/dashboard/admin/ai", icon: "✦" },\n'
    if marker not in content:
        print("ERRO: item IA & custos não encontrado; admin-shell não foi alterado.")
        sys.exit(1)
    content = content.replace(marker, marker + nav_line, 1)

shell.write_text(content, encoding="utf-8")
print("OK    app/dashboard/admin/admin-shell.tsx")
print("\nAplicação concluída. Rode: python VERIFICAR-VIDEO-LAB.py")
