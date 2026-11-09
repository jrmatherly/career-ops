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

test("an edit body without the six lists keeps the base job's lists", async () => {
  const { parseExplorePatch, DEFAULT_FILTERS } = await import("../../src/lib/explore.ts");
  const stored = { ...DEFAULT_FILTERS, ...filters };
  const body = scheduledJobBody({ name: "Scan", filtersFrom: "file", filters: { ...filters, positive: ["typed then toggled"], allow: ["EU"], sinceDays: 14 }, every: 3, unit: "hours" });
  const saved = parseExplorePatch(body.filters, stored);
  for (const key of ["positive", "negative", "allow", "block", "blockHard", "alwaysAllow"]) assert.deepEqual(saved[key], stored[key], key);
  assert.equal(saved.sinceDays, 14, "the rest of the body still applies");
});

test("the body carries evaluate when given and leaves the key out when not, so an edit keeps the stored settings", () => {
  const evaluate = { mode: "auto", rankThreshold: 4, maxPerRun: 3 };
  assert.deepEqual(scheduledJobBody({ name: "Scan", filters, every: 1, unit: "days", evaluate }).evaluate, evaluate);
  assert.deepEqual(scheduledJobBody({ name: "Scan", filters, every: 1, unit: "days", evaluate: { mode: "off" } }).evaluate, { mode: "off" });
  assert.equal("evaluate" in scheduledJobBody({ name: "Scan", filters, every: 1, unit: "days" }), false);
});
