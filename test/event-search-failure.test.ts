import assert from "node:assert/strict";
import test from "node:test";
import { didEventSearchFail } from "../src/lib/event-search-failure";

test("sem erro, busca mantém o resultado normal", () => {
  assert.equal(didEventSearchFail(null, true), false);
  assert.equal(didEventSearchFail(undefined, false), false);
});

test("páginas legadas ainda podem tolerar erro da busca", () => {
  assert.equal(didEventSearchFail({ message: "database_timeout" }, false), true);
});

test("Pesquisa IA não transforma falha da busca em zero resultados", () => {
  assert.throws(
    () => didEventSearchFail({ message: "SENSITIVE_SQL_FAILURE" }, true),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "event_search_unavailable");
      assert.doesNotMatch(error.message, /SENSITIVE_SQL_FAILURE/);
      return true;
    },
  );
});
