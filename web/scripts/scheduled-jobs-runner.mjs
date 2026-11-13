#!/usr/bin/env node

import "../../lib/settings-env.mjs"; // saved settings; must stay the first import
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import {
  isSafeScheduledId,
  readScheduledStore,
  withResourceLock,
  withScheduledStore,
} from "../src/lib/scheduled-jobs-store.mjs";
import { nextScheduledRun } from "../src/lib/scheduled-cadence.mjs";
import { isMainModule } from "../../lib/is-main-module.mjs";
import { scheduledRunnerResourcePath, scheduledStorePath } from "../src/lib/scheduled-runner-path.mjs";
import { getCareerOpsRoot } from "../../path-resolver.mjs";
import { getProfilePath } from "../src/lib/core/profile-path.mjs";
import { scanFailureMessage, stderrCause } from "../src/lib/scheduled-scan-error.mjs";
import { cleanChips } from "../src/lib/clean-chips.mjs";
import { isMapping } from "../src/lib/portals-config.mjs";
import { foldTitle } from "../../title-keywords.mjs";
import { parseScanHistoryLine, scanHistoryDataLines } from "../../lib/scan-history-columns.mjs";
import { candidateSince, candidatesFor, pendingRows } from "../src/lib/core/evaluate-candidates.mjs";

const CODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MAX_RUNS = 100;
export const MAX_ATTEMPTS = 3;
export const SCAN_TIMEOUT_MS = 25 * 60 * 1_000;
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
export const QUEUE_CLAIM_STALE_MS = 30 * 1_000;

const nowIso = () => new Date().toISOString();

export const nextFutureRun = nextScheduledRun;

export function enqueueDueJobs(store, nowMs = Date.now()) {
  let queued = 0;
  for (const job of store.jobs) {
    if (job.status !== "active") continue;
    const dueAt = job.nextRunAt || job.startAt;
    const dueMs = Date.parse(dueAt);
    if (!Number.isFinite(dueMs) || dueMs > nowMs) continue;

    if (!store.queue.some((item) => item.jobId === job.id)) {
      store.queue.push({ id: randomUUID(), jobId: job.id, queuedAt: new Date(nowMs).toISOString() });
      queued += 1;
    }

    const nextRunAt = nextScheduledRun(job.startAt, job.every, job.unit, nowMs, job.timezone || "UTC");
    if (nextRunAt) job.nextRunAt = nextRunAt;
    job.updatedAt = new Date(nowMs).toISOString();
  }
  return queued;
}

function claimIsStale(item, nowMs) {
  if (!item.claimToken || !item.claimedAt) return false;
  const claimedMs = Date.parse(item.claimedAt);
  return !Number.isFinite(claimedMs) || nowMs - claimedMs >= QUEUE_CLAIM_STALE_MS;
}

function claimQueueItem(store, item, job, nowMs) {
  if (item.claimToken && !claimIsStale(item, nowMs)) return null;
  if (item.claimToken) {
    const staleRun = item.runId && store.runs.find((run) => run.id === item.runId);
    if (staleRun) {
      staleRun.state = "queued";
      staleRun.message = "Requeued after an interrupted worker.";
    }
  }
  const claimToken = randomUUID();
  item.claimToken = claimToken;
  item.claimedAt = new Date(nowMs).toISOString();
  if (!item.runId || !isSafeScheduledId(item.runId)) item.runId = randomUUID();
  const run = store.runs.find((candidate) => candidate.id === item.runId);
  if (run) {
    run.state = "running";
    run.at = new Date(nowMs).toISOString();
    run.attempt = (run.attempt || 0) + 1;
  } else {
    store.runs.unshift({ id: item.runId, jobId: job.id, at: new Date(nowMs).toISOString(), state: "running", attempt: 1, engine: job.engine || "full" });
  }
  return { job: structuredClone(job), queueId: item.id, runId: item.runId, claimToken };
}

export function claimDueJob(store, nowMs = Date.now()) {
  for (const item of store.queue) {
    const job = store.jobs.find((candidate) => candidate.id === item.jobId && candidate.status === "active");
    if (!job) continue;
    const claim = claimQueueItem(store, item, job, nowMs);
    if (claim) return claim;
  }
  return null;
}

export function claimManualJob(store, jobId, nowMs = Date.now()) {
  const job = store.jobs.find((candidate) => candidate.id === jobId && candidate.status !== "deleted");
  if (!job) return null;
  let item = store.queue.find((candidate) => candidate.jobId === jobId);
  if (!item) {
    item = { id: randomUUID(), jobId, queuedAt: new Date(nowMs).toISOString() };
    store.queue.push(item);
  }
  return claimQueueItem(store, item, job, nowMs);
}

export const runnerResourcePath = scheduledRunnerResourcePath;

function numericFilter(value, fallback, minimum, maximum = Number.POSITIVE_INFINITY) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function buildScanCommand(job) {
  const filters = job.filters || {};
  const sinceDays = numericFilter(filters.sinceDays, 7, 1);
  if (job.engine === "portals") {
    return {
      script: "scan.mjs",
      args: ["--since", String(sinceDays), "--quiet"],
    };
  }

  const ats = Array.isArray(filters.ats) && filters.ats.length
    ? filters.ats.join(",")
    : "greenhouse,lever,ashby,workday";
  const limit = numericFilter(filters.limitPerAts, 150, 50, 500);
  return {
    script: "scan-ats-full.mjs",
    args: ["--since", String(sinceDays), "--ats", ats, "--limit", String(limit), "--json"],
  };
}

// [key on the run, key in the scan-ats-full.mjs --json output]
const SCAN_COUNTS = [
  ["droppedTier", "postingsDroppedTier"],
  ["droppedSalary", "postingsDroppedSalary"],
  ["droppedContent", "postingsDroppedContent"],
];

/** What a finished scan printed: the roles it kept, and for a full sweep each drop count it stated. */
function readScanResult(engine, stdout) {
  if (engine !== "full") {
    const match = stdout.match(/New offers added:\s*(\d+)/i);
    return { rolesFound: match ? Number(match[1]) : 0, counts: {} };
  }
  let result;
  try {
    result = JSON.parse(stdout);
  } catch {
    result = null;
  }
  if (!result || typeof result !== "object") return { rolesFound: 0, counts: {} };
  // A zero is kept, since the scan stated it. Only a missing or non-numeric count is left out.
  const counts = Object.fromEntries(SCAN_COUNTS.filter(([, printed]) => Number.isFinite(result[printed])).map(([key, printed]) => [key, result[printed]]));
  // A sweep the timeout stops still exits 0, with counts for the boards it reached.
  if (result.stoppedEarly === true) counts.stoppedEarly = true;
  return { rolesFound: Number.isFinite(Number(result.postingsKept)) ? Number(result.postingsKept) : 0, counts };
}

export const extractRolesFound = (engine, stdout) => readScanResult(engine, stdout).rolesFound;

/** @returns {{ droppedTier?: number, droppedSalary?: number, droppedContent?: number, stoppedEarly?: true }} */
export const extractScanCounts = (engine, stdout) => readScanResult(engine, stdout).counts;

function portalsPath(root, env = process.env) {
  const override = env.CAREER_OPS_PORTALS?.trim();
  return override ? path.resolve(root, override) : path.join(root, "portals.yml");
}

// Job filter key, portals.yml section, key inside that section.
const FILTER_LISTS = [
  ["positive", "title_filter", "positive"],
  ["negative", "title_filter", "negative"],
  ["allow", "location_filter", "allow"],
  ["block", "location_filter", "block"],
  ["blockHard", "location_filter", "block_hard"],
  ["alwaysAllow", "location_filter", "always_allow"],
];

// The scanner's rule (normalizeKeywords in title-keywords.mjs): a non-array or all-blank list is no title limit.
const hasTitleKeywords = (list) => Array.isArray(list) && list.some((k) => typeof k === "string" && foldTitle(k).trim());

// Names the title list the scanner reads when it is empty, else null.
// scan-ats-full.mjs reads title_filter_full in place of title_filter whenever it is set.
function emptyTitleKey(config, engine) {
  const section = engine !== "portals" && config.title_filter_full != null ? "title_filter_full" : "title_filter";
  return hasTitleKeywords(config[section]?.positive) ? null : `${section}.positive`;
}

// Spreading a string yields index keys and yaml.dump drops properties set on an array, so such a section restarts from {}.
const mappingOrEmpty = (value) => (isMapping(value) ? value : {});

function readPortals(file) {
  const text = fs.readFileSync(file, "utf8");
  let base;
  try {
    base = yaml.load(text);
  } catch (error) {
    throw new Error(`${file}: ${error.message}`);
  }
  if (!isMapping(base)) throw new Error(`${file}: must contain a mapping`);
  return base;
}

// A job list that is empty inherits the file's list unchanged; a non-empty one replaces it.
function jobPortals(job, base) {
  const filters = job.filters || {};
  for (const [jobKey, section, fileKey] of FILTER_LISTS) {
    const own = cleanChips(filters[jobKey]);
    const current = mappingOrEmpty(base[section]);
    base[section] = { ...current, [fileKey]: own.length ? own : current[fileKey] ?? [] };
    if (section === "title_filter" && own.length && base.title_filter_full != null) {
      base.title_filter_full = { ...mappingOrEmpty(base.title_filter_full), [fileKey]: own };
    }
  }
  return base;
}

function writeJobTemp(root, jobId, prefix, ext, text) {
  if (!isSafeScheduledId(jobId)) throw new Error("Invalid scheduled job identifier.");
  const tempDir = path.join(root, "data", "tmp");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempPath = path.join(tempDir, `${prefix}-${jobId}-${randomUUID()}.${ext}`);
  fs.writeFileSync(tempPath, text, "utf8");
  return tempPath;
}

function writeJobPortals(root, jobId, config) {
  return writeJobTemp(root, jobId, "scheduled", "yml", yaml.dump(config, { lineWidth: 120, noRefs: true }));
}

// The env every core script the runner starts gets; the scanner adds CAREER_OPS_PORTALS.
function coreEnv(root) {
  return {
    ...process.env,
    CAREER_OPS_ROOT: root,
    // The scripts run with cwd = the checkout; a relative CAREER_OPS_PROFILE
    // is resolved here, the way the web resolves it, so both read one file.
    ...(process.env.CAREER_OPS_PROFILE?.trim() ? { CAREER_OPS_PROFILE: getProfilePath(root) } : {}),
  };
}

/*
 * Keep the temporary portal overlay scoped to each retry. A thrown overlay or
 * spawn error is retryable just like a non-zero scanner exit, while cleanup
 * still runs before the next attempt. A scanner that ran into the timeout is
 * not retried: the same sweep would hit the same limit, three times over. An
 * unreadable portals.yml or an empty title list is not retried either; both are
 * checked once before the loop.
 */

export function executeJob(root, job, options = {}) {
  const spawnFn = options.spawnFn || spawnSync;
  const startedAt = Date.now();
  let lastError = "Scan failed";
  let finalAttempt = MAX_ATTEMPTS;
  const fromFile = job.filtersFrom === "file";
  const basePortals = portalsPath(root);
  process.stderr.write(`portals: ${basePortals} (${fromFile ? "file" : "overlay"})\n`);
  let config;
  try {
    const base = readPortals(basePortals);
    config = fromFile ? base : jobPortals(job, base);
    const emptyKey = emptyTitleKey(config, job.engine);
    if (emptyKey) {
      throw new Error(fromFile
        ? `Scheduled scans require title keywords in portals.yml ${emptyKey} when a job uses the file's filters`
        : `Scheduled scans require title keywords in the job or portals.yml ${emptyKey}.`);
    }
  } catch (error) {
    return { state: "failed", attempt: 1, rolesFound: 0, durationMs: Date.now() - startedAt, message: scanFailureMessage({ error }) };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let tempPortals = null;
    try {
      if (!fromFile) tempPortals = writeJobPortals(root, job.id, config);
      const command = buildScanCommand(job);
      const result = spawnFn(
        process.execPath,
        [command.script, ...command.args],
        {
          cwd: CODE_ROOT,
          env: { ...coreEnv(root), CAREER_OPS_PORTALS: tempPortals || basePortals },
          encoding: "utf8",
          timeout: SCAN_TIMEOUT_MS,
          maxBuffer: MAX_OUTPUT_BYTES,
          windowsHide: true,
        },
      );

      if (result.status === 0) {
        const { rolesFound, counts } = readScanResult(job.engine || "full", result.stdout || "");
        return {
          state: "success",
          attempt,
          rolesFound,
          counts,
          durationMs: Date.now() - startedAt,
          message: `Scan finished with ${rolesFound} matching role${rolesFound === 1 ? "" : "s"}.`,
        };
      }
      lastError = scanFailureMessage(result, { timeoutMs: SCAN_TIMEOUT_MS });
      if (result.error?.code === "ETIMEDOUT") {
        finalAttempt = attempt;
        break;
      }
    } catch (error) {
      lastError = scanFailureMessage({ error });
    } finally {
      if (tempPortals) {
        try {
          fs.rmSync(tempPortals, { force: true });
        } catch {
          // Temporary filter cleanup is best effort.
        }
      }
    }
  }

  return {
    state: "failed",
    attempt: finalAttempt,
    rolesFound: 0,
    durationMs: Date.now() - startedAt,
    message: lastError,
  };
}

export async function recordCompletion(storePath, claim, result, inMemoryStore = null) {
  const at = nowIso();
  const apply = (store) => {
    const job = claim.job;
    const queueItem = claim.queueId && store.queue.find((item) => item.id === claim.queueId && item.claimToken === claim.claimToken);
    // A stale worker may finish after another worker reclaimed the item. Its
    // result must not overwrite the newer claim's run or job metadata.
    if (claim.queueId && !queueItem) return;
    const current = store.jobs.find((item) => item.id === job.id);
    if (current) {
      current.lastRunAt = at;
      current.rolesFoundCount = result.rolesFound;
      current.updatedAt = at;
      if (result.state === "failed") current.lastError = result.message;
      else delete current.lastError;
    }

    const run = store.runs.find((item) => item.id === claim.runId && item.jobId === job.id);
    const outcome = { at, durationMs: result.durationMs, state: result.state, attempt: result.attempt, message: result.message, rolesFound: result.rolesFound, engine: job.engine || "full", ...result.counts };
    if (run) Object.assign(run, outcome);
    else store.runs.unshift({ id: claim.runId || randomUUID(), jobId: job.id, ...outcome });
    store.queue = store.queue.filter((item) => !(item.id === claim.queueId && item.claimToken === claim.claimToken));
    if (store.runs.length > MAX_RUNS) store.runs = store.runs.slice(0, MAX_RUNS);
  };
  if (inMemoryStore) apply(inMemoryStore);
  else await withScheduledStore(storePath, apply);
}

/** Merge `counts` into run `runId`; a key set to undefined is removed. A run MAX_RUNS has trimmed is left alone. */
export async function recordStepCounts(storePath, runId, counts) {
  await withScheduledStore(storePath, (store) => {
    const run = store.runs.find((item) => item.id === runId);
    if (!run) {
      process.stderr.write(`rank: run ${runId} is no longer in the store; counts not recorded\n`);
      return;
    }
    for (const [key, value] of Object.entries(counts)) {
      if (value === undefined) delete run[key];
      else run[key] = value;
    }
  });
}

export function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

const RANK_DETAIL_MAX = 290;
// rank-pipeline.mjs's indented per-batch failure lines: the CLI's own cause in parentheses, or the batch's problem.
const RANK_BATCH_FAILED = /^\s+batch \d+: (?:CLI call failed \((.*)\), entries left un-annotated|(.*?) — entries left un-annotated)$/;

/*
 * Why a rank pass failed, for evalMessage. Without a batch line, the cause is
 * among rank-pipeline.mjs's column-0 lines, which state it first and a hint
 * after (its usage errors, its "No supported agent CLI found"), so they go to
 * stderrCause reversed: its last-line fallback then takes the first.
 */
export function rankFailureMessage(result, { timeoutMs = SCAN_TIMEOUT_MS, cli = process.env.CAREER_OPS_RANK_CLI } = {}) {
  const error = result?.error;
  const lines = String(result?.stderr || "").split(/\r?\n/).map((line) => line.trimEnd()).filter((line) => line.trim());
  const topLevel = lines.filter((line) => !/^\s/.test(line) && !/^Node\.js v\d/.test(line));
  let detail;
  if (error?.code === "ETIMEDOUT") detail = `ranker timed out after ${Math.round(timeoutMs / 60_000)} minutes.`;
  else if (error) detail = String(error.message || error).split(/\r?\n/)[0];
  else {
    const batch = lines.map((line) => line.match(RANK_BATCH_FAILED)).findLast(Boolean);
    detail = (batch && (batch[1] ?? batch[2]))
      || stderrCause(topLevel.toReversed().join("\n"))
      || (result?.signal ? `ranker stopped by ${result.signal}.` : `ranker exited ${result?.status ?? "unknown"}.`);
  }
  const bin = cli?.trim();
  if (bin && path.basename(bin) !== bin) detail = detail.replaceAll(bin, path.basename(bin));
  if (detail.length > RANK_DETAIL_MAX) {
    const cut = detail.slice(0, RANK_DETAIL_MAX);
    // Back up to a word boundary only when one is near the end, so one long token (a URL, a path) is not dropped whole.
    const space = cut.search(/\s+\S*$/);
    detail = `${space > RANK_DETAIL_MAX / 2 ? cut.slice(0, space) : cut}…`;
  }
  return `Rank: ${detail}`;
}

const RANK_LOCK = { timeoutMs: 1_000, staleMs: SCAN_TIMEOUT_MS * MAX_ATTEMPTS + 60_000 };
// Five ranker batches of ten at its default 180 s each stay inside SCAN_TIMEOUT_MS; the rest wait for the next tick.
const RANK_MAX_PER_PASS = 50;
const evaluatingJobs = (store) => store.jobs.filter((job) => job.status === "active" && job.evaluate && job.evaluate.mode !== "off");

const RANK_WAITING = " rows wait for the next rank pass.";

// A job's newest run needs a pass once it has finished, until one records its
// counts. A failed pass is not retried each tick, so a broken CLI is not paid
// for every 15 minutes; the job's next run sends those rows again.
function runToRank(store, job) {
  const lastRun = store.runs.find((run) => run.jobId === job.id);
  if (!lastRun || lastRun.state === "queued" || lastRun.state === "running") return null;
  return lastRun.ranked === undefined || lastRun.evalMessage?.endsWith(RANK_WAITING) ? lastRun : null;
}

/*
 * Rank the rows each review or auto job's scans added. It reads only durable
 * state (pipeline.md, scan-history.tsv, the store), so a tick after a crash or
 * a failed scan ranks what the earlier run left, and a row already ranked is
 * never sent again. It records counts on a run but never changes its `state`.
 */
export async function rankPass(root, storePath, { spawnFn = spawnSync } = {}) {
  const due = (store) => evaluatingJobs(store).filter((job) => runToRank(store, job));
  if (!due(readScheduledStore(storePath)).length) return;
  // Its own lock keeps a slow pass from running twice when the next tick's scan ends first.
  await withResourceLock(`${runnerResourcePath(storePath)}.rank`, async () => {
    const store = readScheduledStore(storePath);
    const pipelinePath = path.join(root, "data", "pipeline.md");
    const historyPath = path.join(root, "data", "scan-history.tsv");
    if (!fs.existsSync(historyPath) && pendingRows(readText(pipelinePath)).length) {
      process.stderr.write(`rank: ${historyPath} is missing, so no pending row counts as a scan's; nothing is ranked\n`);
    }
    const scanHistoryRows = scanHistoryDataLines(readText(historyPath))
      .filter((line) => line.trim())
      .map(parseScanHistoryLine);
    for (const job of due(store)) {
      try {
        await rankJob({ root, storePath, store, pipelinePath, scanHistoryRows, spawnFn }, job);
      } catch (error) {
        process.stderr.write(`rank: job ${job.id} failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  }, RANK_LOCK);
}

async function rankJob({ root, storePath, store, pipelinePath, scanHistoryRows, spawnFn }, job) {
  const lastRun = runToRank(store, job);
  const since = candidateSince({ job, runs: store.runs, excludeRunId: lastRun.id });
  const candidates = candidatesFor({ pendingRows: pendingRows(readText(pipelinePath)), scanHistoryRows, since });
  const waiting = candidates.filter((candidate) => !candidate.ranked);
  const unranked = waiting.slice(0, RANK_MAX_PER_PASS);
  const rankedBefore = candidates.length - waiting.length;
  let ranked = rankedBefore;
  // The waiting message keeps the run due, so the next tick sends the rest.
  let evalMessage = waiting.length > unranked.length ? `${waiting.length - unranked.length}${RANK_WAITING}` : undefined;
  if (unranked.length) {
    const urlsFile = writeJobTemp(root, job.id, "rank", "txt", `${unranked.map((c) => c.url).join("\n")}\n`);
    let rankerOutput = "";
    try {
      const result = spawnFn(
        process.execPath,
        ["rank-pipeline.mjs", "--urls-file", urlsFile, "--limit", String(unranked.length)],
        { cwd: CODE_ROOT, env: coreEnv(root), encoding: "utf8", timeout: SCAN_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
      );
      rankerOutput = `${result.stdout || ""}${result.stderr || ""}`;
      if (result.status !== 0) evalMessage = rankFailureMessage(result);
    } catch (error) {
      evalMessage = rankFailureMessage({ error });
    } finally {
      fs.rmSync(urlsFile, { force: true });
    }
    // The scan history has not changed, so the candidates are the same rows; only whether they are ranked can have changed.
    const rows = pendingRows(readText(pipelinePath));
    const urls = new Set(candidates.map((candidate) => candidate.url));
    ranked = rows.filter((row) => row.ranked && urls.has(row.url)).length;
    // rank-pipeline.mjs exits 0 unless every call failed. The run is not made due again, as for a failed pass.
    const sent = new Set(unranked.map((candidate) => candidate.url));
    const missed = unranked.length - rows.filter((row) => row.ranked && sent.has(row.url)).length;
    if (!evalMessage && missed > 0) {
      evalMessage = `Rank: ${missed} of ${unranked.length} sent rows came back unranked; the ranker's output is in the runner's stderr log.`;
      // Both streams: rank-pipeline explains skipped batches and unmatched rows on stdout, failed calls on stderr.
      for (const line of rankerOutput.split(/\r?\n/)) if (line.trim()) process.stderr.write(`rank: job ${job.id} | ${line}\n`);
    }
  }
  process.stderr.write(`rank: job ${job.id} since ${since}: ${ranked} ranked, ${unranked.length} sent${evalMessage ? `; ${evalMessage}` : ""}\n`);
  let autoQueued = lastRun.autoQueued;
  if (job.evaluate.mode === "auto") {
    // The rows still waiting for a later rank pass are left for that pass to queue.
    const passed = new Set(candidates.map((candidate) => candidate.url));
    for (const candidate of waiting.slice(unranked.length)) passed.delete(candidate.url);
    // Loaded here, not at the top, so a job outside auto mode never loads the ledger module.
    const { queueCandidates } = await import("../../lib/evaluate-queue.mjs");
    const rows = pendingRows(readText(pipelinePath)).filter((row) => passed.has(row.url));
    const autoJobIds = new Set(evaluatingJobs(store).filter((other) => other.evaluate.mode === "auto").map((other) => other.id));
    autoQueued = (autoQueued ?? 0) + await queueCandidates(root, { jobId: job.id, runId: lastRun.id, rankThreshold: job.evaluate.rankThreshold, autoJobIds }, rows);
  }
  if (lastRun.ranked !== ranked || lastRun.evalMessage !== evalMessage || lastRun.autoQueued !== autoQueued) {
    await recordStepCounts(storePath, lastRun.id, { ranked, evalMessage, autoQueued });
  }
}

async function takeDueJob(storePath) {
  return withScheduledStore(storePath, (store) => {
    enqueueDueJobs(store);
    return claimDueJob(store);
  });
}

function requestedJobId(args) {
  const index = args.indexOf("--job");
  return index >= 0 ? args[index + 1] || null : null;
}

// A live holder's pid keeps the lock however long its drain runs; this only frees one left by a dead runner.
const DRAIN_LOCK = { timeoutMs: 1_000, staleMs: 6 * 60 * 60 * 1_000 };

async function defaultDrain(options) {
  const { runDrain } = await import("./evaluate-drain.mjs");
  return runDrain(options);
}

/*
 * Drain the auto jobs' queue after the rank pass, under its own lock, so a
 * tick that fires while a long drain runs still scans and ranks. The drain
 * module loads only when an auto job exists or a run still carries a drain
 * reason, which keeps an idle tick cheap.
 */
async function drainPass(root, storePath, drainFn) {
  const store = readScheduledStore(storePath);
  // A run that still carries a reason gets one more pass after the last auto job is gone, to clear it.
  if (!store.jobs.some((job) => job.status === "active" && job.evaluate?.mode === "auto") && !store.runs.some((run) => run.drainMessage)) return;
  try {
    await withResourceLock(`${storePath}.drain`, () => drainFn({ root, storePath }), DRAIN_LOCK);
  } catch (error) {
    if (error?.code !== "LOCK_TIMEOUT") throw error;
    process.stderr.write("drain: another runner is draining; this tick leaves the queue to it\n");
  }
}

/** One runner tick. `root`, `spawnFn` and `drainFn` are seams for tests; the CLI passes none. */
export async function main(args = process.argv.slice(2), { root = getCareerOpsRoot(), spawnFn = spawnSync, drainFn = defaultDrain } = {}) {
  const storePath = scheduledStorePath(root);
  const runnerResource = runnerResourcePath(storePath);
  const manualJobId = requestedJobId(args);

  const tick = withResourceLock(
    runnerResource,
    async () => {
      let claim;
      if (manualJobId) {
        if (!isSafeScheduledId(manualJobId)) throw new Error("Invalid scheduled job identifier.");
        claim = await withScheduledStore(storePath, (store) => {
          const job = store.jobs.find((item) => item.id === manualJobId && item.status !== "deleted");
          if (!job) throw new Error("Scheduled job not found.");
          const manualClaim = claimManualJob(store, manualJobId);
          if (!manualClaim) throw new Error("Scheduled job is already running.");
          return manualClaim;
        });
      } else {
        claim = await takeDueJob(storePath);
      }

      if (!claim) return { status: "idle" };

      const result = executeJob(root, claim.job, { spawnFn });
      await recordCompletion(storePath, claim, result);
      if (result.state === "failed") throw new Error(result.message);
      return { status: "success", jobId: claim.job.id, ...result };
    },
    { timeoutMs: 1_000, staleMs: SCAN_TIMEOUT_MS * MAX_ATTEMPTS + 60_000 },
  );
  try {
    return await tick;
  } finally {
    // In a finally, so a failed scan or a busy runner lock still ranks the other jobs' rows.
    // The manual route returns when its scan finishes; the next tick ranks what it found.
    if (!manualJobId) {
      await rankPass(root, storePath, { spawnFn }).catch((error) => process.stderr.write(`rank pass failed: ${error instanceof Error ? error.message : String(error)}\n`));
      await drainPass(root, storePath, drainFn).catch((error) => process.stderr.write(`drain failed: ${error instanceof Error ? error.message : String(error)}\n`));
    }
  }
}

if (isMainModule(import.meta.url)) {
  main()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
