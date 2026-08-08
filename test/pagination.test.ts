import assert from "node:assert/strict";
import test from "node:test";
import { paginationWindow } from "../src/lib/pagination.js";

test("mostra inicialmente as cinco primeiras páginas", () => {
  const window = paginationWindow(1, 18);
  assert.deepEqual(window.pages, [1, 2, 3, 4, 5]);
  assert.equal(window.hasPreviousBlock, false);
  assert.equal(window.hasNextBlock, true);
});

test("avança a paginação em blocos de cinco", () => {
  const window = paginationWindow(6, 18);
  assert.deepEqual(window.pages, [6, 7, 8, 9, 10]);
  assert.equal(window.hasPreviousBlock, true);
  assert.equal(window.hasNextBlock, true);
  assert.equal(window.previousBlockPage, 5);
  assert.equal(window.nextBlockPage, 11);
});

test("limita o último bloco ao total existente", () => {
  assert.deepEqual(
    paginationWindow(18, 18).pages,
    [16, 17, 18],
  );
});
