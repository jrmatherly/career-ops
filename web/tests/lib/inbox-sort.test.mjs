import { test } from "node:test";
import assert from "node:assert/strict";
import { addedParam, compareInboxJobs, latestAddedDates } from "../../src/lib/inbox-sort.mjs";

const row = (name, rank, age) => ({ job: { url: name, ...(rank != null && { rank }) }, age });
const order = (rows) => [...rows].sort(compareInboxJobs).map((r) => r.job.url);

test("ranked rows come first, highest rank first", () => {
  const rows = [row("new", undefined, 0), row("low", 2.1, 9), row("high", 4.6, 30), row("mid", 3.5, 1)];
  assert.deepEqual(order(rows), ["high", "mid", "low", "new"]);
});

test("unranked rows keep newest first, unknown age last", () => {
  const rows = [row("unknown", undefined, null), row("old", undefined, 12), row("today", undefined, 0)];
  assert.deepEqual(order(rows), ["today", "old", "unknown"]);
});

test("equal ranks fall back to age", () => {
  const rows = [row("a", 4, 5), row("b", 4, null), row("c", 4, 1)];
  assert.deepEqual(order(rows), ["c", "a", "b"]);
});

test("a rank of 0 still sorts above an unranked row", () => {
  assert.deepEqual(order([row("none", undefined, 0), row("zero", 0, 40)]), ["zero", "none"]);
});

test("addedParam keeps only a YYYY-MM-DD date", () => {
  assert.equal(addedParam("2026-11-08"), "2026-11-08");
  for (const raw of [null, "", "2026-11-8", "today", "2026-11-08x"]) assert.equal(addedParam(raw), null);
});

test("latestAddedDates lists distinct scan dates newest first, skipping hidden rows", () => {
  const jobs = [
    { url: "a", addedAt: "2026-11-03" },
    { url: "b", addedAt: "2026-11-08" },
    { url: "c", addedAt: "2026-11-08" },
    { url: "d", addedAt: "2026-11-05" },
    { url: "e" },
  ];
  assert.deepEqual(latestAddedDates(jobs, ["d"]), ["2026-11-08", "2026-11-03"]);
  assert.deepEqual(latestAddedDates(jobs, [], 2), ["2026-11-08", "2026-11-05"]);
});
