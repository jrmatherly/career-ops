import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { runDrain } from "../../scripts/evaluate-drain.mjs";
import { readScheduledStore } from "../../src/lib/scheduled-jobs-store.mjs";
import { checkRequest } from "../../src/lib/origin-guard.mjs";
import { appendRow, readLedger } from "../../../lib/evaluate-queue.mjs";

const JOB = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const BOARD = "https://job-boards.greenhouse.io/fictional";
const url = (n) => `${BOARD}/jobs/${n}`;
const OPT_IN = { CAREER_OPS_AUTO_EVALUATE_LOCAL: "1" };
const AUTO = { mode: "auto", enabledAt: "2026-11-01", rankThreshold: 3.5, maxPerRun: 5 };
const T0 = Date.parse("2026-11-08T12:00:00.000Z");
const TRACKER_HEAD = "# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |\n|---|---|---|---|---|---|---|---|---|---|\n";

const done = (n) => [{ type: "status", label: "Saving report…" }, { type: "done", tokens: 1, costUsd: 0, reportN: n }];

/**
 * A data root with one auto job whose run queued `urls` (best rank first), all
 * pending in pipeline.md, and a stand-in dashboard. `answer(body, root)` returns
 * the NDJSON events for one /api/run POST, a status number, "drop" to cut the
 * connection, or "hang" to send keepalives and never end.
 */
async function withDrainRoot(t, { urls, answer = () => done(1), healthy = true, evaluate = AUTO }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-drain-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const storePath = path.join(root, "data", "scheduled-jobs.json");
  fs.mkdirSync(path.join(root, "data"));
  fs.writeFileSync(path.join(root, "data", "pipeline.md"), `## Pending\n${urls.map((u) => `- [ ] ${u} | Fictional Co | Engineer`).join("\n")}\n`);
  fs.writeFileSync(path.join(root, "data", "applications.md"), TRACKER_HEAD);
  const job = { id: JOB, name: "Auto", status: "active", engine: "full", filters: {}, timezone: "UTC", startAt: "2026-11-01T00:00:00.000Z", every: 1, unit: "days", createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z", evaluate };
  fs.writeFileSync(storePath, JSON.stringify({ jobs: [job], runs: [{ id: RUN, jobId: JOB, at: "2026-11-08T11:00:00.000Z", state: "success", attempt: 1, rolesFound: urls.length }], queue: [] }));
  for (const [i, u] of urls.entries()) {
    await appendRow(root, { url: u, at: new Date(T0 - 60_000).toISOString(), jobId: JOB, runId: RUN, rank: 5 - i * 0.1, state: "queued", source: "rank-pass" });
  }

  const posts = [];
  const server = http.createServer((req, res) => {
    if (req.url === "/api/healthz") {
      res.writeHead(healthy ? 200 : 503).end(JSON.stringify({ ok: healthy }));
      return;
    }
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const body = JSON.parse(raw);
      const ledger = readLedger(root, { now: T0 }).find((entry) => entry.url === body.input);
      posts.push({ headers: req.headers, body, stateAtPost: ledger?.state });
      const reply = answer(body, root);
      if (reply === "drop") return req.socket.destroy();
      if (reply === "hang") {
        res.writeHead(200, { "Content-Type": "text/plain" });
        const beat = setInterval(() => res.write(`${JSON.stringify({ type: "keepalive" })}\n`), 20);
        req.socket.on("close", () => clearInterval(beat));
        return;
      }
      if (typeof reply === "number") return res.writeHead(reply, { "Content-Type": "application/json" }).end(JSON.stringify({ error: `refused ${reply}` }));
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(reply.map((event) => `${JSON.stringify(event)}\n`).join(""));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const stderr = [];
  t.mock.method(process.stderr, "write", (chunk) => { stderr.push(String(chunk)); return true; });
  const drain = (options = {}) => runDrain({ root, storePath, baseUrl, fetchJd: async () => ({ text: "Posting text." }), now: () => T0, env: OPT_IN, ...options });
  const state = (u) => readLedger(root, { now: T0 }).find((entry) => entry.url === u);
  return { root, storePath, posts, drain, state, stderr };
}

test("outside a pod the drain refuses, names the opt-in and appends nothing", async (t) => {
  const { root, drain, stderr, posts } = await withDrainRoot(t, { urls: [url(1)] });
  const before = fs.readFileSync(path.join(root, "data", "evaluate-queue.tsv"), "utf8");
  const result = await drain({ env: {} });
  assert.equal(result.status, "refused");
  assert.match(result.reason, /CAREER_OPS_AUTO_EVALUATE_LOCAL/);
  assert.equal(result.evaluated, 0);
  assert.match(stderr.join(""), /set CAREER_OPS_AUTO_EVALUATE_LOCAL=1/);
  assert.equal(fs.readFileSync(path.join(root, "data", "evaluate-queue.tsv"), "utf8"), before);
  assert.equal(posts.length, 0);
});

test("inside a pod the drain runs without the opt-in", async (t) => {
  const { drain, state } = await withDrainRoot(t, { urls: [url(1)] });
  const result = await drain({ env: { KUBERNETES_SERVICE_HOST: "10.0.0.1" } });
  assert.equal(result.status, "drained");
  assert.equal(state(url(1)).state, "evaluated");
});

test("an evaluated row writes running before the POST, which carries the evaluate-text body and Host: localhost", async (t) => {
  const { drain, state, posts, storePath } = await withDrainRoot(t, { urls: [url(1)], answer: () => done(7) });
  const result = await drain();
  assert.equal(result.evaluated, 1);
  const [post] = posts;
  assert.equal(post.stateAtPost, "running", "the running row is on disk before the POST");
  assert.equal(post.headers.host, "localhost");
  assert.equal(post.headers.origin, undefined);
  assert.deepEqual(post.body, { kind: "evaluate-text", input: url(1), cliId: "claude", jdText: "Posting text." });
  const entry = state(url(1));
  assert.deepEqual(entry.rows.map((row) => row.state), ["queued", "running", "evaluated"]);
  assert.equal(entry.reason, "report 7");
  const run = readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  assert.deepEqual([run.evaluated, run.gated, run.evalErrors], [1, 0, 0]);
});

test("each skip reason is recorded and none of them POSTs", async (t) => {
  const urls = [url(1), url(2), url(3), url(4), "https://careers.example.test/job/5"];
  const { root, drain, state, posts } = await withDrainRoot(t, { urls });
  const pipeline = path.join(root, "data", "pipeline.md");
  fs.writeFileSync(pipeline, fs.readFileSync(pipeline, "utf8").replace(`- [ ] ${url(1)}`, `- [x] ${url(1)}`));
  fs.appendFileSync(path.join(root, "data", "applications.md"), `| 1 | 2026-11-08 | Fictional Co | Engineer | 4.0/5 | Evaluated | ❌ | — | — | ${url(2)} |\n`);
  // A crash between the report write and the merge leaves a report, or its tracker-addition, and no tracker row.
  fs.mkdirSync(path.join(root, "reports"));
  fs.writeFileSync(path.join(root, "reports", "003-fictional-co-2026-11-08.md"), `# Evaluation: Fictional Co\n\n**URL:** ${url(3)}/\n`);
  fs.mkdirSync(path.join(root, "batch", "tracker-additions"), { recursive: true });
  fs.writeFileSync(path.join(root, "batch", "tracker-additions", "004-fictional-co.tsv"), `num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n4\t2026-11-08\tFictional Co\tEngineer\tEvaluated\t4.0/5\t❌\t[4](reports/004-x.md)\t—\t${url(4)}\n`);

  const result = await drain();
  assert.equal(posts.length, 0);
  assert.equal(result.skipped, 5);
  assert.deepEqual(urls.map((u) => [state(u).state, state(u).reason]), [
    ["skipped", "not-pending"],
    ["skipped", "already-evaluated"],
    ["skipped", "report-exists"],
    ["skipped", "report-exists"],
    ["skipped", "no-api-text"],
  ]);
  await drain();
  assert.equal(state(urls[4]).rows.length, 2, "a skipped row is not touched again");
});

test("a null or thrown posting-text fetch leaves the row queued with its reason, written once", async (t) => {
  for (const [fetchJd, reason] of [
    [async () => null, "no-text: the ATS API returned no text"],
    [async () => { throw new Error("socket hang up"); }, "no-text: socket hang up"],
    [async () => ({ text: " \0 " }), "no-text: the ATS API returned no text"],
  ]) {
    const { drain, state, posts, stderr } = await withDrainRoot(t, { urls: [url(1)] });
    await drain({ fetchJd });
    await drain({ fetchJd });
    assert.equal(posts.length, 0);
    assert.deepEqual([state(url(1)).state, state(url(1)).reason, state(url(1)).failures], ["queued", reason, 0]);
    assert.equal(state(url(1)).rows.length, 2, "the second tick with the same reason appends nothing");
    assert.match(stderr.join(""), /it stays queued/);
  }
});

test("a NUL in the posting text is stripped before the POST", async (t) => {
  const { drain, state, posts } = await withDrainRoot(t, { urls: [url(1)] });
  await drain({ fetchJd: async () => ({ text: "Posting\0 text." }) });
  assert.equal(posts[0].body.jdText, "Posting text.");
  assert.equal(state(url(1)).state, "evaluated");
});

test("a run that keeps sending keepalives past the deadline is cut off as dashboard-offline", async (t) => {
  const { drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2)], answer: () => "hang" });
  const started = Date.now();
  const result = await drain({ runTimeoutMs: 300 });
  assert.ok(Date.now() - started < 5_000, "the wall-clock deadline ended the request");
  assert.equal(result.status, "offline");
  assert.deepEqual([state(url(1)).state, state(url(1)).reason], ["queued", "dashboard-offline"]);
  assert.equal(posts.length, 1);
});

test("an offline tick after a stale running row keeps the failure it charged", async (t) => {
  const { root, drain, state } = await withDrainRoot(t, { urls: [url(1)], healthy: false });
  await appendRow(root, { url: url(1), at: new Date(T0 - 900_000).toISOString(), jobId: JOB, runId: RUN, state: "running", source: "drain" });
  assert.equal(state(url(1)).failures, 1);
  await drain();
  assert.deepEqual([state(url(1)).state, state(url(1)).reason, state(url(1)).failures], ["queued", "dashboard-offline", 1]);
});

test("a full daily cap with rows still queued answers capped and says so", async (t) => {
  const { root, drain, posts, stderr } = await withDrainRoot(t, { urls: [url(1), url(2)] });
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "profile.yml"), "pipeline:\n  auto_evaluate_daily_cap: 1\n");
  const saved = process.env.CAREER_OPS_PROFILE;
  delete process.env.CAREER_OPS_PROFILE;
  t.after(() => { if (saved !== undefined) process.env.CAREER_OPS_PROFILE = saved; });
  assert.equal((await drain()).status, "drained");
  assert.equal((await drain()).status, "capped");
  assert.equal(posts.length, 1);
  assert.match(stderr.join(""), /daily cap 1 reached, 1 started today; queued rows wait for the next UTC day/);
});

test("malformed ledger rows are named on stderr", async (t) => {
  const { root, drain, stderr } = await withDrainRoot(t, { urls: [url(1)] });
  fs.appendFileSync(path.join(root, "data", "evaluate-queue.tsv"), "not a ledger row\n");
  await drain();
  assert.match(stderr.join(""), /1 malformed row\(s\) in data\/evaluate-queue\.tsv skipped/);
});

test("the dashboard's guard lets the drain's POST through: Host localhost, no Origin", () => {
  const decision = checkRequest({ secFetchSite: null, origin: null, host: "localhost", allowedHosts: new Set(), allowedOrigins: new Set(), method: "POST", secFetchMode: null, secFetchDest: null, pathname: "/api/run" });
  assert.deepEqual(decision, { ok: true });
});

test("a gated run records gated with its reason", async (t) => {
  const answer = () => [{ type: "gated", reason: "dealbreaker", message: "On-site five days." }];
  const { drain, state, storePath } = await withDrainRoot(t, { urls: [url(1)], answer });
  const result = await drain();
  assert.equal(result.gated, 1);
  assert.deepEqual([state(url(1)).state, state(url(1)).reason], ["gated", "dealbreaker"]);
  assert.equal(readScheduledStore(storePath).runs.find((r) => r.id === RUN).gated, 1);
});

test("a usage-limit error stops the batch and leaves the rest queued", async (t) => {
  const answer = (body) => (body.input === url(2)
    ? [{ type: "error", msg: "Claude AI usage limit reached|1762650000" }, { type: "error", msg: "This run hit an error before finishing." }]
    : done(1));
  const urls = [url(1), url(2), url(3)];
  const { drain, state, posts, storePath } = await withDrainRoot(t, { urls, answer });
  const result = await drain();
  assert.equal(result.status, "stopped");
  assert.deepEqual(urls.map((u) => state(u).state), ["evaluated", "failed", "queued"]);
  assert.equal(posts.length, 2);
  assert.equal(readScheduledStore(storePath).runs.find((r) => r.id === RUN).evalErrors, 1);
});

test("an ordinary error is failed and the batch goes on, and a rate limit stops it too", async (t) => {
  const answer = (body) => (body.input === url(1) ? [{ type: "error", msg: "The report was saved but merge-tracker.mjs failed." }] : done(2));
  const run1 = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
  await run1.drain();
  assert.deepEqual([run1.state(url(1)).state, run1.state(url(2)).state], ["failed", "evaluated"]);
  const run2 = await withDrainRoot(t, { urls: [url(1), url(2)], answer: () => [{ type: "error", msg: "429 rate limit exceeded" }] });
  assert.equal((await run2.drain()).status, "stopped");
  assert.equal(run2.state(url(2)).state, "queued");
});

test("a 409 leaves the row queued as in-flight", async (t) => {
  const { drain, state } = await withDrainRoot(t, { urls: [url(1)], answer: () => 409 });
  await drain();
  assert.deepEqual([state(url(1)).state, state(url(1)).reason], ["queued", "in-flight"]);
});

test("a refused request stops the batch and leaves the row queued with its retries", async (t) => {
  const { drain, state } = await withDrainRoot(t, { urls: [url(1), url(2)], answer: () => 400 });
  assert.equal((await drain()).status, "stopped");
  const entry = state(url(1));
  assert.deepEqual([entry.state, entry.reason, entry.failures, state(url(2)).state], ["queued", "refused: refused 400", 0, "queued"]);
});

test("a row with no posting text yet does not hold the job's only slot", async (t) => {
  const { drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2)], evaluate: { ...AUTO, maxPerRun: 1 } });
  await drain({ fetchJd: async (u) => (u === url(1) ? null : { text: "Posting text." }) });
  assert.deepEqual([state(url(1)).state, state(url(2)).state], ["queued", "evaluated"]);
  assert.equal(posts.length, 1, "maxPerRun still caps the evaluations started");
});

test("a POST that fails in transport leaves the row queued as dashboard-offline with no retry used", async (t) => {
  for (const answer of [() => "drop", () => [{ type: "status", label: "Saving report…" }]]) {
    const { drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
    const result = await drain();
    assert.equal(result.status, "offline");
    assert.equal(posts.length, 1, "the drain stops at the first offline answer");
    const entry = state(url(1));
    assert.deepEqual([entry.state, entry.reason, entry.failures], ["queued", "dashboard-offline", 0]);
    assert.equal(state(url(2)).rows.length, 1);
  }
});

test("a dashboard that fails its health probe leaves every planned row queued as dashboard-offline, once", async (t) => {
  const { drain, state, posts, stderr } = await withDrainRoot(t, { urls: [url(1), url(2)], healthy: false });
  assert.equal((await drain()).status, "offline");
  await drain();
  assert.equal(posts.length, 0);
  for (const u of [url(1), url(2)]) {
    assert.deepEqual(state(u).rows.map((row) => [row.state, row.reason]), [["queued", ""], ["queued", "dashboard-offline"]]);
  }
  assert.match(stderr.join(""), /did not answer \/api\/healthz/);
});

test("a stale running row is retried, and a job no longer in auto is not drained", async (t) => {
  const { root, drain, state, posts, storePath } = await withDrainRoot(t, { urls: [url(1)] });
  await appendRow(root, { url: url(1), at: new Date(T0 - 900_000).toISOString(), jobId: JOB, runId: RUN, state: "running", source: "drain" });
  await drain();
  assert.equal(state(url(1)).state, "evaluated");
  assert.equal(posts.length, 1);
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  store.jobs[0].evaluate.mode = "review";
  fs.writeFileSync(storePath, JSON.stringify(store));
  await appendRow(root, { url: url(1), jobId: JOB, runId: RUN, state: "queued", source: "drain" });
  assert.equal((await drain()).status, "idle");
  assert.equal(posts.length, 1);
});

test("the daily cap from the profile limits how many start", async (t) => {
  const urls = [url(1), url(2), url(3)];
  const { root, drain, state } = await withDrainRoot(t, { urls });
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "profile.yml"), "pipeline:\n  auto_evaluate_daily_cap: 2\n");
  const saved = process.env.CAREER_OPS_PROFILE;
  delete process.env.CAREER_OPS_PROFILE;
  t.after(() => { if (saved !== undefined) process.env.CAREER_OPS_PROFILE = saved; });
  await drain();
  assert.deepEqual(urls.map((u) => state(u).state), ["evaluated", "evaluated", "queued"]);
});
