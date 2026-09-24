import { test } from "node:test";
import assert from "node:assert/strict";
import { toInstant, localDateTime } from "../lib/tasks/dates.mjs";
test("organization timezone round trip in summer and winter", () => {
  assert.equal(
    toInstant("2026-09-25T14:00", "Europe/Brussels"),
    "2026-09-25T12:00:00.000Z",
  );
  assert.equal(
    toInstant("2026-12-25T14:00", "Europe/Brussels"),
    "2026-12-25T13:00:00.000Z",
  );
  assert.equal(
    localDateTime("2026-12-25T13:00:00Z", "Europe/Brussels"),
    "2026-12-25T14:00",
  );
});
test("DST gaps and ambiguous time reject rather than silently reschedule", () => {
  assert.throws(() => toInstant("2026-03-29T02:30", "Europe/Brussels"));
  assert.throws(() => toInstant("2026-10-25T02:30", "Europe/Brussels"));
});
