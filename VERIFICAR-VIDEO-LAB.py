from pathlib import Path
import sys

ROOT = Path.cwd()
checks = []

def add(label, ok):
    checks.append((label, bool(ok)))
    print(("OK    " if ok else "FALHA ") + label)

shell = (ROOT / "app/dashboard/admin/admin-shell.tsx").read_text(encoding="utf-8")
page = (ROOT / "app/dashboard/admin/video-lab/page.tsx").read_text(encoding="utf-8")
client = (ROOT / "app/dashboard/admin/video-lab/video-lab-client.tsx").read_text(encoding="utf-8")
route = (ROOT / "app/api/admin/video-lab/analyze/route.ts").read_text(encoding="utf-8")

add("Vídeo Lab aparece no menu do Admin", 'label: "Vídeo Lab"' in shell)
add("AdminSectionKey reconhece video-lab", '| "video-lab"' in shell)
add("página exige operador interno", "requireInternalOperator()" in page)
add("API exige operador interno", "requireInternalOperator()" in route)
add("POC limita vídeo a uma hora", "MAX_VIDEO_SECONDS = 60 * 60" in client)
add("arquivo original usa URL local", "URL.createObjectURL(nextFile)" in client)
add("somente JPEGs são preparados para a IA", 'canvas.toDataURL("image/jpeg"' in client)
add("API reaproveita createVisionProvider", "createVisionProvider" in route and "analyzeEvent" in route)
add("API não usa Supabase Storage", "storage." not in route and ".from(\"storage" not in route)
add("POC não altera Agent", not any((ROOT / "agent").glob("**/*.before-video-lab")) if (ROOT / "agent").exists() else True)

if not all(ok for _, ok in checks):
    print("\nHá falhas. Não faça commit antes de revisar.")
    sys.exit(1)

print("\nTudo certo na estrutura. Próximo passo: npm run check && npm test && npm run build")
