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
  assert.match(client, /import\("@ffmpeg\/ffmpeg"\)/);
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
