import assert from "node:assert/strict";
import test from "node:test";

import {
  hostCapabilities,
  resolveAgentHostMode,
} from "../agent/src/v103/host-mode.js";
import {
  assertV103HostContract,
  V103_CORE_CONTRACT,
} from "../agent/src/v103/runtime-contract.js";

test("1.0.3 mantém um único Core", () => {
  assert.equal(V103_CORE_CONTRACT.version, "1.0.3");
  assert.equal(V103_CORE_CONTRACT.invariants.oneFunctionalCore, true);
  assert.equal(V103_CORE_CONTRACT.invariants.linuxMustTrackCoreImprovements, true);
});

test("Windows 24/7 é service host", () => {
  const mode = resolveAgentHostMode("service", "win32");
  const caps = assertV103HostContract(mode);
  assert.equal(mode, "windows-service");
  assert.equal(caps.ntService, true);
  assert.equal(caps.trayRequired, true);
  assert.equal(caps.startsBeforeInteractiveLogin, true);
});

test("Microsoft Store é desktop host sem NT Service", () => {
  const mode = resolveAgentHostMode("run", "win32");
  const caps = assertV103HostContract(mode);
  assert.equal(mode, "windows-desktop");
  assert.equal(caps.ntService, false);
  assert.equal(caps.trayRequired, true);
});

test("Linux usa o mesmo Core via systemd", () => {
  const mode = resolveAgentHostMode("service", "linux");
  const caps = hostCapabilities(mode);
  assert.equal(mode, "linux-systemd");
  assert.equal(caps.sharedCore, true);
  assert.equal(caps.systemd, true);
  assert.equal(caps.startsBeforeInteractiveLogin, true);
});
