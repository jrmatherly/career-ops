import test from "node:test";
import assert from "node:assert/strict";
import { scheduledJobBody as build } from "../../src/lib/scheduled-job-body.mjs";

// The client sends the body through JSON.stringify, which drops undefined fields.
const scheduledJobBody = (fields) => JSON.parse(JSON.stringify(build(fields)));

const filters = {
  positive: ["engineer"],
  negative: ["intern"],
  allow: ["Remote"],
  block: ["India"],
  blockHard: ["Brazil"],
  alwaysAllow: ["Porto"],
  sinceDays: 3,
  ats: ["lever"],
  limitPerAts: 200,
};

test("a custom job body carries filtersFrom and every list", () => {
  const body = scheduledJobBody({ name: "Scan", engine: "full", filtersFrom: "custom", filters, every: 6, unit: "hours" });
  assert.deepEqual(body, { name: "Scan", engine: "full", filtersFrom: "custom", filters, every: 6, unit: "hours" });
});

test("a file job body carries filtersFrom and drops the six lists", () => {
  const body = scheduledJobBody({
    name: "Scan",
    filtersFrom: "file",
    filters,
    every: 3,
    unit: "hours",
    timezone: "UTC",
    startAt: "2026-11-08T00:00:00.000Z",
  });
  assert.equal(body.filtersFrom, "file");
  assert.deepEqual(body.filters, { sinceDays: 3, ats: ["lever"], limitPerAts: 200 });
  assert.equal(body.timezone, "UTC");
  assert.equal("engine" in body, false, "an omitted engine stays out so the route keeps its default");
});

test("filtersFrom defaults to custom", () => {
  assert.equal(scheduledJobBody({ name: "Scan", filters, every: 1, unit: "days" }).filtersFrom, "custom");
});
