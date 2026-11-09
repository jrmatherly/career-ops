/**
 * The drain: evaluates the rows auto-mode jobs queued in data/evaluate-queue.tsv
 * by POSTing evaluate-text runs to the dashboard over loopback. It never spawns
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
import { CLAUDE_FATAL_STDERR_RE, FATAL_QUOTA_STDERR_RE } from "../src/lib/run-cli-support.mjs";
import { readText, recordStepCounts } from "./scheduled-jobs-runner.mjs";
import { normalizeUrl } from "../../url-key.mjs";
import { appendRow, drainPlan, readDailyCap, readLedger } from "../../lib/evaluate-queue.mjs";
import { JD_TEXT_API_ATS, resolveAtsApi } from "../../liveness-api.mjs";
import { fetchJdViaKnownApi } from "../../browser-extract.mjs";
import { resolveTrackerPath } from "../../path-resolver.mjs";
import { parseTrackerRow, resolveColumns } from "../../tracker-parse.mjs";
import { reportUrlToken } from "../../tracker-utils.mjs";

const LOCAL_OPT_IN = "CAREER_OPS_AUTO_EVALUATE_LOCAL";
// The route kills an evaluation at 740 s and persists within 60 s more.
const RUN_TIMEOUT_MS = 900_000;
const HEALTH_TIMEOUT_MS = 5_000;
const TERMINAL = new Set(["done", "gated", "error"]);

const autoJobs = (store) => store.jobs.filter((job) => job.status === "active" && job.evaluate?.mode === "auto");
const isLimitError = (msg) => FATAL_QUOTA_STDERR_RE.test(msg) || CLAUDE_FATAL_STDERR_RE.test(msg);
const log = (line) => process.stderr.write(`drain: ${line}\n`);

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
    const settle = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    const payload = body === undefined ? undefined : JSON.stringify(body);
    // The dashboard's guard serves loopback hosts only; 127.0.0.1 in the URL is for the socket.
    const headers = { Host: "localhost", ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) };
    const req = http.request(new URL(pathname, baseUrl), { method: payload ? "POST" : "GET", headers }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { text += chunk; });
      res.on("end", () => settle({ status: res.statusCode, text }));
      res.on("error", (error) => settle({ transport: error }));
      res.on("close", () => settle({ transport: new Error("the response closed before it ended") }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`no answer in ${timeoutMs / 1000} s`)));
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
  if (terminal.type === "done") return { state: "evaluated", reason: terminal.reportN ? `report ${terminal.reportN}` : "" };
  if (terminal.type === "gated") return { state: "gated", reason: terminal.reason || terminal.message || "" };
  const limited = events.some((event) => event.type === "error" && isLimitError(String(event.msg ?? "")));
  return { state: "failed", reason: String(terminal.msg ?? ""), ...(limited ? { stop: "limit" } : {}) };
}

/**
 * Drain every auto job's queued rows, one evaluation at a time. Only inside a
 * Kubernetes pod, or on a host that opts in with CAREER_OPS_AUTO_EVALUATE_LOCAL=1:
 * an unattended run reads the posting text with the host's own files in reach.
 *
 * @returns {Promise<{ status: "idle"|"refused"|"offline"|"stopped"|"drained", reason?: string, evaluated: number, gated: number, failed: number, skipped: number, queued: number }>}
 */
export async function runDrain({
  root,
  storePath,
  baseUrl = process.env.CAREER_OPS_WEB_URL || "http://127.0.0.1:3000",
  fetchJd = fetchJdViaKnownApi,
  now = Date.now,
  env = process.env,
}) {
  const counts = { evaluated: 0, gated: 0, failed: 0, skipped: 0, queued: 0 };
  const jobs = autoJobs(readScheduledStore(storePath));
  if (!jobs.length) return { status: "idle", ...counts };
  if (!env.KUBERNETES_SERVICE_HOST && env[LOCAL_OPT_IN] !== "1") {
    log(`auto mode evaluates only inside the web pod; set ${LOCAL_OPT_IN}=1 to drain on this host. Nothing was evaluated.`);
    return { status: "refused", reason: `not a pod and ${LOCAL_OPT_IN} is not 1`, ...counts };
  }

  const dailyCap = readDailyCap(getProfilePath(root));
  // Re-planned before each row, so the cap counts what this drain started and a
  // row tried this tick (a posting with no text yet, say) does not hold a slot.
  const planFor = (job, tried = new Set(), started = 0) => drainPlan(root, {
    jobId: job.id, rankThreshold: job.evaluate.rankThreshold, maxPerRun: job.evaluate.maxPerRun - started, dailyCap, now: now(), exclude: tried,
  });
  if (!jobs.some((job) => planFor(job).length)) return { status: "idle", ...counts };
  const health = await request(baseUrl, "/api/healthz", { timeoutMs: HEALTH_TIMEOUT_MS });
  const online = health.status === 200;
  if (!online) log(`the dashboard at ${baseUrl} did not answer /api/healthz (${health.transport?.message ?? `HTTP ${health.status}`}); queued rows wait`);
  let persisted = null;
  const touchedRuns = new Set();
  let status = "drained";

  jobs: for (const job of jobs) {
    const tried = new Set();
    let started = 0;
    for (let entry; (entry = planFor(job, tried, started)[0]);) {
      tried.add(entry.key);
      const { url } = entry;
      const append = async (state, reason = "") => {
        await appendRow(root, { url, at: new Date(now()).toISOString(), jobId: entry.jobId, runId: entry.runId, reason, state, source: "drain" });
        touchedRuns.add(entry.runId);
        if (state !== "running") counts[state] += 1;
      };
      if (!online) {
        if (entry.state !== "queued" || entry.reason !== "dashboard-offline") await append("queued", "dashboard-offline");
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
      if (!jd?.text?.trim()) {
        log(`job ${job.id}: no posting text for ${url} this time (${why}); it stays queued`);
        continue;
      }

      await append("running");
      started += 1;
      const outcome = outcomeOf(await request(baseUrl, "/api/run", {
        body: { kind: "evaluate-text", input: url, cliId: "claude", jdText: jd.text },
        timeoutMs: RUN_TIMEOUT_MS,
      }));
      await append(outcome.state, outcome.reason);
      if (outcome.stop) {
        status = outcome.stop === "offline" ? "offline" : "stopped";
        log(`job ${job.id}: stopped at ${url}: ${outcome.detail ?? outcome.reason}; the rest stay queued`);
        break jobs;
      }
    }
  }

  await recordDrainCounts(root, storePath, touchedRuns, now());
  log(`${status}: ${Object.entries(counts).map(([key, value]) => `${value} ${key}`).join(", ")}`);
  return { status, ...counts };
}

/** Each originating run's totals, from the whole ledger, so a run drained over several ticks adds up. */
async function recordDrainCounts(root, storePath, runIds, nowMs) {
  const entries = readLedger(root, { now: nowMs });
  for (const runId of runIds) {
    const own = entries.filter((entry) => entry.runId === runId);
    const count = (state) => own.filter((entry) => entry.state === state).length;
    await recordStepCounts(storePath, runId, { evaluated: count("evaluated"), gated: count("gated"), evalErrors: count("failed") });
  }
}
