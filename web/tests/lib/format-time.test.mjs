import { test } from "node:test";
import assert from "node:assert/strict";
import { agoLabel, formatDay, formatWhen } from "../../src/lib/format-time.mjs";

const now = new Date("2026-11-11T21:00:00-05:00");
const opts = { now, timeZone: "America/New_York" };

test("formatWhen names today and yesterday in the viewer's zone, otherwise the date", () => {
  assert.equal(formatWhen("2026-11-11T12:00:32Z", opts), "Today 7:00 AM");
  assert.equal(formatWhen("2026-11-10T12:00:00Z", opts), "Yesterday 7:00 AM");
  assert.equal(formatWhen("2026-11-05T12:00:00Z", opts), "Nov 5, 7:00 AM");
  assert.equal(formatWhen("2025-11-05T12:00:00Z", opts), "Nov 5, 2025, 7:00 AM");
});

test("formatWhen reads the calendar day in the given zone, not UTC", () => {
  // 01:30Z on the 12th is still the evening of the 11th in New York.
  assert.equal(formatWhen("2026-11-12T01:30:00Z", opts), "Today 8:30 PM");
});

test("formatWhen says Not yet for a missing time and passes an unparseable one through", () => {
  assert.equal(formatWhen(null), "Not yet");
  assert.equal(formatWhen("soon", opts), "soon");
});

test("formatDay shows the year only when it differs from now", () => {
  assert.equal(formatDay("2026-11-05", now), "Nov 5");
  assert.equal(formatDay("2025-12-31", now), "Dec 31, 2025");
});

test("agoLabel counts days, then weeks, then months", () => {
  assert.equal(agoLabel(0), "today");
  assert.equal(agoLabel(1), "yesterday");
  assert.equal(agoLabel(7), "7 days ago");
  assert.equal(agoLabel(21), "3 weeks ago");
  assert.equal(agoLabel(90), "3 months ago");
  assert.equal(agoLabel(null), "");
});

test("agoLabel shows nothing for a day count that is not a number", () => {
  assert.equal(agoLabel(Number.NaN), "");
  assert.equal(agoLabel(Infinity), "");
});
