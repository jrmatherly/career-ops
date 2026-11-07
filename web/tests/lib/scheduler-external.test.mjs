// An external scheduler (a Kubernetes CronJob, say) owns the schedule: status
// never asks the OS, and POST /api/scheduler touches the tick the cron line would.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../helpers/web-ts-alias-loader.mjs";
import "../helpers/next-server-stub.mjs";
import { externalScheduleStatus } from "../../src/lib/scheduled-os-schedule.mjs";

const dataRoot = mkdtempSync(join(tmpdir(), "co-sched-ext-data-"));
const codeRoot = mkdtempSync(join(tmpdir(), "co-sched-ext-code-"));
const tick = join(dataRoot, "data", "scheduled-jobs.json.tick");
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
  writeFileSync(join(codeRoot, "web", "scripts", "scheduled-jobs-runner.mjs"), "process.exit(0);\n");
});

after(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(dataRoot, { recursive: true, force: true });
  rmSync(codeRoot, { recursive: true, force: true });
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
