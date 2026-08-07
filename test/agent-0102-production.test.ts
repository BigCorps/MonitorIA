import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AGENT_VERSION } from "../agent/src/service.js";
import { CAMERA_ANALYSIS_PLANS } from "../src/lib/analysis-plans.js";

test("Agent e defaults de produção apontam para 0.10.2", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../agent/package.json", import.meta.url), "utf8"),
  ) as { version: string };

  assert.equal(AGENT_VERSION, "0.10.2");
  assert.equal(packageJson.version, "0.10.2");
});

test("plano detalhado agrupa atividade para reduzir chamadas", () => {
  const plan = CAMERA_ANALYSIS_PLANS.intensive;

  assert.equal(plan.motionStartConsecutiveFrames, 3);
  assert.equal(plan.motionEndConsecutiveFrames, 8);
  assert.equal(plan.motionCooldownSeconds, 15);
  assert.equal(plan.eventCloseAfterSeconds, 15);
  assert.equal(plan.consolidationIntervalSeconds, 5);
});

test("instalador Windows não exige terminal e inclui DPAPI nativo", async () => {
  const [installer, page, windowsSecret, workflow] = await Promise.all([
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
  ]);

  assert.match(installer, /setup --file/);
  assert.match(installer, /ready-check/);
  assert.match(installer, /monitoria-dpapi\.exe/);
  assert.doesNotMatch(page, /Unblock-File|powershell|Prompt de Comando/i);
  assert.doesNotMatch(windowsSecret, /powershell\.exe|EncodedCommand/i);
  assert.match(workflow, /agent\\native\\dpapi\.c/);
});
