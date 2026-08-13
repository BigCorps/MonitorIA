import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("trial envia email idempotente apos captura", async () => {
  const source = await readFile(new URL("../app/api/cron/trials/route.ts", import.meta.url), "utf8");
  assert.match(source, /trial_email_notifications/);
  assert.match(source, /capture_ended/);
  assert.match(source, /notifyTrialCaptureEnded/);
});

test("workflow gera artefato Microsoft Store", async () => {
  const workflow = await readFile(new URL("../.github/workflows/build-agent.yml", import.meta.url), "utf8");
  const installer = await readFile(new URL("../installer/monitoria.iss", import.meta.url), "utf8");
  assert.match(workflow, /DStoreBuild=1/);
  assert.match(workflow, /MonitorIA-Store-Setup-/);
  assert.match(installer, /MonitorIA-Store-Setup/);
});
