import assert from "node:assert/strict";
import test from "node:test";
import {
  generateAgentToken,
  generatePairingCode,
  hashAgentToken,
  hashPairingCode,
  normalizePairingCode,
} from "../src/lib/agent-security";

process.env.MONITORIA_AGENT_SECRET = "monitoria-test-secret-with-more-than-32-characters";

test("pairing codes use the expected human-readable format", () => {
  const code = generatePairingCode();
  assert.match(code, /^MTR-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizePairingCode(code).length, 15);
});

test("pairing hash ignores separators and letter case", () => {
  const code = "MTR-ABCD-2345-EFGH";
  assert.equal(hashPairingCode(code), hashPairingCode("mtr abcd 2345 efgh"));
});

test("agent tokens are random and produce stable hashes", () => {
  const first = generateAgentToken();
  const second = generateAgentToken();
  assert.notEqual(first, second);
  assert.equal(hashAgentToken(first), hashAgentToken(first));
  assert.notEqual(hashAgentToken(first), hashAgentToken(second));
});
