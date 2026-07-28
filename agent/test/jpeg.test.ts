import assert from "node:assert/strict";
import test from "node:test";

test("estrutura mínima do pacote", () => {
  assert.equal(typeof fetch, "function");
});
