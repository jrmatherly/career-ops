// An external scheduler (a Kubernetes CronJob, say) owns the schedule: status
// never asks the OS, and POST /api/scheduler touches the tick the cron line would.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../helpers/web-ts-alias-loader.mjs";
import "../helpers/next-server-stub.mjs";
import { externalScheduleStatus } from "../../src/lib/scheduled-os-schedule.mjs";
import { isSchedulerStatusPayload, schedulerCardCopy } from "../../src/lib/scheduled-scheduler-status.mjs";

const dataRoot = mkdtempSync(join(tmpdir(), "co-sched-ext-data-"));
const codeRoot = mkdtempSync(join(tmpdir(), "co-sched-ext-code-"));
const tick = join(dataRoot, "data", "scheduled-jobs.json.tick");
const stubRunner = join(codeRoot, "web", "scripts", "scheduled-jobs-runner.mjs");
const ENV = {
  CAREER_OPS_SCHEDULER: "external",
  CAREER_OPS_SCHEDULER_DESCRIPTION: "CronJob every 15 min",
  CAREER_OPS_ROOT: dataRoot,
  CAREER_OPS_DATA_DIR: "",
  CAREER_OPS_CODE_ROOT: codeRoot,
  CAREER_OPS_SCHEDULED_JOBS_PATH: "",
};
const savedEnv = Object.fromEntries(Object.keys(ENV).map((k) => [k, process.env[k]]));

before(() => {
  Object.assign(process.env, ENV);
  mkdirSync(join(codeRoot, "web", "scripts"), { recursive: true });
  writeFileSync(stubRunner, "process.exit(0);\n");
});

after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  // The detached stub runner may still hold codeRoot as its cwd for a moment, which Windows refuses to delete.
  const retry = { recursive: true, force: true, maxRetries: 20, retryDelay: 100 };
  rmSync(dataRoot, retry);
  rmSync(codeRoot, retry);
});

test("externalScheduleStatus reports an enabled task with no OS next run", () => {
  assert.deepEqual(externalScheduleStatus({ description: "CronJob", tickMtimeMs: Date.UTC(2026, 10, 6, 12) }), {
    exists: true,
    enabled: true,
    status: "CronJob",
    nextRun: null,
    lastRun: "2026-11-06T12:00:00.000Z",
  });
});

test("externalScheduleStatus falls back to a generic label and a null last run", () => {
  const task = externalScheduleStatus({ description: null, tickMtimeMs: null });
  assert.equal(task.status, "External scheduler");
  assert.equal(task.lastRun, null);
});

test("schedulerStatus under an external scheduler reads the tick, not the OS", async () => {
  mkdirSync(join(dataRoot, "data"), { recursive: true });
  writeFileSync(tick, "");
  const when = new Date(Date.UTC(2026, 10, 1, 8, 30));
  utimesSync(tick, when, when);
  const { schedulerStatus } = await import("@/lib/scheduler-status");
  const status = await schedulerStatus();
  assert.equal(status.source, "external");
  assert.equal(status.installed, true);
  assert.equal(status.description, "CronJob every 15 min");
  assert.equal(status.task.exists, true);
  assert.equal(status.task.enabled, true);
  assert.equal(status.task.nextRun, null);
  assert.equal(status.task.lastRun, new Date(statSync(tick).mtimeMs).toISOString());
});

test("a blank description falls back to the generic label", async () => {
  process.env.CAREER_OPS_SCHEDULER_DESCRIPTION = "   ";
  const { schedulerStatus } = await import("@/lib/scheduler-status");
  const status = await schedulerStatus();
  assert.equal(status.description, null);
  assert.equal(status.task.status, "External scheduler");
  process.env.CAREER_OPS_SCHEDULER_DESCRIPTION = ENV.CAREER_OPS_SCHEDULER_DESCRIPTION;
});

test("POST /api/scheduler touches the tick so GET reports the run", async () => {
  rmSync(tick, { force: true });
  const { GET, POST } = await import("@/app/api/scheduler/route.ts");
  const res = await POST();
  assert.equal(res.status, 202);
  const mtimeMs = statSync(tick).mtimeMs;
  assert.ok(Math.abs(Date.now() - mtimeMs) < 5_000, "tick is fresh");
  const body = await (await GET()).json();
  assert.equal(body.task.lastRun, new Date(mtimeMs).toISOString());
});

test("POST /api/scheduler keeps the runner's stderr in scheduled-jobs.log, as the cron line does", async () => {
  const log = join(dataRoot, "data", "scheduled-jobs.log");
  rmSync(log, { force: true });
  writeFileSync(stubRunner, 'process.stderr.write("drain: drained: 1 evaluated\\n");\n');
  try {
    const { POST } = await import("@/app/api/scheduler/route.ts");
    assert.equal((await POST()).status, 202);
    const read = () => (existsSync(log) ? readFileSync(log, "utf8") : "");
    for (let i = 0; i < 100 && !read().includes("drain:"); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(read(), /^\[\d{4}-\d{2}-\d{2}T[\d:.]+Z\] tick\n(?:.*\n)*?drain: drained: 1 evaluated\n/);
    assert.equal((await POST()).status, 202);
    for (let i = 0; i < 100 && read().split("drain:").length < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(read().split("drain:").length, 3, "a second tick appends");
  } finally {
    writeFileSync(stubRunner, "process.exit(0);\n");
  }
});

test("POST /api/scheduler still starts the runner when the log cannot be opened", async () => {
  const log = join(dataRoot, "data", "scheduled-jobs.log");
  rmSync(log, { force: true });
  mkdirSync(log);
  rmSync(tick, { force: true });
  const warn = console.warn;
  const warnings = [];
  console.warn = (...args) => warnings.push(args.join(" "));
  try {
    const { POST } = await import("@/app/api/scheduler/route.ts");
    assert.equal((await POST()).status, 202);
    assert.equal(existsSync(tick), true);
    // Windows opens a directory for append and fails on the first write instead.
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /runner log/);
  } finally {
    console.warn = warn;
    rmSync(log, { recursive: true, force: true });
  }
});

test("the tick follows CAREER_OPS_SCHEDULED_JOBS_PATH, as the cron line does", async () => {
  const store = join(dataRoot, "elsewhere", "jobs.json");
  process.env.CAREER_OPS_SCHEDULED_JOBS_PATH = store;
  const { schedulerTickPath } = await import("@/lib/scheduler-status");
  const { GET, POST } = await import("@/app/api/scheduler/route.ts");
  assert.equal(schedulerTickPath(dataRoot), `${store}.tick`);
  assert.equal((await POST()).status, 202);
  assert.equal(existsSync(join(dataRoot, "elsewhere", "scheduled-jobs.log")), true, "the log sits beside the store");
  const mtimeMs = statSync(`${store}.tick`).mtimeMs;
  assert.equal((await (await GET()).json()).task.lastRun, new Date(mtimeMs).toISOString());
  process.env.CAREER_OPS_SCHEDULED_JOBS_PATH = "";
});

test("a 404 (runner not installed) leaves no tick", async () => {
  rmSync(tick, { force: true });
  renameSync(stubRunner, `${stubRunner}.off`);
  try {
    const { POST } = await import("@/app/api/scheduler/route.ts");
    assert.equal((await POST()).status, 404);
    assert.equal(existsSync(tick), false);
  } finally {
    renameSync(`${stubRunner}.off`, stubRunner);
  }
});

test("without the env the status is the OS schedule and a manual POST leaves lastRun alone", async () => {
  delete process.env.CAREER_OPS_SCHEDULER;
  rmSync(tick, { force: true });
  try {
    const { schedulerStatus } = await import("@/lib/scheduler-status");
    const { POST } = await import("@/app/api/scheduler/route.ts");
    const status = await schedulerStatus();
    assert.equal(status.source, "os");
    assert.equal(status.description, null);
    assert.equal(status.installed, status.task.exists);
    assert.equal((await POST()).status, 202);
    assert.equal(existsSync(tick), false);
    process.env.CAREER_OPS_SCHEDULER = "k8s";
    assert.equal((await schedulerStatus()).source, "os", "an unknown value reads as the OS schedule");
  } finally {
    process.env.CAREER_OPS_SCHEDULER = ENV.CAREER_OPS_SCHEDULER;
  }
});

test("the scheduler card names an external scheduler and its last tick, never an OS check", () => {
  const copy = schedulerCardCopy({
    source: "external",
    description: "CronJob career-ops-scan-tick, every 15 minutes",
    task: { exists: true, enabled: true, lastRun: "2026-11-12T02:00:00Z", nextRun: null },
  }, Date.parse("2026-11-12T02:20:00Z"));
  assert.equal(copy.title, "CronJob career-ops-scan-tick, every 15 minutes");
  assert.equal(copy.badge, "Running");
  assert.equal(copy.healthy, true);
  assert.match(copy.subline, /^Last tick /);
  assert.doesNotMatch(copy.subline, /Next OS check/);
});

test("an external scheduler with no description or tick says so", () => {
  const copy = schedulerCardCopy({ source: "external", description: null, task: { exists: true, enabled: true, lastRun: null, nextRun: null } });
  assert.equal(copy.title, "External scheduler");
  assert.equal(copy.subline, "No tick recorded yet");
  assert.equal(copy.badge, "Waiting for first tick");
  assert.equal(copy.healthy, false);
});

test("an external scheduler whose last tick is over an hour old is not called running", () => {
  const task = { exists: true, enabled: true, lastRun: "2026-11-12T02:00:00Z", nextRun: null };
  const copy = schedulerCardCopy({ source: "external", description: null, task }, Date.parse("2026-11-12T03:00:01Z"));
  assert.equal(copy.badge, "No recent tick");
  assert.equal(copy.healthy, false);
  assert.match(copy.subline, /^Last tick /);
});

test("the client guard takes the external status the server builds, and refuses a wrong source or description", () => {
  const task = externalScheduleStatus({ description: "CronJob x", tickMtimeMs: undefined });
  assert.equal(isSchedulerStatusPayload({ source: "external", description: "CronJob x", task }), true);
  assert.equal(isSchedulerStatusPayload({ source: "external", description: null, task }), true);
  assert.equal(isSchedulerStatusPayload({ source: "os", task }), true);
  assert.equal(isSchedulerStatusPayload({ source: "k8s", task }), false);
  assert.equal(isSchedulerStatusPayload({ source: "external", description: 42, task }), false);
});

test("the OS scheduler card keeps its platform copy", () => {
  const task = { exists: true, enabled: true, lastRun: null, nextRun: null };
  assert.deepEqual(schedulerCardCopy({ source: "os", platform: "linux", task }), {
    title: "Linux cron Integration",
    badge: "Task enabled",
    healthy: true,
    subline: "Next OS check: Not reported · Last OS check: Not reported",
  });
  assert.deepEqual(schedulerCardCopy({ source: "os", platform: "darwin", task: { ...task, exists: false } }), {
    title: "macOS launchd Integration",
    badge: "Task not installed",
    healthy: false,
    subline: "Install with sh web/scripts/install-scan-schedule.sh to run due jobs automatically.",
  });
  assert.deepEqual(schedulerCardCopy({ source: "os", platform: "aix", task }), {
    title: "Manual scans",
    badge: "No automatic schedule",
    healthy: false,
    subline: "Automatic scheduling is not available on this platform.",
  });
});
