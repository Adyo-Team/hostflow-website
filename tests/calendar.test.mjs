import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { addDays, dayDistance, validDate, overlaps, placement, todayInZone } from "../lib/calendar/dates.mjs";
test("calendar rejects impossible civil dates", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("not-a-date"), false);
});
test("calendar navigation crosses month, year, leap and DST boundaries", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 2), "2028-03-01");
  assert.equal(dayDistance("2026-03-28", "2026-03-30"), 2);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.ok(validDate(todayInZone("Europe/Brussels")));
});
test("adjacent stays do not occupy the same day", () => {
  assert.equal(overlaps("2026-09-10", "2026-09-15", "2026-09-15", "2026-09-20"), false);
  assert.equal(overlaps("2026-09-10", "2026-09-15", "2026-09-14", "2026-09-20"), true);
});
test("calendar clips multi-day bars at both visible boundaries", () => {
  assert.deepEqual(placement("2026-09-01", "2026-10-01", "2026-09-10", "2026-09-24"), { offset: 0, span: 14 });
  assert.deepEqual(placement("2026-09-12", "2026-09-15", "2026-09-10", "2026-09-24"), { offset: 2, span: 3 });
  assert.equal(placement("2026-09-01", "2026-09-10", "2026-09-10", "2026-09-24"), null);
  assert.equal(placement("2026-09-24", "2026-09-25", "2026-09-10", "2026-09-24"), null);
});
test("calendar endpoint is behind existing authentication and role checks", async () => {
  const source = await readFile(new URL("../lib/reservations/server.ts", import.meta.url), "utf8");
  assert.ok(source.indexOf("!canManageReservations(member.data.role)") < source.indexOf('path[0] === "calendar"'));
  const calendar = source.split('path[0] === "calendar"')[1].split("const isBlock")[0];
  assert.match(calendar, /eq\("organization_id", org\)/);
  assert.match(calendar, /eq\("status", "confirmed"\)/);
  assert.match(calendar, /eq\("active", true\)/);
  assert.match(calendar, /lt\("check_in", end\)\.gt\("check_out", start\)/);
  assert.match(calendar, /lt\("start_date", end\)\.gt\("end_date", start\)/);
  assert.match(calendar, /in\("property_id", ids\)/);
  assert.match(calendar, /Promise.all/);
  assert.match(calendar, /range\(offset, offset \+ 499\)/);
});
