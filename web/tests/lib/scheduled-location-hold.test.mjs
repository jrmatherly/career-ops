// The rank pass of an auto job with a location hold queues only the rows its
// workplace policy admits; the rest are ranked and written as held-location.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { rankPass } from "../../scripts/scheduled-jobs-runner.mjs";
import { readScheduledStore } from "../../src/lib/scheduled-jobs-store.mjs";
import { hostLocalDate } from "../../src/lib/core/evaluate-candidates.mjs";
import { readLedger } from "../../../lib/evaluate-queue.mjs";

const JOB = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const NOW = "2026-11-08T15:00:00.000Z";
const DAY = hostLocalDate(Date.parse(NOW));
const HOLD = { onsiteLocations: ["Springfield"], remoteCountries: ["United States"] };
const AUTO = { mode: "auto", enabledAt: "2026-11-01", rankThreshold: 3.5, maxPerRun: 5 };
const ROWS = { remote: "Remote, United States", home: "Springfield, IL", elsewhere: "Metropolis, NY", blank: "" };
const urlOf = (name) => `https://boards.test/fixture/${name}`;

async function withRoot(evaluate, fn, extra = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-location-hold-"));
  const storePath = path.join(root, "data", "scheduled-jobs.json");
  const rows = [...Object.entries(ROWS).map(([name, location]) => [urlOf(name), location]), ...extra.map((name) => [urlOf(name), "Metropolis, NY"])];
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "pipeline.md"), ["## Pending", ...rows.map(([url]) => `- [ ] ${url} | Fixture Alpha | Platform Lead`), ""].join("\n"));
  fs.writeFileSync(path.join(root, "data", "scan-history.tsv"), [
    "url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation",
    ...rows.map(([url, location]) => `${url}\t${DAY}\tboards\tPlatform Lead\tFixture Alpha\tadded\t${location}`),
    "",
  ].join("\n"));
  fs.writeFileSync(storePath, JSON.stringify({
    jobs: [{ id: JOB, name: "Hold", status: "active", engine: "full", filters: {}, timezone: "UTC", startAt: NOW, every: 1, unit: "days", createdAt: NOW, updatedAt: NOW, evaluate }],
    runs: [{ id: RUN, jobId: JOB, at: NOW, state: "success", attempt: 1, rolesFound: rows.length }],
    queue: [],
  }));
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try {
    await rankPass(root, storePath, { spawnFn: fakeRanker });
    return await fn({ root, run: readScheduledStore(storePath).runs.find((run) => run.id === RUN) });
  } finally {
    process.stderr.write = write;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// Stands in for rank-pipeline.mjs: every URL it is sent gets rank 4.0.
function fakeRanker(_node, args, options) {
  const urls = fs.readFileSync(args[args.indexOf("--urls-file") + 1], "utf8").split("\n").filter(Boolean);
  const file = path.join(options.env.CAREER_OPS_ROOT, "data", "pipeline.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").split("\n").map((line) =>
    urls.some((url) => line.startsWith(`- [ ] ${url} `)) ? `${line} | rank: 4.0/5 — fake` : line).join("\n"));
  return { status: 0, stdout: "", stderr: "" };
}

const ledgerStates = (root) => Object.fromEntries(readLedger(root).map((entry) =>
  [entry.url.split("/").at(-1), entry.reason ? `${entry.state}:${entry.reason}` : entry.state]));

test("auto mode queues the remote and home rows and holds the rest", async () => {
  await withRoot({ ...AUTO, hold: HOLD }, ({ root, run }) => {
    assert.deepEqual(ledgerStates(root), { remote: "queued", home: "queued", elsewhere: "skipped:held-location", blank: "skipped:held-location" });
    assert.equal(run.autoQueued, 2);
    assert.equal(run.evalMessage, undefined);
  });
});

test("a job with no hold queues all four", async () => {
  await withRoot(AUTO, ({ run }) => assert.equal(run.autoQueued, 4));
});

for (const [label, hold] of [["an unknown country", { ...HOLD, remoteCountries: ["Atlantis"] }], ["an empty object", {}], ["a string", "Springfield"], ["null", null], ["false", false],
  ["an empty home area", { ...HOLD, onsiteLocations: [] }], ["two empty lists", { onsiteLocations: [], remoteCountries: [] }]]) {
  test(`a hold edited by hand to ${label} queues nothing and says why on the run`, async () => {
    await withRoot({ ...AUTO, hold }, ({ root, run }) => {
      assert.deepEqual(ledgerStates(root), {});
      assert.match(run.evalMessage, /^Location hold: .*\. Nothing was queued\.$/);
      assert.equal(run.ranked, 4);
    });
  });
}

test("a hold that cannot be built keeps the waiting message, so the run stays due", async () => {
  const extra = Array.from({ length: 48 }, (_, i) => `bulk-${i}`);
  await withRoot({ ...AUTO, hold: { ...HOLD, remoteCountries: ["Atlantis"] } }, ({ run }) => {
    assert.match(run.evalMessage, /^Location hold: .*Nothing was queued\. 2 rows wait for the next rank pass\.$/);
  }, extra);
});

test("correcting a broken hold queues the rows on the next pass, without another scan", async () => {
  await withRoot({ ...AUTO, hold: { ...HOLD, remoteCountries: ["Atlantis"] } }, async ({ root }) => {
    const storePath = path.join(root, "data", "scheduled-jobs.json");
    const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
    store.jobs[0].evaluate.hold = HOLD;
    fs.writeFileSync(storePath, JSON.stringify(store));
    await rankPass(root, storePath, { spawnFn: fakeRanker });
    assert.deepEqual(ledgerStates(root), { remote: "queued", home: "queued", elsewhere: "skipped:held-location", blank: "skipped:held-location" });
    const run = readScheduledStore(storePath).runs.find((item) => item.id === RUN);
    assert.deepEqual([run.autoQueued, run.evalMessage], [2, undefined]);
    await rankPass(root, storePath, { spawnFn: fakeRanker });
    assert.equal(readLedger(root).flatMap((entry) => entry.rows).length, 4, "a pass after that appends nothing");
  });
});

test("a broken hold beside a failed rank pass does not start the ranker again each tick", async () => {
  let calls = 0;
  const failing = () => { calls += 1; return { status: 1, stdout: "", stderr: "ranker: boom\n" }; };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-location-hold-"));
  const storePath = path.join(root, "data", "scheduled-jobs.json");
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "pipeline.md"), `## Pending\n- [ ] ${urlOf("remote")} | Fixture Alpha | Platform Lead\n`);
  fs.writeFileSync(path.join(root, "data", "scan-history.tsv"), `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n${urlOf("remote")}\t${DAY}\tboards\tPlatform Lead\tFixture Alpha\tadded\tRemote, United States\n`);
  fs.writeFileSync(storePath, JSON.stringify({
    jobs: [{ id: JOB, name: "Hold", status: "active", engine: "full", filters: {}, timezone: "UTC", startAt: NOW, every: 1, unit: "days", createdAt: NOW, updatedAt: NOW, evaluate: { ...AUTO, hold: { ...HOLD, remoteCountries: ["Atlantis"] } } }],
    runs: [{ id: RUN, jobId: JOB, at: NOW, state: "success", attempt: 1, rolesFound: 1 }],
    queue: [],
  }));
  const write = process.stderr.write;
  process.stderr.write = () => true;
  try {
    await rankPass(root, storePath, { spawnFn: failing });
    await rankPass(root, storePath, { spawnFn: failing });
  } finally {
    process.stderr.write = write;
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(calls, 1);
});

test("review mode with a hold writes no ledger row and no message", async () => {
  await withRoot({ ...AUTO, mode: "review", hold: HOLD }, ({ root, run }) => {
    assert.deepEqual(ledgerStates(root), {});
    assert.equal(run.evalMessage, undefined);
  });
});
