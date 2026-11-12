import { test } from "node:test";
import assert from "node:assert/strict";
import { cadenceLabel } from "../../src/lib/scheduled-cadence.mjs";

test("a one-day interval reads as daily with the local time and a spelled-out zone", () => {
  assert.equal(
    cadenceLabel({ unit: "days", every: 1, timezone: "America/New_York", startAt: "2026-11-06T12:00:00.000Z" }),
    "Daily · 7:00 AM Eastern",
  );
});

test("a seven-day interval reads as weekly with the weekday, and UTC stays UTC", () => {
  assert.equal(
    cadenceLabel({ unit: "days", every: 7, timezone: "UTC", startAt: "2026-11-08T04:18:28.829Z" }),
    "Weekly · Sun 4:18 AM UTC",
  );
});

test("any other interval names its count and unit", () => {
  assert.equal(
    cadenceLabel({ unit: "hours", every: 6, timezone: "America/Los_Angeles", startAt: "2026-11-06T12:00:00.000Z" }),
    "Every 6 hours · 4:00 AM Pacific",
  );
});
