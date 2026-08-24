import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("repareamento 1.0.2 preserva configuração local das câmeras", async () => {
  const source = await readFile(
    new URL("../agent/src/v102/runtime-scheduler.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /mergePreservedCameraConfig/);
  assert.match(source, /previousCameras/);
  assert.match(source, /config\.cameras = merged/);
  assert.match(source, /await saveConfig\(config\)/);
  assert.match(source, /await this\.syncConfiguration\(\)/);
  assert.match(
    source,
    /pruneOrphanCameras remove com segurança/,
  );
});

test("repareamento acorda fila e heartbeat v2 imediatamente", async () => {
  const source = await readFile(
    new URL("../agent/src/v102/runtime-scheduler.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /const pairWithV102Runtime = proto\.pair/);
  assert.match(source, /proto\.pair = async function/);
  assert.match(source, /void tickQueueV102Scheduled\(this\)/);
  assert.match(source, /void tickHeartbeatV102Scheduled\(this\)/);
  assert.match(source, /pairingRefreshesV102Immediately: true/);
  assert.match(source, /preservesLocalCameraStateOnRepair: true/);
});

test("autoteste 1.0.2 exige proteção de re-pareamento", async () => {
  const source = await readFile(
    new URL("../agent/src/index-v102.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /scheduler\.preservesLocalCameraStateOnRepair !== true/,
  );
  assert.match(
    source,
    /scheduler\.pairingRefreshesV102Immediately !== true/,
  );
});
