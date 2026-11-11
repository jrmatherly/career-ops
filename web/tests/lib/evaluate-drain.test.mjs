import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import { runDrain } from "../../scripts/evaluate-drain.mjs";
import { rankPass } from "../../scripts/scheduled-jobs-runner.mjs";
import { readScheduledStore } from "../../src/lib/scheduled-jobs-store.mjs";
import { checkRequest } from "../../src/lib/origin-guard.mjs";
import { timeoutMessage } from "../../src/lib/run-cli-support.mjs";
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
    [async () => { throw new Error("socket hang up\n  at fetch"); }, "no-text: socket hang up   at fetch"],
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

test("a row queued by a job that left auto mode is taken over by an auto job's rank pass and drained", async (t) => {
  const { root, storePath, drain, state, posts } = await withDrainRoot(t, { urls: [url(1)] });
  const B = "33333333-3333-4333-8333-333333333333";
  const RUN_B = "44444444-4444-4444-8444-444444444444";
  fs.writeFileSync(path.join(root, "data", "pipeline.md"), `## Pending\n- [ ] ${url(1)} | Fictional Co | Engineer | rank: 4.5/5 — fixture\n`);
  fs.writeFileSync(path.join(root, "data", "scan-history.tsv"), `url\tfirst_seen\tportal\ttitle\tcompany\tstatus\n${url(1)}\t2026-11-08\tgreenhouse\tEngineer\tFictional Co\tadded\n`);
  const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
  store.jobs[0].evaluate.mode = "review";
  store.jobs.push({ ...store.jobs[0], id: B, name: "Auto B", evaluate: { ...AUTO } });
  store.runs.unshift({ id: RUN_B, jobId: B, at: "2026-11-08T12:00:00.000Z", state: "success", attempt: 1, rolesFound: 1 });
  fs.writeFileSync(storePath, JSON.stringify(store));

  assert.equal((await drain()).status, "idle", "no auto job owns the row yet");
  await rankPass(root, storePath, { spawnFn: () => assert.fail("every candidate is ranked, so no ranker runs") });
  assert.deepEqual([state(url(1)).jobId, state(url(1)).runId, state(url(1)).state], [B, RUN_B, "queued"]);
  assert.equal(readScheduledStore(storePath).runs.find((r) => r.id === RUN_B).autoQueued, 1);
  await drain();
  assert.equal(state(url(1)).state, "evaluated");
  assert.equal(posts.length, 1);
  assert.equal(readScheduledStore(storePath).runs.find((r) => r.id === RUN_B).evaluated, 1);
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
  assert.deepEqual(urls.map((u) => state(u).state), ["evaluated", "queued", "queued"], "the limit is not the row's failure");
  assert.equal(state(url(2)).reason, "Claude AI usage limit reached|1762650000", "the row names the limit, not the generic terminal error");
  assert.equal(state(url(2)).failures, 0, "the row keeps its retries");
  assert.equal(posts.length, 2);
  const run = readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  assert.equal(run.evalErrors, 0);
  assert.ok(run.drainMessage.includes(`stopped at ${url(2)} `), "the row evaluated before the stop does not clear it");
});

test("an ordinary error is failed and the batch goes on, and a rate limit stops it too", async (t) => {
  const answer = (body) => (body.input === url(1) ? [{ type: "error", msg: "reports/429-acme-2026-11-10.md was saved but merge-tracker.mjs failed (HTTP 429 from the board)." }] : done(2));
  const run1 = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
  await run1.drain();
  assert.deepEqual([run1.state(url(1)).state, run1.state(url(2)).state], ["failed", "evaluated"]);
  const run2 = await withDrainRoot(t, { urls: [url(1), url(2)], answer: () => [{ type: "error", msg: "429 rate limit exceeded" }] });
  assert.equal((await run2.drain()).status, "stopped");
  assert.equal(run2.state(url(2)).state, "queued");
});

// Claude Code 2.1.321's result text for CLIProxyAPI v8.0.62's 429 when every seat is cooling down.
test("a gateway whose seats are all cooling down stops the batch", async (t) => {
  const cooldown = "API Error: Request rejected (429) · All credentials for model claude-opus-5-5 are cooling down";
  const answer = () => [{ type: "error", msg: cooldown }, { type: "error", msg: "This run hit an error before finishing." }];
  const { drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
  assert.equal((await drain()).status, "stopped");
  assert.deepEqual([state(url(1)).state, state(url(2)).state], ["queued", "queued"]);
  assert.equal(state(url(1)).reason, cooldown);
  assert.equal(posts.length, 1);
  // Each wording stops it alone: the CLI's for another gateway, the proxy's if the CLI rewords its own.
  for (const msg of ["API Error: Request rejected (429) · upstream busy", "All credentials for model claude-opus-5-5 are cooling down"]) {
    const run = await withDrainRoot(t, { urls: [url(1), url(2)], answer: () => [{ type: "error", msg }] });
    assert.equal((await run.drain()).status, "stopped", msg);
  }
});

// A CLI that retries a 429 in silence is killed at the time limit with no limit event before it.
test("a run cut off at the route's time limit fails its row and stops the batch", async (t) => {
  const answer = () => [{ type: "error", msg: timeoutMessage(740_000, "evaluate-text") }];
  const { drain, state, posts } = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
  assert.equal((await drain()).status, "stopped");
  assert.deepEqual([state(url(1)).state, state(url(1)).failures, state(url(2)).state], ["failed", 1, "queued"], "the slow row spends a retry, the rest are not started");
  assert.equal(posts.length, 1);
});

test("a stopped batch is named on its scheduled run until a later drain gets through", async (t) => {
  const limit = "Claude AI usage limit reached|1762650000";
  let reply = [{ type: "error", msg: limit }];
  const answer = () => reply;
  const { drain, storePath } = await withDrainRoot(t, { urls: [url(1)], answer });
  const run = () => readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  await drain();
  assert.equal(run().drainMessage, `Evaluation stopped at ${url(1)} and the rest stay queued: ${limit}`);
  await drain({ fetchJd: async () => null });
  assert.match(run().drainMessage, /^Evaluation stopped/, "a tick that only re-queues the row keeps the reason");
  reply = 409;
  await drain();
  assert.match(run().drainMessage, /^Evaluation stopped/, "a 409 evaluated nothing, so the reason stays");
  reply = done(1);
  await drain();
  assert.deepEqual([run().evaluated, run().drainMessage], [1, undefined]);
});

test("a drain that throws still records what it finished and names the failure on the run", async (t) => {
  const { drain, storePath, posts } = await withDrainRoot(t, { urls: [url(1), url(2)] });
  let broken = false;
  const now = () => {
    if (!broken) return T0;
    broken = false;
    throw new Error("disk went away");
  };
  const fetchJd = async (u) => {
    broken = u === url(2);
    return { text: "Posting text." };
  };
  await assert.rejects(drain({ now, fetchJd }), /disk went away/);
  const run = () => readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  assert.equal(posts.length, 1);
  assert.deepEqual([run().evaluated, run().drainMessage], [1, `The drain failed at ${url(2)} and the rest stay queued: disk went away`]);
  await drain();
  assert.deepEqual([run().evaluated, run().drainMessage], [2, undefined], "a later drain that gets through clears the failure");
});

test("a throw between rows is not blamed on the row that just finished", async (t) => {
  const { root, drain, storePath, state } = await withDrainRoot(t, { urls: [url(1), url(2)] });
  let thrown = false;
  const now = () => {
    if (thrown || readLedger(root, { now: T0 }).find((entry) => entry.url === url(1))?.state !== "evaluated") return T0;
    thrown = true;
    throw new Error("plan broke");
  };
  await assert.rejects(drain({ now }), /plan broke/);
  const run = readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  assert.deepEqual([state(url(1)).state, state(url(2)).state], ["evaluated", "queued"]);
  assert.deepEqual([run.evaluated, run.drainMessage], [1, "The drain failed and the rest stay queued: plan broke"]);
});

test("a failed drain whose record fails too still rejects with the first error", async (t) => {
  const { drain, storePath, stderr } = await withDrainRoot(t, { urls: [url(1)] });
  let broken = false;
  const now = () => {
    if (!broken) return T0;
    broken = false;
    throw new Error("disk went away");
  };
  const fetchJd = async () => {
    broken = true;
    fs.rmSync(storePath);
    fs.mkdirSync(storePath);
    return { text: "Posting text." };
  };
  await assert.rejects(drain({ now, fetchJd }), /disk went away/);
  assert.match(stderr.join(""), /the failed drain was not recorded on its run: /);
});

test("an evaluation that fails without stopping the batch clears the stop reason", async (t) => {
  let reply = [{ type: "error", msg: "429 rate limit exceeded" }];
  const { drain, storePath } = await withDrainRoot(t, { urls: [url(1)], answer: () => reply });
  const run = () => readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  await drain();
  assert.match(run().drainMessage, /^Evaluation stopped/);
  reply = [{ type: "error", msg: "merge-tracker.mjs failed." }];
  await drain();
  assert.deepEqual([run().evalErrors, run().drainMessage], [1, undefined]);
});

test("a stop reason goes when its run has no row left to try", async (t) => {
  const { root, drain, state, storePath } = await withDrainRoot(t, { urls: [url(1)], answer: () => [{ type: "error", msg: "429 rate limit exceeded" }] });
  const run = () => readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  await drain();
  assert.match(run().drainMessage, /^Evaluation stopped/);
  fs.writeFileSync(path.join(root, "data", "pipeline.md"), "## Pending\n");
  await drain();
  assert.deepEqual([state(url(1)).state, run().drainMessage], ["skipped", undefined]);
});

test("a row that times out on its last try leaves no stop reason behind", async (t) => {
  const answer = () => [{ type: "error", msg: timeoutMessage(740_000, "evaluate-text") }];
  const { drain, state, storePath } = await withDrainRoot(t, { urls: [url(1)], answer });
  await drain();
  await drain();
  assert.match(readScheduledStore(storePath).runs.find((r) => r.id === RUN).drainMessage, /^Evaluation stopped/);
  assert.equal((await drain()).status, "stopped");
  const run = readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  assert.deepEqual([state(url(1)).failures, run.evalErrors, run.drainMessage], [3, 1, undefined], "no later tick touches the run, so nothing could clear it");
});

test("the stop reason goes on the run whose row stopped the batch, not on the others", async (t) => {
  const RUN2 = "33333333-3333-4333-8333-333333333333";
  const answer = (body) => (body.input === url(1) ? done(1) : [{ type: "error", msg: "429 rate limit exceeded" }]);
  const { root, drain, storePath } = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
  const store = readScheduledStore(storePath);
  store.runs.push({ ...store.runs[0], id: RUN2 });
  fs.writeFileSync(storePath, JSON.stringify(store));
  await appendRow(root, { url: url(2), at: new Date(T0 - 30_000).toISOString(), jobId: JOB, runId: RUN2, rank: 4, state: "queued", source: "rank-pass" });
  await drain();
  const runs = readScheduledStore(storePath).runs;
  assert.equal(runs.find((r) => r.id === RUN).drainMessage, undefined);
  assert.ok(runs.find((r) => r.id === RUN2).drainMessage.includes(`stopped at ${url(2)} `));
});

test("a dashboard that is offline is named on the scheduled run", async (t) => {
  const { drain, storePath } = await withDrainRoot(t, { urls: [url(1)], healthy: false });
  await drain();
  assert.match(readScheduledStore(storePath).runs.find((r) => r.id === RUN).drainMessage, /^The dashboard did not answer/);
});

test("an offline tick names itself on the run again after an evaluation cleared the reason", async (t) => {
  const { drain, state, storePath } = await withDrainRoot(t, { urls: [url(1), url(2)], evaluate: { ...AUTO, maxPerRun: 1 } });
  const run = () => readScheduledStore(storePath).runs.find((r) => r.id === RUN);
  const offline = { baseUrl: "http://127.0.0.1:1" };
  await drain(offline);
  await drain();
  assert.deepEqual([state(url(1)).state, state(url(2)).reason, run().drainMessage], ["evaluated", "dashboard-offline", "This pass evaluated the job's limit of 1; 1 queued row waits for the next pass."]);
  await drain(offline);
  assert.match(run().drainMessage, /^The dashboard did not answer/);
  assert.equal(state(url(2)).rows.length, 2, "the ledger still gets the offline row once");
});

test("a limit named before the time-limit kill is still a limit, and the row keeps its retries", async (t) => {
  const limit = "Claude AI usage limit reached|1762650000";
  const answer = () => [{ type: "error", msg: limit }, { type: "error", msg: timeoutMessage(740_000, "evaluate-text") }];
  const { drain, state } = await withDrainRoot(t, { urls: [url(1)], answer });
  assert.equal((await drain()).status, "stopped");
  assert.deepEqual([state(url(1)).state, state(url(1)).reason, state(url(1)).failures], ["queued", limit, 0]);
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
    const { drain, state, posts, storePath } = await withDrainRoot(t, { urls: [url(1), url(2)], answer });
    const result = await drain();
    assert.equal(result.status, "offline");
    assert.equal(posts.length, 1, "the drain stops at the first offline answer");
    const entry = state(url(1));
    assert.deepEqual([entry.state, entry.reason, entry.failures], ["queued", "dashboard-offline", 0]);
    assert.equal(state(url(2)).rows.length, 1);
    const { drainMessage } = readScheduledStore(storePath).runs.find((r) => r.id === RUN);
    assert.match(drainMessage, /^Evaluation stopped/);
    assert.doesNotMatch(drainMessage, /dashboard-offline$/, "the run names the cause, not the ledger's word for it");
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

function dailyCap(t, root, cap) {
  fs.mkdirSync(path.join(root, "config"));
  fs.writeFileSync(path.join(root, "config", "profile.yml"), `pipeline:\n  auto_evaluate_daily_cap: ${cap}\n`);
  const saved = process.env.CAREER_OPS_PROFILE;
  delete process.env.CAREER_OPS_PROFILE;
  t.after(() => { if (saved !== undefined) process.env.CAREER_OPS_PROFILE = saved; });
}
const runOf = (storePath) => readScheduledStore(storePath).runs.find((r) => r.id === RUN);

test("rows the daily cap leaves queued say so on their run, from the drain that hit it until one is evaluated", async (t) => {
  const { root, storePath, drain } = await withDrainRoot(t, { urls: [url(1), url(2)] });
  dailyCap(t, root, 1);
  const message = "Daily cap 1 reached on 2026-11-08 (UTC); 1 queued row waits for the next UTC day.";
  assert.equal((await drain()).status, "drained");
  assert.equal(runOf(storePath).drainMessage, message, "the drain that hit the cap");
  const written = fs.readFileSync(storePath, "utf8");
  const { ino, mtimeMs } = fs.statSync(storePath);
  assert.equal((await drain()).status, "capped");
  assert.equal(fs.readFileSync(storePath, "utf8"), written, "a capped tick");
  assert.deepEqual([fs.statSync(storePath).ino, fs.statSync(storePath).mtimeMs], [ino, mtimeMs], "an unchanged message is not written again");
  assert.equal((await drain({ now: () => T0 + 86_400_000 })).status, "drained");
  assert.equal(runOf(storePath).drainMessage, undefined, "the next UTC day evaluated the row");
});

test("a run first seen at a full cap gets the message on the capped tick", async (t) => {
  const { root, storePath, drain, posts } = await withDrainRoot(t, { urls: [url(1), url(2)] });
  dailyCap(t, root, 0);
  assert.equal((await drain()).status, "capped");
  assert.equal(posts.length, 0);
  assert.equal(runOf(storePath).drainMessage, "Daily cap 0 reached on 2026-11-08 (UTC); 2 queued rows wait for the next UTC day.");
});

test("rows the job's per-pass limit leaves queued say so until a later pass evaluates them", async (t) => {
  const { storePath, drain } = await withDrainRoot(t, { urls: [url(1), url(2)], evaluate: { ...AUTO, maxPerRun: 1 } });
  assert.equal((await drain()).status, "drained");
  assert.equal(runOf(storePath).drainMessage, "This pass evaluated the job's limit of 1; 1 queued row waits for the next pass.");
  assert.equal((await drain()).status, "drained");
  assert.equal(runOf(storePath).drainMessage, undefined);
});

test("a row that waits for posting text is not blamed on a limit", async (t) => {
  const { storePath, drain, state } = await withDrainRoot(t, { urls: [url(1)] });
  assert.equal((await drain({ fetchJd: async () => null })).status, "drained");
  assert.equal(state(url(1)).state, "queued");
  assert.equal(runOf(storePath).drainMessage, undefined);
});
