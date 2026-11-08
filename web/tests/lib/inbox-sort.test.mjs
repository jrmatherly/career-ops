import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { addedEmptyState, addedParam, compareInboxJobs, latestAddedDates } from "../../src/lib/inbox-sort.mjs";

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

test("addedParam rejects a date the calendar does not have", () => {
  assert.equal(addedParam("2024-02-29"), "2024-02-29");
  for (const raw of ["2026-13-45", "2026-02-30", "2026-00-10"]) assert.equal(addedParam(raw), null);
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

test("latestAddedDates keeps the five newest dates by default", () => {
  const jobs = ["01", "02", "03", "04", "05", "06"].map((d) => ({ url: d, addedAt: `2026-11-${d}` }));
  assert.deepEqual(latestAddedDates(jobs, []), ["2026-11-06", "2026-11-05", "2026-11-04", "2026-11-03", "2026-11-02"]);
});

test("addedEmptyState says nothing while a pending row carries the date", () => {
  const jobs = [{ url: "a", addedAt: "2026-11-06" }];
  assert.equal(addedEmptyState(null, jobs, [], ["2026-11-06"]), null);
  assert.equal(addedEmptyState("2026-11-06", jobs, [], ["2026-11-06"]), null);
});

test("addedEmptyState: a date the scan history lacks added no roles", () => {
  assert.deepEqual(addedEmptyState("2026-11-03", [{ url: "a", addedAt: "2026-11-06" }], [], ["2026-11-06"]), {
    title: "No roles were added on 2026-11-03",
    hint: "Pick another scan date, or clear the filter.",
  });
});

test("addedEmptyState: a scanned date with no pending row was skipped or tracked", () => {
  const title = addedEmptyState("2026-11-05", [], [], ["2026-11-05", "2026-11-06"])?.title;
  assert.equal(title, "Every role added on 2026-11-05 has been skipped or tracked");
});

test("the Inbox empty state renders addedEmptyState's copy", () => {
  const src = readFileSync(new URL("../../src/components/inbox/inbox-triage.tsx", import.meta.url), "utf8");
  assert.match(src, /addedEmptyState\(added, enrichedJobs, hidden, scanDates\)/);
  assert.match(src, /\{addedCopy\?\.title \?\? "No matches"\}/);
  assert.match(src, /\{addedCopy\?\.hint \?\? "Loosen the filters to see more of your inbox\."\}/);
});

test("addedEmptyState counts a hidden row as skipped", () => {
  const title = addedEmptyState("2026-11-05", [{ url: "a", addedAt: "2026-11-05" }], ["a"], ["2026-11-05"])?.title;
  assert.equal(title, "Every role added on 2026-11-05 has been skipped or tracked");
});
