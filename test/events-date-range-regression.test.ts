import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Acontecimentos não congela a faixa automática na URL", async () => {
  const page = await readFile(
    new URL("../app/dashboard/events/page.tsx", import.meta.url),
    "utf8",
  );
  const refresh = await readFile(
    new URL("../app/dashboard/events/events-realtime-refresh.tsx", import.meta.url),
    "utf8",
  );

  assert.match(page, /scalar\(rawParams\.range\) === "custom"/);
  assert.match(page, /name="range"/);
  assert.match(page, /value=\{customDateRange \? "custom" : "auto"\}/);
  assert.match(page, /autoDateRange=\{!customDateRange\}/);
  assert.match(page, /customDateRange\s*\? \{ range: "custom", from: fromDate, to: toDate \}/s);

  assert.match(refresh, /events-filter-form/);
  assert.match(refresh, /fromInput\.value === automaticFromDate/);
  assert.match(refresh, /rangeInput\.value/);
  assert.match(refresh, /params\.delete\("from"\)/);
  assert.match(refresh, /params\.delete\("to"\)/);
  assert.match(refresh, /router\.replace/);
  assert.match(refresh, /router\.refresh\(\)/);
});
