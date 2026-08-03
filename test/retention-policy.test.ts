import assert from "node:assert/strict";
import test from "node:test";
import {
  RETENTION_POLICIES,
  retentionExpiresAt,
  selectLongTermFrameLabels,
} from "../src/retention/policy";

test("Essencial preserva preferencialmente o pico", () => {
  assert.deepEqual(
    selectLongTermFrameLabels("basic", ["start", "peak", "end"]),
    ["peak"],
  );
});

test("Atenta preserva início e pico", () => {
  assert.deepEqual(
    selectLongTermFrameLabels("standard", ["end", "peak", "start"]),
    ["start", "peak"],
  );
});

test("Detalhada preserva início, pico e fim", () => {
  assert.deepEqual(
    selectLongTermFrameLabels("intensive", ["extra", "end", "peak", "start"]),
    ["start", "peak", "end"],
  );
});

test("não duplica labels na seleção", () => {
  assert.deepEqual(
    selectLongTermFrameLabels("standard", ["start", "start", "peak"]),
    ["start", "peak"],
  );
});

test("todos os planos mantêm metadados por 365 dias", () => {
  assert.equal(RETENTION_POLICIES.basic.metadataRetentionDays, 365);
  assert.equal(RETENTION_POLICIES.standard.metadataRetentionDays, 365);
  assert.equal(RETENTION_POLICIES.intensive.metadataRetentionDays, 365);
});

test("calcula expiração sem alterar a data original", () => {
  const base = new Date("2026-08-01T12:00:00.000Z");
  const expiry = retentionExpiresAt(base, 365);

  assert.equal(base.toISOString(), "2026-08-01T12:00:00.000Z");
  assert.equal(expiry.toISOString(), "2027-08-01T12:00:00.000Z");
});
