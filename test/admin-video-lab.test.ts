import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Vídeo Lab fica restrito ao operador interno e não envia o vídeo inteiro", () => {
  const page = read("app/dashboard/admin/video-lab/page.tsx");
  const client = read("app/dashboard/admin/video-lab/video-lab-client.tsx");
  const route = read("app/api/admin/video-lab/analyze/route.ts");

  assert.match(page, /requireInternalOperator\(\)/);
  assert.match(route, /requireInternalOperator\(\)/);
  assert.match(client, /URL\.createObjectURL\(/);
  assert.match(client, /FFFSType\.WORKERFS/);
  assert.match(client, /files:\s*\[sourceFile\]/);
  assert.match(client, /canvas\.toDataURL\("image\/jpeg"/);
  assert.doesNotMatch(route, /storage\./);
  assert.doesNotMatch(route, /formData\(\)/);
});

test("Vídeo Lab limita o POC a uma hora e reaproveita a visão do MonitorIA", () => {
  const client = read("app/dashboard/admin/video-lab/video-lab-client.tsx");
  const route = read("app/api/admin/video-lab/analyze/route.ts");
  const shell = read("app/dashboard/admin/admin-shell.tsx");

  assert.match(client, /MAX_VIDEO_SECONDS = 60 \* 60/);
  assert.match(route, /createVisionProvider/);
  assert.match(route, /analyzeEvent/);
  assert.match(shell, /video-lab/);
  assert.match(shell, /Vídeo Lab/);
});


test("Vídeo Lab ativa compatibilidade local para codecs não nativos", () => {
  const client = read("app/dashboard/admin/video-lab/video-lab-client.tsx");
  const packageJson = JSON.parse(read("package.json"));

  assert.equal(packageJson.dependencies?.["@ffmpeg/ffmpeg"], "^0.12.15");
  assert.match(client, /loadFfmpegBrowserModule/);
  assert.match(client, /FFMPEG_BROWSER_MODULE_URL/);
  assert.doesNotMatch(client, /await import\("@ffmpeg\/ffmpeg"\)/);
  assert.match(client, /FFFSType\.WORKERFS/);
  assert.match(client, /scanCompatibilityVideo/);
  assert.match(client, /extractCompatibilityFrames/);
  assert.match(client, /rawvideo/);
  assert.match(client, /format=gray/);
  assert.doesNotMatch(client, /monitoria-proxy\.mp4/);
  assert.match(client, /compatibilidade local/i);
  assert.match(client, /\.mkv/);
  assert.match(client, /\.h265/);
  assert.doesNotMatch(client, /fetch\([^)]*selectedFile/);
});

test("Vídeo Lab tem fallback de WORKERFS para memória local e expõe diagnóstico", () => {
  const client = read("app/dashboard/admin/video-lab/video-lab-client.tsx");

  assert.match(client, /WORKERFS indisponível neste navegador/);
  assert.match(client, /sourceFile\.arrayBuffer\(\)/);
  assert.match(client, /ffmpeg\.writeFile\(inputPath, bytes\)/);
  assert.match(client, /unknownErrorText/);
  assert.match(client, /Falha ao inspecionar a gravação/);
});

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

test("Vídeo Lab tolera HEVC de câmera sem duração/VPS/SPS inicial", () => {
  const client = read("app/dashboard/admin/video-lab/video-lab-client.tsx");

  assert.match(client, /durationKnown/);
  assert.match(client, /duração será inferida durante o mapeamento/);
  assert.match(client, /\+genpts\+discardcorrupt/);
  assert.match(client, /ignore_err/);
  assert.match(client, /String\(MAX_VIDEO_SECONDS\)/);
  assert.match(client, /const scanHeight = 90/);
  assert.match(client, /inferredDuration/);
  assert.doesNotMatch(
    client,
    /FFmpeg abriu o arquivo, mas não determinou a duração/,
  );
});
