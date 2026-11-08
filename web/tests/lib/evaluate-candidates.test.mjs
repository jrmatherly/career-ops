import test from "node:test";
import assert from "node:assert/strict";

import { candidateSince, candidatesFor, localDate, pendingRows } from "../../src/lib/core/evaluate-candidates.mjs";

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const history = (url, firstSeen, status = "added") => ({ url, first_seen: firstSeen, status });

test("the latest added scan-history row decides, not the first", () => {
  const rows = pendingRows("- [ ] https://a.test/1 | A | Role\n- [ ] https://a.test/2 | B | Role\n");
  const scanHistoryRows = [
    history("https://a.test/1", "2026-10-01", "skipped_title"),
    history("https://a.test/1", "2026-11-08"),
    history("https://a.test/2", "2026-10-01"),
    history("https://a.test/2", "2026-11-08", "skipped_expired"),
  ];
  assert.deepEqual(candidatesFor({ pendingRows: rows, scanHistoryRows, since: "2026-11-08" }), [
    { url: "https://a.test/1", ranked: false },
  ]);
  assert.deepEqual(
    candidatesFor({ pendingRows: rows, scanHistoryRows: [history("https://a.test/2", "2026-11-08"), history("https://a.test/2", "2026-10-01")], since: "2026-11-08" }),
    [],
    "an older added row appended later replaces a newer one",
  );
});

test("a row added by hand has no scan-history row and is never a candidate", () => {
  const rows = pendingRows("- [ ] https://a.test/scanned | A | Role\n- [ ] https://a.test/by-hand | B | Role\n");
  const out = candidatesFor({ pendingRows: rows, scanHistoryRows: [history("https://a.test/scanned", "2026-11-08")], since: "2026-11-01" });
  assert.deepEqual(out.map((c) => c.url), ["https://a.test/scanned"]);
});

test("a blank status is an added row, as the scanner reads it", () => {
  const rows = pendingRows("- [ ] https://a.test/1 | A | Role\n");
  assert.equal(candidatesFor({ pendingRows: rows, scanHistoryRows: [history("https://a.test/1", "2026-11-08", "")], since: "2026-11-08" }).length, 1);
});

test("the since day is inclusive and the day before it is not", () => {
  const rows = pendingRows("- [ ] https://a.test/on | A | Role\n- [ ] https://a.test/before | B | Role\n");
  const scanHistoryRows = [history("https://a.test/on", "2026-11-08"), history("https://a.test/before", "2026-11-07")];
  assert.deepEqual(candidatesFor({ pendingRows: rows, scanHistoryRows, since: "2026-11-08" }).map((c) => c.url), ["https://a.test/on"]);
});

test("since is the later of enabledAt and the previous successful run's date in the job's timezone", () => {
  // 03:30 UTC on 2026-11-08 is still 2026-11-07 in New York.
  const runs = [
    { id: "22222222-2222-4222-8222-222222222222", jobId: JOB_ID, state: "success", at: "2026-11-09T12:00:00.000Z" },
    { id: "33333333-3333-4333-8333-333333333333", jobId: JOB_ID, state: "success", at: "2026-11-08T03:30:00.000Z" },
    { id: "44444444-4444-4444-8444-444444444444", jobId: JOB_ID, state: "failed", at: "2026-11-08T23:00:00.000Z" },
    { id: "55555555-5555-4555-8555-555555555555", jobId: "99999999-9999-4999-8999-999999999999", state: "success", at: "2026-11-08T23:00:00.000Z" },
  ];
  const job = (timezone, enabledAt) => ({ id: JOB_ID, timezone, evaluate: { mode: "review", enabledAt, rankThreshold: 3.5, maxPerRun: 5 } });
  const latest = runs[0].id;
  assert.equal(candidateSince({ job: job("America/New_York", "2026-11-01"), runs, excludeRunId: latest }), "2026-11-07");
  assert.equal(candidateSince({ job: job("UTC", "2026-11-01"), runs, excludeRunId: latest }), "2026-11-08");
  assert.equal(candidateSince({ job: job("UTC", "2026-11-09"), runs, excludeRunId: latest }), "2026-11-09", "a later enabledAt wins");
  assert.equal(candidateSince({ job: job("UTC", "2026-11-01"), runs: runs.slice(0, 1), excludeRunId: latest }), "2026-11-01", "with no earlier success, enabledAt is the bound");
  assert.equal(localDate(Date.parse("2026-11-08T03:30:00.000Z"), "America/New_York"), "2026-11-07");
});

test("two spellings of one URL join by normalized key and the pipeline's spelling is returned", () => {
  const rows = pendingRows("- [ ] https://Jobs.Example.test/role/7?utm_source=board | A | Role\n");
  const out = candidatesFor({ pendingRows: rows, scanHistoryRows: [history("https://jobs.example.test/role/7/", "2026-11-08")], since: "2026-11-08" });
  assert.deepEqual(out, [{ url: "https://Jobs.Example.test/role/7?utm_source=board", ranked: false }]);
});

test("a ranked candidate carries its rank and reason, and done rows are not pending", () => {
  const text = [
    "## Pending",
    "- [ ] https://a.test/1 | A | Role | Remote | posted: 2026-11-07 | rank: 4.2/5 — strong match",
    "- [x] https://a.test/2 | B | Role",
    "- [ ] https://a.test/3 | C | Role\r",
    "- [ ] https://a.test/4 | D | Role | rank: n/a",
  ].join("\n");
  const out = candidatesFor({
    pendingRows: pendingRows(text),
    scanHistoryRows: ["https://a.test/1", "https://a.test/2", "https://a.test/3", "https://a.test/4"].map((url) => history(url, "2026-11-08")),
    since: "2026-11-08",
  });
  assert.deepEqual(out, [
    { url: "https://a.test/1", ranked: true, rank: 4.2, reason: "strong match" },
    { url: "https://a.test/3", ranked: false },
    { url: "https://a.test/4", ranked: true },
  ], "any rank label is ranked, as rank-pipeline.mjs reads it, so the pass never resends that row");
});
