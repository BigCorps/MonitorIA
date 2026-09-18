from pathlib import Path
import json
import shutil

ROOT = Path(".")
CLIENT = ROOT / "app/dashboard/admin/video-lab/video-lab-client.tsx"
TEST = ROOT / "test/admin-video-lab.test.ts"
PACKAGE = ROOT / "package.json"
GITIGNORE = ROOT / ".gitignore"
VENDOR_SCRIPT = ROOT / "scripts/vendor-ffmpeg.mjs"

for p in (CLIENT, TEST, PACKAGE, GITIGNORE):
    if not p.exists():
        raise SystemExit(f"ERRO: arquivo não encontrado: {p}")

client = CLIENT.read_text(encoding="utf-8")
test = TEST.read_text(encoding="utf-8")

backup = CLIENT.with_suffix(CLIENT.suffix + ".before-turbopack-fix")
if not backup.exists():
    shutil.copy2(CLIENT, backup)

old_import = '  const { FFmpeg, FFFSType } = await import("@ffmpeg/ffmpeg");'
new_import = '''  const { FFmpeg, FFFSType } =
    await loadFfmpegBrowserModule();'''

if old_import not in client:
    raise SystemExit(
        "ERRO: import dinâmico atual do @ffmpeg/ffmpeg não foi encontrado."
    )

client = client.replace(old_import, new_import, 1)

marker = '''function unknownErrorText(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
'''

helper = r'''
type FfmpegLogEvent = {
  message: string;
};

type FfmpegProgressEvent = {
  progress: number;
};

type BrowserFfmpegInstance = {
  on: {
    (event: "log", listener: (event: FfmpegLogEvent) => void): void;
    (event: "progress", listener: (event: FfmpegProgressEvent) => void): void;
  };
  load(options: {
    coreURL: string;
    wasmURL: string;
  }): Promise<boolean>;
  createDir(path: string): Promise<boolean>;
  mount(
    fsType: string,
    options: { files: File[] },
    mountPoint: string,
  ): Promise<boolean>;
  writeFile(path: string, data: Uint8Array): Promise<boolean>;
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>;
  ffprobe(args: string[]): Promise<number>;
  exec(args: string[]): Promise<number>;
  terminate(): void;
};

type BrowserFfmpegModule = {
  FFmpeg: new () => BrowserFfmpegInstance;
  FFFSType: {
    WORKERFS: string;
  };
};

const FFMPEG_BROWSER_MODULE_URL = "/vendor/ffmpeg/index.js";

async function loadFfmpegBrowserModule(): Promise<BrowserFfmpegModule> {
  // Usa o import ESM nativo do navegador, sem o Turbopack reescrever
  // classes.js/worker.js e seus URLs dinâmicos internos.
  const nativeImport = new Function(
    "url",
    "return import(url)",
  ) as (url: string) => Promise<BrowserFfmpegModule>;

  return nativeImport(FFMPEG_BROWSER_MODULE_URL);
}
'''

if marker not in client:
    raise SystemExit("ERRO: ponto de inserção do loader FFmpeg não encontrado.")

client = client.replace(marker, marker + helper, 1)

VENDOR_SCRIPT.parent.mkdir(parents=True, exist_ok=True)
VENDOR_SCRIPT.write_text(
r'''import { access, cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const source = resolve(
  process.cwd(),
  "node_modules",
  "@ffmpeg",
  "ffmpeg",
  "dist",
  "esm",
);
const destination = resolve(
  process.cwd(),
  "public",
  "vendor",
  "ffmpeg",
);

try {
  await access(source);
} catch {
  throw new Error(
    "Não encontrei node_modules/@ffmpeg/ffmpeg/dist/esm. Rode npm install antes do build.",
  );
}

await rm(destination, { recursive: true, force: true });
await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true });

console.log(
  "[vendor-ffmpeg] distribuição ESM copiada para public/vendor/ffmpeg",
);
''',
    encoding="utf-8",
)

package = json.loads(PACKAGE.read_text(encoding="utf-8"))
scripts = package.setdefault("scripts", {})
scripts["predev"] = "node scripts/vendor-ffmpeg.mjs"
scripts["prebuild"] = "node scripts/vendor-ffmpeg.mjs"
PACKAGE.write_text(
    json.dumps(package, ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)

gitignore = GITIGNORE.read_text(encoding="utf-8")
ignore_line = "/public/vendor/ffmpeg/"
if ignore_line not in gitignore.splitlines():
    if not gitignore.endswith("\n"):
        gitignore += "\n"
    gitignore += "\n# ffmpeg.wasm ESM copiado automaticamente antes de dev/build\n"
    gitignore += ignore_line + "\n"
GITIGNORE.write_text(gitignore, encoding="utf-8")

old_assert = '  assert.match(client, /import\\("@ffmpeg\\/ffmpeg"\\)/);'
new_assert = '''  assert.match(client, /loadFfmpegBrowserModule/);
  assert.match(client, /FFMPEG_BROWSER_MODULE_URL/);
  assert.doesNotMatch(client, /await import\\("@ffmpeg\\/ffmpeg"\\)/);'''

if old_assert in test:
    test = test.replace(old_assert, new_assert, 1)

extra_test = r'''
test("Vídeo Lab carrega ffmpeg.wasm fora do bundle do Turbopack", () => {
  const client = read("app/dashboard/admin/video-lab/video-lab-client.tsx");
  const vendor = read("scripts/vendor-ffmpeg.mjs");
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(
    packageJson.scripts?.prebuild,
    "node scripts/vendor-ffmpeg.mjs",
  );
  assert.equal(
    packageJson.scripts?.predev,
    "node scripts/vendor-ffmpeg.mjs",
  );
  assert.match(client, /new Function\(/);
  assert.match(client, /return import\(url\)/);
  assert.match(client, /\/vendor\/ffmpeg\/index\.js/);
  assert.doesNotMatch(client, /await import\("@ffmpeg\/ffmpeg"\)/);
  assert.match(vendor, /node_modules/);
  assert.match(vendor, /dist/);
  assert.match(vendor, /esm/);
  assert.match(vendor, /public/);
  assert.match(vendor, /vendor/);
  assert.match(vendor, /ffmpeg/);
});
'''

if "carrega ffmpeg.wasm fora do bundle do Turbopack" not in test:
    test = test.rstrip() + "\n\n" + extra_test.lstrip()

CLIENT.write_text(client, encoding="utf-8")
TEST.write_text(test, encoding="utf-8")

print("OK: loader FFmpeg isolado do Turbopack.")
print("Arquivos alterados/criados:")
for p in (CLIENT, TEST, PACKAGE, GITIGNORE, VENDOR_SCRIPT):
    print(" -", p)
print("Backup:")
print(" -", backup)
