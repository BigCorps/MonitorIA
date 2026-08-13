#!/usr/bin/env python3
from pathlib import Path

changes = {}

def load(rel):
    p = Path(rel)
    if not p.exists():
        raise SystemExit(f"ERRO: arquivo não encontrado: {rel}")
    return p, p.read_text(encoding="utf-8")

def replace_required(text, old, new, rel):
    if old not in text:
        raise SystemExit(f"ERRO: trecho esperado não encontrado em {rel}: {old[:120]}")
    return text.replace(old, new)

rel = "src/clips/policy.ts"
p, s = load(rel)
s = replace_required(s, "export const MONITORIA_CLIP_MAX_DURATION_SECONDS = 120;", "export const MONITORIA_CLIP_MAX_DURATION_SECONDS = 310;", rel)
s = replace_required(s, "export const MONITORIA_CLIP_MAX_BYTES = 25 * 1024 * 1024;", "export const MONITORIA_CLIP_MAX_BYTES = 100 * 1024 * 1024;", rel)
changes[p] = s

rel = "agent/src/clip-buffer.ts"
p, s = load(rel)
s = replace_required(s, "const KEEP_BUFFER_MS = 120_000;", "const KEEP_BUFFER_MS = 15 * 60_000;", rel)
s = replace_required(s, "const MAX_BUFFER_BYTES = 512 * 1024 * 1024;", "const MAX_BUFFER_BYTES = 512 * 1024 * 1024;\nconst MAX_CLIP_BYTES = 100 * 1024 * 1024;", rel)
s = replace_required(s, "if (outputStat.size > 25 * 1024 * 1024) {\n      throw new Error(\"O clipe ultrapassou 25 MB.\");\n    }", "if (outputStat.size > MAX_CLIP_BYTES) {\n      throw new Error(\"O clipe ultrapassou 100 MB.\");\n    }", rel)
changes[p] = s

rel = "agent/src/api.ts"
p, s = load(rel)
s = replace_required(s, "const timer = setTimeout(() => controller.abort(), 120_000);", "const timer = setTimeout(() => controller.abort(), 300_000);", rel)
changes[p] = s

rel = "app/api/agent/clips/[requestId]/complete/route.ts"
p, s = load(rel)
s = replace_required(s, "durationSeconds: z.number().min(0).max(60).nullable(),", "durationSeconds: z.number().min(0).max(310).nullable(),", rel)
s = replace_required(s, "segmentsUsed: z.number().int().min(0).max(100),", "segmentsUsed: z.number().int().min(0).max(160),", rel)
changes[p] = s

rel = "app/dashboard/events/[eventId]/event-media.tsx"
p, s = load(rel)
s = replace_required(s, '  const [tab, setTab] = useState<"images" | "clip">("images");', '  const [tab, setTab] = useState<"images" | "clip">("images");\n  const [clipDurationSeconds, setClipDurationSeconds] = useState<number | null>(null);', rel)
s = replace_required(s, "function bytesLabel(value: number | null) {\n  if (!value) return null;\n  return `${(value / 1024 / 1024).toFixed(1)} MB`;\n}", "function bytesLabel(value: number | null) {\n  if (!value) return null;\n  return `${(value / 1024 / 1024).toFixed(1)} MB`;\n}\n\nfunction durationLabel(value: number | null) {\n  if (!value || !Number.isFinite(value)) return null;\n  const seconds = Math.max(0, Math.round(value));\n  if (seconds < 60) return `${seconds} s`;\n  const minutes = Math.floor(seconds / 60);\n  const remainder = seconds % 60;\n  return remainder ? `${minutes} min ${remainder} s` : `${minutes} min`;\n}", rel)
s = replace_required(s, "          Clipe de 15 s", "          Clipe", rel)
s = replace_required(s, "            playsInline\n            poster=", "            playsInline\n            onLoadedMetadata={(event) => {\n              const duration = event.currentTarget.duration;\n              setClipDurationSeconds(\n                Number.isFinite(duration) && duration > 0 ? duration : null,\n              );\n            }}\n            poster=", rel)
s = replace_required(s, "              720p · H.264 · sem áudio\n              {bytesLabel(clip.byteSize)", "              720p · H.264 · sem áudio\n              {durationLabel(clipDurationSeconds)\n                ? ` · ${durationLabel(clipDurationSeconds)}`\n                : \"\"}\n              {bytesLabel(clip.byteSize)", rel)
changes[p] = s

version_files = [
    "agent/src/service.ts",
    "agent/package.json",
    "installer/monitoria.iss",
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
    s = s.replace("0.15.1", "0.15.2").replace(r"0\.15\.1", r"0\.15\.2")
    if s == before:
        raise SystemExit(f"ERRO: nenhuma referência 0.15.1 encontrada em {rel}")
    changes[p] = s

migration = Path("supabase/migrations/20260813183000_full_event_clips_v2.sql")
if migration.exists():
    raise SystemExit(f"ERRO: migration já existe: {migration}")

migration_sql = """-- MonitorIA - clipes do acontecimento completo
-- Alinha banco, plano Detalhada e limite do Storage ao Agent 0.15.2.

begin;

alter table public.clip_generation_requests
  drop constraint if exists clip_generation_requests_duration_seconds_check;

alter table public.clip_generation_requests
  add constraint clip_generation_requests_duration_seconds_check
  check (duration_seconds between 5 and 310);

alter table public.camera_plan_catalog
  drop constraint if exists camera_plan_catalog_clip_duration_seconds_check;

alter table public.camera_plan_catalog
  add constraint camera_plan_catalog_clip_duration_seconds_check
  check (
    clip_duration_seconds is null
    or clip_duration_seconds between 5 and 310
  );

update public.camera_plan_catalog
set clip_duration_seconds = 310
where code = 'intensive';

update storage.buckets
set file_size_limit = 104857600
where id = 'event-clips';

commit;
"""
changes[migration] = migration_sql

for p, content in changes.items():
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")

print("Correção completa de clipes aplicada com sucesso.")
print("Agent atualizado para 0.15.2.")
print("Arquivos alterados/criados:")
for p in changes:
    print(f"  - {p}")
print("\nAgora rode:")
print("  npm run check")
print("  npm test")
