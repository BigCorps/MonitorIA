import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("cards de acontecimentos recuperam falhas de thumbnail", async () => {
  const source = await readFile(
    new URL("../app/dashboard/events/event-thumbnail.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /RETRY_DELAYS_MS/);
  assert.match(source, /onError=/);
  assert.match(source, /setUnavailable\(true\)/);
  assert.match(source, /favicon\.svg/);
});

test("timeline evita polling agressivo e prefetch massivo", async () => {
  const realtime = await readFile(
    new URL("../app/dashboard/events/events-realtime-refresh.tsx", import.meta.url),
    "utf8",
  );
  const list = await readFile(
    new URL("../app/dashboard/events/event-list.tsx", import.meta.url),
    "utf8",
  );

  assert.match(realtime, /SAFETY_POLL_MS = 60_000/);
  assert.doesNotMatch(realtime, /PENDING_POLL_MS = 8_000/);
  assert.match(list, /prefetch=\{false\}/);
  assert.match(list, /EventThumbnailImage/);
});

test("timeline só escolhe JPEG de event_keyframe para cards concluídos", async () => {
  const source = await readFile(
    new URL("../src/lib/event-timeline-data.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /\.eq\("kind", "event_keyframe"\)/);
  assert.match(source, /\.eq\("mime_type", "image\/jpeg"\)/);
  assert.match(source, /thumbnailPriority/);
});
