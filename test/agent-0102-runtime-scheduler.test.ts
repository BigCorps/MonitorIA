import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("entrada 1.0.2 instala scheduler explícito depois do runtime", async () => {
  const source = await readFile(
    new URL("../agent/src/index-v102.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /installV102Runtime\(\);\s*installV102Scheduler\(\);/,
  );
  assert.match(source, /assertV102SchedulerInstalled\(\)/);
  assert.match(source, /eventTransport !== "durable-v2"/);
  assert.match(source, /\/api\/agent\/v2\/cameras\//);
});

test("scheduler desliga timers legado e envia pela API v2", async () => {
  const source = await readFile(
    new URL("../agent/src/v102/runtime-scheduler.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /clearInterval\(addedTimers\[0\]\)/);
  assert.match(source, /clearInterval\(addedTimers\[1\]\)/);
  assert.match(source, /submitCameraEventV102/);
  assert.match(source, /queue\.claimFair/);
  assert.match(source, /eventTransport: "durable-v2"/);
  assert.match(source, /scheduler: "explicit-v2"/);
  assert.match(source, /monitoria_v102_scheduler_timer_contract_mismatch/);
});
