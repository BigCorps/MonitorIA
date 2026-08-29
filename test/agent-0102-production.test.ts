import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { AGENT_VERSION as LEGACY_AGENT_VERSION, hasUsablePairing } from "../agent/src/service.js";
import { AGENT_V102_VERSION } from "../agent/src/v102/version.js";
import {
  VIDEO_MAX_HEIGHT,
  VIDEO_MAX_PASSTHROUGH_KBPS,
  VIDEO_TARGET_KBPS,
  shouldPassthroughVideo,
  transcodeVideoArguments,
} from "../agent/src/v102/video-policy.js";
import { GlobalVideoDiskBudget } from "../agent/src/v102/disk-budget.js";
import { sanitizePostgresJson } from "../src/lib/postgres-safe-json.js";
import { frameDecodeArguments } from "../agent/src/discovery/validate.js";
import { CAMERA_ANALYSIS_PLANS } from "../src/lib/analysis-plans.js";

test("entrada oficial da RC é 1.0.2 sem alterar o contrato legado armazenado", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../agent/package.json", import.meta.url), "utf8"),
  ) as { version: string; scripts: Record<string, string> };

  // O service.ts 1.0.1 continua sendo a base de cofre/IPC/upgrade já homologada;
  // a entrada 1.0.2 instala o runtime fail-fast antes de importar esse serviço.
  assert.equal(LEGACY_AGENT_VERSION, "1.0.1");
  assert.equal(AGENT_V102_VERSION, "1.0.2");
  assert.equal(packageJson.version, "1.0.2");
  assert.match(packageJson.scripts["build:win"], /index-v102\.ts/);
  assert.match(packageJson.scripts["build:linux"], /index-v102\.ts/);
});

test("instalador só considera utilizável um pareamento autenticável", () => {
  assert.equal(hasUsablePairing(true, "ok", false), true);
  assert.equal(hasUsablePairing(true, "locked", false), false);
  assert.equal(hasUsablePairing(true, "missing", false), false);
  assert.equal(hasUsablePairing(true, "ok", true), false);
  assert.equal(hasUsablePairing(false, "ok", false), false);
});

test("sampler/decodificação não usa fps nem rw_timeout incompatível", async () => {
  const args = frameDecodeArguments("rtsp://camera/stream");
  const timeline = await readFile(
    new URL("../agent/src/v102/timeline.ts", import.meta.url),
    "utf8",
  );
  assert.equal(args.includes("-rw_timeout"), false);
  assert.doesNotMatch(timeline, /-vf["']?,\s*["'`]fps=1\//);
  assert.match(timeline, /sampleAt - this\.lastSampleAt/);
});

test("vídeo 1.0.2 faz passthrough apenas dentro do envelope leve", () => {
  assert.equal(VIDEO_TARGET_KBPS, 600);
  assert.equal(VIDEO_MAX_PASSTHROUGH_KBPS, 900);
  assert.equal(VIDEO_MAX_HEIGHT, 720);
  assert.equal(shouldPassthroughVideo({ codec: "h264", width: 1280, height: 720, fps: 15, bitrateKbps: 700 }), true);
  assert.equal(shouldPassthroughVideo({ codec: "h264", width: 1920, height: 1080, fps: 30, bitrateKbps: 4000 }), false);
  assert.equal(shouldPassthroughVideo({ codec: "h264", width: 1280, height: 720, fps: 15, bitrateKbps: null }), false);
  assert.equal(shouldPassthroughVideo({ codec: "hevc", width: 1280, height: 720, fps: 15, bitrateKbps: 600 }), false);
  assert.match(transcodeVideoArguments().join(" "), /libopenh264/);
  assert.match(transcodeVideoArguments().join(" "), /-an/);
});

test("orçamento global sacrifica timeline antes da evidência", async () => {
  const root = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "monitoria-budget-")));
  const previous = process.env.MONITORIA_VIDEO_BUFFER_MAX_GB;
  process.env.MONITORIA_VIDEO_BUFFER_MAX_GB = "0.000012"; // ~12.9 KB
  try {
    const timelineDir = path.join(root, "clip-buffer", "camera-a");
    const evidenceDir = path.join(root, "event-video-evidence", "camera-b");
    await Promise.all([mkdir(timelineDir, { recursive: true }), mkdir(evidenceDir, { recursive: true })]);
    await writeFile(path.join(timelineDir, "now.ts"), Buffer.alloc(8_000, 1));
    await writeFile(path.join(evidenceDir, "event.mp4"), Buffer.alloc(8_000, 2));
    await writeFile(path.join(evidenceDir, "event.mp4.json"), "{}\n");

    const budget = new GlobalVideoDiskBudget(root);
    await budget.prune(Date.now() - 15 * 60_000);
    const stats = await budget.stats();
    assert.equal(stats.timelineBytes, 0);
    assert.equal(stats.evidenceBytes, 8_000);
    assert.ok(stats.timelineEvictionsTotal >= 1);
    assert.equal(stats.evidenceEvictionsTotal, 0);
  } finally {
    if (previous === undefined) delete process.env.MONITORIA_VIDEO_BUFFER_MAX_GB;
    else process.env.MONITORIA_VIDEO_BUFFER_MAX_GB = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("JSON PostgreSQL-safe elimina NUL e surrogate inválido sem mudar Unicode normal", () => {
  const input = { normal: "ação ✓ 👨‍💻", nul: "a\u0000b", invalid: "x\ud800y" };
  const clean = sanitizePostgresJson(input) as typeof input;
  assert.equal(clean.normal, input.normal);
  assert.equal(clean.nul.includes("\u0000"), false);
  assert.equal(/[\ud800-\udfff]/u.test(clean.invalid), false);
});

test("RC não mantém sampler experimental nem teto artificial de 64 canais", async () => {
  const [runtime, linux, windows, vercel] = await Promise.all([
    readFile(new URL("../agent/src/v102/service-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/build-agent-linux.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/build-agent.yml", import.meta.url), "utf8"),
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(runtime, /Math\.min\([^\n]*64|<=\s*64/);
  assert.match(runtime, /monitoria_v102_service_contract_mismatch/);
  assert.match(runtime, /submitCameraEventV102/);
  assert.doesNotMatch(runtime, /replace\("\/api\/agent\/cameras\/"/);
  assert.match(linux, /AGENT_VERSION: "1\.0\.2"/);
  assert.match(windows, /AGENT_VERSION: "1\.0\.2"/);
  assert.match(linux, /libopenh264/);
  assert.match(windows, /libopenh264/);
  assert.match(vercel, /\/api\/cron\/event-recovery/);
});


test("vídeo preservado não é tratado como pasta temporária e janela não corta o final", async () => {
  const [runtime, timeline] = await Promise.all([
    readFile(new URL("../agent/src/v102/service-runtime.ts", import.meta.url), "utf8"),
    readFile(new URL("../agent/src/v102/timeline.ts", import.meta.url), "utf8"),
  ]);

  assert.match(runtime, /builtFromPreservedEvidence/);
  assert.match(runtime, /if \(built\?\.path && !builtFromPreservedEvidence\)/);
  assert.match(timeline, /requestedStartMs/);
  assert.match(timeline, /seekArgs/);
  assert.match(timeline, /mantém pré\/pós-roll e garante cobertura até clipEndsAt/i);
});

test("migration 1.0.2 contém recibo durável, leases e timeline paginada única", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260823150000_monitoria_102_release_candidate.sql", import.meta.url),
    "utf8",
  );
  const retention = await readFile(
    new URL("../app/api/cron/retention/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(migration, /create table if not exists public\.event_ingestions/i);
  assert.match(migration, /unique \(camera_id, agent_event_id\)/i);
  assert.match(migration, /claim_monitoria_event_ingestion/i);
  assert.match(migration, /processing_lease_token/i);
  assert.match(migration, /claim_monitoria_clip_request/i);
  assert.match(migration, /search_monitoria_timeline_v2/i);
  assert.match(migration, /p_camera_ids uuid\[\]/i);
  assert.match(retention, /"event-clips"/);
});

test("workflow experimental permanece aposentado e somente manual", async () => {
  const retired = await readFile(
    new URL("../.github/workflows/build-agent-rtsp-sampler-test.yml", import.meta.url),
    "utf8",
  );

  // Desde a 05B8 o arquivo é um workflow YAML válido para não gerar um
  // check vermelho de inicialização no GitHub. O contrato importante é:
  // manual-only, sem checkout/build/upload/release e sem gatilho automático.
  assert.match(retired, /^name:\s*Deprecated RTSP Sampler \(manual only\)\s*$/m);
  assert.match(retired, /^on:\s*$/m);
  assert.match(retired, /^\s+workflow_dispatch:\s*$/m);
  assert.match(retired, /^jobs:\s*$/m);
  assert.match(retired, /^\s+retired:\s*$/m);
  assert.match(retired, /Sampler retired in 1\.0\.2/);
  assert.match(retired, /experimental RTSP sampler workflow was retired in MonitorIA 1\.0\.2/i);

  assert.doesNotMatch(retired, /^\s+push:\s*$/m);
  assert.doesNotMatch(retired, /^\s+pull_request:\s*$/m);
  assert.doesNotMatch(retired, /^\s+schedule:\s*$/m);
  assert.doesNotMatch(retired, /actions\/checkout/i);
  assert.doesNotMatch(retired, /actions\/upload-artifact/i);
  assert.doesNotMatch(retired, /action-gh-release/i);
  assert.doesNotMatch(retired, /\bbun\s+build\b/i);
  assert.doesNotMatch(retired, /\bnpm\s+(?:ci|install|run)\b/i);
});

test("plano detalhado mantém consolidação atual", () => {
  const plan = CAMERA_ANALYSIS_PLANS.intensive;
  assert.equal(plan.motionStartConsecutiveFrames, 3);
  assert.equal(plan.motionEndConsecutiveFrames, 8);
  assert.equal(plan.motionCooldownSeconds, 15);
  assert.equal(plan.eventCloseAfterSeconds, 25);
  assert.equal(plan.consolidationIntervalSeconds, 5);
});
