/**
 * The drain: evaluates the rows auto-mode jobs queued in data/evaluate-queue.tsv
 * by POSTing evaluate-text runs to the dashboard over loopback, and a pdf run for
 * a report that scores at or above auto_pdf_score_threshold. It never spawns
 * a CLI itself: every writer stays in the dashboard's process tree, where the
 * tracker write token and the report-number locks live.
 *
 * Runner-only. web/src never imports it.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { readScheduledStore } from "../src/lib/scheduled-jobs-store.mjs";
import { getProfilePath } from "../src/lib/core/profile-path.mjs";
import { pendingRows } from "../src/lib/core/evaluate-candidates.mjs";
import { CLAUDE_FATAL_STDERR_RE, FATAL_QUOTA_STDERR_RE, isTimeoutMessage } from "../src/lib/run-cli-support.mjs";
import { readText, recordStepCounts } from "./scheduled-jobs-runner.mjs";
import { normalizeUrl } from "../../url-key.mjs";
import { appendRow, drainPlan, readAutoPdfThreshold, readDailyCap, readLedger, startedToday } from "../../lib/evaluate-queue.mjs";
import { JD_TEXT_API_ATS, resolveAtsApi } from "../../liveness-api.mjs";
import { fetchJdViaKnownApi } from "../../browser-extract.mjs";
import { resolveTrackerPath } from "../../path-resolver.mjs";
import { parseTrackerRow, resolveColumns } from "../../tracker-parse.mjs";
import { reportUrlToken } from "../../tracker-utils.mjs";
import { tsvCell } from "../../lib/application-meta.mjs";

const LOCAL_OPT_IN = "CAREER_OPS_AUTO_EVALUATE_LOCAL";
// A wall-clock deadline on one run. For an evaluation: the route's 740 s kill,
// 60 s of persist and 100 s of slack; a CV run ends inside the route's 800 s. It outlasts RUNNING_STALE_MS (860 s), so in the
// last 40 s a concurrent `evaluate-queue.mjs dump` reads the live row as stale; the
// drain lock keeps a second drain from acting on that.
const RUN_TIMEOUT_MS = 900_000;
const HEALTH_TIMEOUT_MS = 5_000;
const TERMINAL = new Set(["done", "gated", "error"]);

const autoJobs = (store) => store.jobs.filter((job) => job.status === "active" && job.evaluate?.mode === "auto");
// A gateway's 429 names neither a quota nor a rate limit: Claude Code reports
// "Request rejected (429)", and CLIProxyAPI says its seats are "cooling down".
const GATEWAY_LIMIT_RE = /request rejected \(429\)|cooling down/i;
const isLimitError = (msg) => FATAL_QUOTA_STDERR_RE.test(msg) || CLAUDE_FATAL_STDERR_RE.test(msg) || GATEWAY_LIMIT_RE.test(msg);
const log = (line) => process.stderr.write(`drain: ${line}\n`);
// The limit messages noteWaiting writes. A pass that gets as far as planning works them out again and clears one it does not renew.
const LIMIT_MESSAGE_RE = /^(Daily cap \d+ |This pass started the job's limit )/;
const messageOf = (error) => (error instanceof Error ? error.message : String(error));

const keySet = (urls) => new Set(urls.map(normalizeUrl).filter(Boolean));

function trackerKeys(root) {
  const lines = readText(resolveTrackerPath(root)).split("\n");
  const colmap = resolveColumns(lines);
  return keySet(lines.map((line) => parseTrackerRow(line, colmap)?.url).filter(Boolean));
}

function filesIn(dir, ext) {
  try {
    return fs.readdirSync(dir).filter((name) => name.endsWith(ext)).map((name) => path.join(dir, name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

// What a crash between the report write and the tracker merge leaves behind.
function persistedKeys(root) {
  const reportUrls = filesIn(path.join(root, "reports"), ".md").map(reportUrlToken);
  const additionUrls = filesIn(path.join(root, "batch", "tracker-additions"), ".tsv")
    .flatMap((file) => readText(file).split(/[\t\r\n]/).filter((cell) => /^https?:\/\//i.test(cell)));
  return keySet([...reportUrls, ...additionUrls].filter(Boolean));
}

function skipReason(root, key, persisted) {
  if (!keySet(pendingRows(readText(path.join(root, "data", "pipeline.md"))).map((row) => row.url)).has(key)) return "not-pending";
  if (trackerKeys(root).has(key)) return "already-evaluated";
  if (persisted.has(key)) return "report-exists";
  return null;
}

/** One request to the dashboard. Resolves {status, text} or {transport: error}; never rejects. */
function request(baseUrl, pathname, { body, timeoutMs }) {
  return new Promise((resolve) => {
    let settled = false;
    let deadline;
    const settle = (value) => {
      if (!settled) {
        settled = true;
        clearTimeout(deadline);
        resolve(value);
      }
    };
    const payload = body === undefined ? undefined : JSON.stringify(body);
    // CAREER_OPS_WEB_URL may name a non-loopback host, which the dashboard's
    // loopback-only Host guard would refuse; the URL is only where the socket goes.
    const headers = { Host: "localhost", ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) };
    const req = http.request(new URL(pathname, baseUrl), { method: payload ? "POST" : "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => settle({ status: res.statusCode, text }));
      res.on("error", (error) => settle({ transport: error }));
      res.on("close", () => settle({ transport: new Error("the response closed before it ended") }));
    });
    // Wall clock, not socket idle: the route's 10 s keepalive would reset an idle timer forever.
    deadline = setTimeout(() => {
      const error = new Error(`no answer within ${timeoutMs / 1000} s`);
      settle({ transport: error });
      req.destroy(error);
    }, timeoutMs);
    req.on("error", (error) => settle({ transport: error }));
    req.end(payload);
  });
}

function streamEvents(text) {
  return text.split("\n").flatMap((line) => {
    try {
      return line.trim() ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
}

/** What one evaluation POST came to: the ledger row it leaves, and whether the batch stops. */
function outcomeOf(response) {
  if (response.transport) return { state: "queued", reason: "dashboard-offline", stop: "offline", detail: response.transport.message };
  if (response.status === 409) return { state: "queued", reason: "in-flight" };
  if (response.status !== 200) {
    let error = `HTTP ${response.status}`;
    try {
      error = JSON.parse(response.text).error || error;
    } catch { /* not JSON */ }
    // A refused request is the dashboard's setup, not this row: the rest would be
    // refused too, and the row keeps its retries for when the setup is fixed.
    return { state: "queued", reason: `refused: ${error}`, stop: "refused" };
  }
  const events = streamEvents(response.text);
  const terminal = events.findLast((event) => TERMINAL.has(event.type));
  if (!terminal) return { state: "queued", reason: "dashboard-offline", stop: "offline", detail: "the stream ended with no terminal event" };
  if (terminal.type === "done") {
    return {
      state: "evaluated",
      reason: terminal.reportN ? `report ${terminal.reportN}` : "",
      reportN: terminal.reportN ?? null,
      score: typeof terminal.score === "number" ? terminal.score : null,
    };
  }
  if (terminal.type === "gated") return { state: "gated", reason: terminal.reason || terminal.message || "" };
  // The limit event names why the batch stops; the terminal error after it is generic.
  // A limit is the account's or the gateway's, not this row's, so the row keeps its retries.
  const limit = events.find((event) => event.type === "error" && isLimitError(String(event.msg ?? "")));
  if (limit) return { state: "queued", reason: String(limit.msg), stop: "limit" };
  const reason = String(terminal.msg ?? "");
  // A time-limit kill is a slow posting or a gateway the CLI retried in silence. The row
  // spends a retry either way, and the batch stops because each next row could cost the same wait.
  return { state: "failed", reason, stop: isTimeoutMessage(reason) ? "timeout" : undefined };
}

/** Why one CV POST did not end in a rendered PDF, or null when it did. */
function cvFailure(response) {
  if (response.transport) return response.transport.message;
  if (response.status !== 200) {
    try {
      return JSON.parse(response.text).error || `HTTP ${response.status}`;
    } catch {
      return `HTTP ${response.status}`;
    }
  }
  const terminal = streamEvents(response.text).findLast((event) => TERMINAL.has(event.type));
  if (terminal?.type === "done") return null;
  return String(terminal?.msg ?? terminal?.message ?? "the stream ended with no terminal event");
}

/**
 * Drain every auto job's queued rows, one evaluation at a time. Only inside a
 * Kubernetes pod, or on a host that opts in with CAREER_OPS_AUTO_EVALUATE_LOCAL=1:
 * an unattended run reads the posting text with the host's own files in reach.
 *
 * @returns {Promise<{ status: "idle"|"refused"|"capped"|"offline"|"stopped"|"drained", reason?: string, evaluated: number, gated: number, failed: number, skipped: number, queued: number }>}
 */
export async function runDrain({
  root,
  storePath,
  baseUrl = process.env.CAREER_OPS_WEB_URL || "http://127.0.0.1:3000",
  fetchJd = fetchJdViaKnownApi,
  now = Date.now,
  env = process.env,
  runTimeoutMs = RUN_TIMEOUT_MS,
}) {
  const counts = { evaluated: 0, gated: 0, failed: 0, skipped: 0, queued: 0 };
  const jobs = autoJobs(readScheduledStore(storePath));
  // With no auto job left there is nothing to refuse: the pass only clears the reasons its runs carry.
  if (jobs.length && !env.KUBERNETES_SERVICE_HOST && env[LOCAL_OPT_IN] !== "1") {
    log(`auto mode evaluates only inside the web pod; set ${LOCAL_OPT_IN}=1 to drain on this host. Nothing was evaluated.`);
    return { status: "refused", reason: `not a pod and ${LOCAL_OPT_IN} is not 1`, ...counts };
  }

  const skippedRows = [];
  const ledger = readLedger(root, { now: now(), skipped: skippedRows });
  if (skippedRows.length) log(`${skippedRows.length} malformed row(s) in data/evaluate-queue.tsv skipped, first at line ${skippedRows[0].line}`);
  const dailyCap = readDailyCap(getProfilePath(root));
  const cvThreshold = readAutoPdfThreshold(getProfilePath(root));
  // Re-planned before each row, so the cap counts what this drain started and a
  // row tried this tick (a posting with no text yet, say) does not hold a slot.
  const planFor = (job, tried = new Set(), started = 0, cap = dailyCap) => drainPlan(root, {
    jobId: job.id, rankThreshold: job.evaluate.rankThreshold, maxPerRun: job.evaluate.maxPerRun - started, dailyCap: cap, now: now(), exclude: tried,
  });
  // Runs whose stored message this drain changes: set by a stop or a limit, cleared by an evaluation
  // that finished or a reason that no longer holds. {} leaves it alone (a row that only waited, a 409 too).
  const touchedRuns = new Map();
  /*
   * Every run with a waiting row this drain did not try says why: the stop that ended the pass,
   * else the limit that held the row back. A row a rank pass queued while the drain ran has neither,
   * and the next pass takes it. Returns the stored runs by id.
   */
  const noteWaiting = (tried, startedBy = new Map(), stop) => {
    const stored = new Map(readScheduledStore(storePath).runs.map((run) => [run.id, run]));
    const named = new Set();
    const entries = readLedger(root, { now: now() });
    const capped = startedToday(entries, now()) >= dailyCap;
    const today = new Date(now()).toISOString().slice(0, 10);
    for (const job of jobs) {
      const { maxPerRun } = job.evaluate;
      // A run the store has trimmed has nowhere to carry a message.
      const waiting = drainPlan(root, { jobId: job.id, rankThreshold: job.evaluate.rankThreshold, dailyCap: Infinity, now: now(), exclude: tried })
        .filter((entry) => stored.has(entry.runId));
      for (const [runId, rows] of Map.groupBy(waiting, (entry) => entry.runId)) {
        const left = `${rows.length} queued row${rows.length === 1 ? " waits" : "s wait"}`;
        const drainMessage = stop
          ?? (!capped
            ? (startedBy.get(job.id) ?? 0) >= maxPerRun ? `This pass started the job's limit of ${maxPerRun}; ${left} for the next pass.` : undefined
            : dailyCap === 0
              ? `Daily cap 0 evaluates nothing; ${left} until pipeline.auto_evaluate_daily_cap is raised.`
              : `Daily cap ${dailyCap} reached on ${today} (UTC); ${left} for the next UTC day.`);
        if (!drainMessage) continue;
        named.add(runId);
        touchedRuns.set(runId, { drainMessage });
      }
    }
    // A limit message this pass did not renew is no longer true, and neither is any reason on a run
    // whose job left auto mode or whose rows have all reached an end.
    const auto = new Set(jobs.map((job) => job.id));
    const live = new Set(entries.filter((entry) => !entry.final).map((entry) => entry.runId));
    for (const run of stored.values()) {
      if (!run.drainMessage || named.has(run.id) || touchedRuns.get(run.id)?.drainMessage) continue;
      if (LIMIT_MESSAGE_RE.test(run.drainMessage) || !auto.has(run.jobId) || !live.has(run.id)) touchedRuns.set(run.id, { drainMessage: undefined });
    }
    return stored;
  };
  if (!jobs.some((job) => planFor(job).length)) {
    const capped = jobs.some((job) => planFor(job, undefined, 0, Infinity).length);
    if (capped) log(`daily cap ${dailyCap} reached, ${startedToday(ledger, now())} started today; queued rows wait for the next UTC day`);
    const stored = noteWaiting(new Set());
    // The runner comes back to a capped or idle queue on every tick: write only a message its run does not already carry.
    for (const [runId, note] of touchedRuns) if (stored.get(runId).drainMessage === note.drainMessage) touchedRuns.delete(runId);
    if (touchedRuns.size) await recordDrainCounts(root, storePath, touchedRuns, now());
    return { status: capped ? "capped" : "idle", ...counts };
  }
  const health = await request(baseUrl, "/api/healthz", { timeoutMs: HEALTH_TIMEOUT_MS });
  const online = health.status === 200;
  if (!online) log(`the dashboard at ${baseUrl} did not answer /api/healthz (${health.transport?.message ?? `HTTP ${health.status}`}); queued rows wait`);
  let persisted = null;
  const tried = new Set();
  const startedBy = new Map();
  let stopMessage;
  let status = "drained";

  let current;
  let lastRunId;
  try {
    jobs: for (const job of jobs) {
      let started = 0;
      for (let entry; (entry = planFor(job, tried, started)[0]); current = undefined) {
        current = entry;
        tried.add(entry.key);
        const { url } = entry;
        const append = async (state, reason = "") => {
          await appendRow(root, { url, at: new Date(now()).toISOString(), jobId: entry.jobId, runId: entry.runId, reason, state, source: "drain" });
          if (!touchedRuns.has(entry.runId)) touchedRuns.set(entry.runId, {});
          lastRunId = entry.runId;
          if (state !== "running") counts[state] += 1;
        };
        if (!online) {
          if (entry.state !== "queued" || entry.reason !== "dashboard-offline") await append("queued", "dashboard-offline");
          // Set on every offline tick, not only with the row: an evaluation in between may have cleared it.
          touchedRuns.set(entry.runId, { drainMessage: "The dashboard did not answer, so nothing was evaluated. Queued rows wait." });
          status = "offline";
          continue;
        }
        persisted ??= persistedKeys(root);
        const skip = skipReason(root, entry.key, persisted);
        if (skip) {
          await append("skipped", skip);
          continue;
        }
        if (!JD_TEXT_API_ATS.has(resolveAtsApi(url)?.ats)) {
          await append("skipped", "no-api-text");
          continue;
        }
        let jd = null;
        let why = "the ATS API returned no text";
        try {
          jd = await fetchJd(url);
        } catch (error) {
          why = error instanceof Error ? error.message : String(error);
        }
        // The route refuses a NUL, which argv cannot carry; with it in, the same row would be refused every tick.
        const jdText = jd?.text?.replaceAll("\0", "");
        if (!jdText?.trim()) {
          log(`job ${job.id}: no posting text for ${url} this time (${why}); it stays queued`);
          // Written once per new reason, so a posting that stays empty does not grow the ledger every tick.
          // Compared in the form the ledger stores, or a message with a newline would never match.
          const reason = tsvCell(`no-text: ${why}`);
          if (entry.reason !== reason) await append("queued", reason);
          continue;
        }

        await append("running");
        started += 1;
        startedBy.set(job.id, started);
        const outcome = outcomeOf(await request(baseUrl, "/api/run", {
          body: { kind: "evaluate-text", input: url, cliId: "claude", jdText },
          timeoutMs: runTimeoutMs,
        }));
        await append(outcome.state, outcome.reason);
        const note = touchedRuns.get(entry.runId);
        if (outcome.stop) note.drainMessage = stopMessage = `Evaluation stopped at ${url} and the rest stay queued: ${outcome.detail ?? outcome.reason}`;
        else if (outcome.state !== "queued") note.drainMessage = undefined;
        // A CV is extra to the evaluation, so it changes no ledger row, counts toward no limit and stops nothing.
        if (outcome.state === "evaluated" && outcome.reportN && outcome.score !== null && outcome.score >= cvThreshold) {
          const failure = cvFailure(await request(baseUrl, "/api/run", {
            body: { kind: "pdf", input: String(outcome.reportN), cliId: "claude", unattended: true },
            timeoutMs: runTimeoutMs,
          }));
          log(`cv for report ${outcome.reportN}: ${failure === null ? "ready" : `failed (${failure})`}`);
        }
        if (outcome.stop) {
          status = outcome.stop === "offline" ? "offline" : "stopped";
          log(`job ${job.id}: stopped at ${url}: ${outcome.detail ?? outcome.reason}; the rest stay queued`);
          break jobs;
        }
      }
    }
    noteWaiting(tried, startedBy, stopMessage);
  } catch (error) {
    // What this drain finished still counts on its runs, and one run says why it stopped: the
    // failing row's, or between rows the last one this drain wrote to.
    const runId = current?.runId ?? lastRunId;
    if (runId) touchedRuns.set(runId, { drainMessage: `The drain failed${current ? ` at ${current.url}` : ""} and the rest stay queued: ${messageOf(error)}` });
    try {
      await recordDrainCounts(root, storePath, touchedRuns, now());
    } catch (recordError) {
      log(`the failed drain was not recorded on its run: ${messageOf(recordError)}`);
    }
    throw error;
  }

  await recordDrainCounts(root, storePath, touchedRuns, now());
  log(`${status}: ${Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(", ")}`);
  return { status, ...counts };
}

/**
 * Each originating run's totals, from the whole ledger, so a run drained over several ticks adds up,
 * and its drain message, which a finished evaluation clears. So does a run with no row left
 * to try, or the message would outlive the rows it is about.
 */
async function recordDrainCounts(root, storePath, runs, nowMs) {
  const entries = readLedger(root, { now: nowMs });
  for (const [runId, message] of runs) {
    const own = entries.filter((entry) => entry.runId === runId);
    const count = (state) => own.filter((entry) => entry.state === state).length;
    const waiting = own.some((entry) => !entry.final);
    await recordStepCounts(storePath, runId, {
      evaluated: count("evaluated"), gated: count("gated"), evalErrors: count("failed"),
      ...(waiting ? message : { drainMessage: undefined }),
    });
  }
}
