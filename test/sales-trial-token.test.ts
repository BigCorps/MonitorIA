import assert from "node:assert/strict";
import test from "node:test";
import {
  createSalesTrialToken,
  hashSalesTrialToken,
  normalizeSalesTrialToken,
} from "../src/trial/sales-token.js";

test("token comercial usa formato URL-safe aceito pelo parser", () => {
  const token = createSalesTrialToken();
  assert.equal(normalizeSalesTrialToken(token), token);
  assert.match(token, /^[A-Za-z0-9_-]+$/);
});

test("hash do token é SHA-256 hexadecimal e determinístico", () => {
  const token = "A".repeat(32);
  const first = hashSalesTrialToken(token);
  const second = hashSalesTrialToken(token);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});

test("tokens curtos ou com caracteres fora do padrão são rejeitados", () => {
  assert.equal(normalizeSalesTrialToken("curto"), null);
  assert.equal(normalizeSalesTrialToken("x".repeat(31)), null);
  assert.equal(normalizeSalesTrialToken("x".repeat(31) + "/"), null);
});
