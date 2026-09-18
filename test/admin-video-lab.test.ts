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
  assert.match(client, /URL\.createObjectURL\(file\)/);
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
