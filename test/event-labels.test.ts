import assert from "node:assert/strict";
import test from "node:test";
import {
  eventTypeLabel,
  reviewLabel,
} from "../src/lib/event-labels.js";

test("traduz tipos conhecidos", () => {
  assert.equal(
    eventTypeLabel("person_present"),
    "Pessoa presente",
  );
});

test("mantém tipo desconhecido legível", () => {
  assert.equal(
    eventTypeLabel("custom_event"),
    "custom event",
  );
});

test("traduz avaliação humana", () => {
  assert.equal(reviewLabel("useful"), "Útil");
});
