import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  AGENT_VERSION,
  hasUsablePairing,
} from "../agent/src/service.js";
import { frameDecodeArguments } from "../agent/src/discovery/validate.js";
import { CAMERA_ANALYSIS_PLANS } from "../src/lib/analysis-plans.js";

test("Agent e defaults de produção apontam para 0.10.6", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../agent/package.json", import.meta.url), "utf8"),
  ) as { version: string };

  assert.equal(AGENT_VERSION, "0.10.6");
  assert.equal(packageJson.version, "0.10.6");
});

test("instalador só considera utilizável um pareamento autenticável", () => {
  assert.equal(hasUsablePairing(true, "ok", false), true);
  assert.equal(hasUsablePairing(true, "locked", false), false);
  assert.equal(hasUsablePairing(true, "missing", false), false);
  assert.equal(hasUsablePairing(true, "ok", true), false);
  assert.equal(hasUsablePairing(false, "ok", false), false);
});

test("decodificação de amostra não usa rw_timeout incompatível", () => {
  const args = frameDecodeArguments("rtsp://camera/stream");

  assert.equal(args.includes("-rw_timeout"), false);
  assert.deepEqual(args.slice(2, 6), [
    "error",
    "-rtsp_transport",
    "tcp",
    "-i",
  ]);
});

test("plano detalhado agrupa atividade para reduzir chamadas", () => {
  const plan = CAMERA_ANALYSIS_PLANS.intensive;

  assert.equal(plan.motionStartConsecutiveFrames, 3);
  assert.equal(plan.motionEndConsecutiveFrames, 8);
  assert.equal(plan.motionCooldownSeconds, 15);
  assert.equal(plan.eventCloseAfterSeconds, 25);
  assert.equal(plan.consolidationIntervalSeconds, 5);
});

test("instalador Windows não exige terminal e inclui DPAPI nativo", async () => {
  const [installer, page, windowsSecret, workflow, linuxWorkflow] = await Promise.all([
    readFile(new URL("../installer/monitoria.iss", import.meta.url), "utf8"),
    readFile(
      new URL("../app/dashboard/installer/page.tsx", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../agent/src/secret-windows.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../.github/workflows/build-agent.yml", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../.github/workflows/build-agent-linux.yml", import.meta.url),
      "utf8",
    ),
  ]);

  assert.match(installer, /setup --file/);
  assert.match(installer, /ready-check/);
  assert.match(installer, /monitoria-dpapi\.exe/);
  assert.doesNotMatch(page, /Unblock-File|powershell|Prompt de Comando/i);
  assert.doesNotMatch(windowsSecret, /powershell\.exe|EncodedCommand/i);
  assert.match(workflow, /agent\\native\\dpapi\.c/);
  assert.match(workflow, /AGENT_VERSION: "0\.10\.6"/);
  assert.match(linuxWorkflow, /AGENT_VERSION: "0\.10\.6"/);
});
