import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveCodeRoot } from "@/lib/core/code-root.mjs";
import { readLockStatus } from "./scheduled-jobs-store.mjs";
import { externalScheduleStatus, osScheduleStatus } from "./scheduled-os-schedule.mjs";
import { scheduledRunnerResourcePath, scheduledStorePath } from "./scheduled-runner-path.mjs";

const execFileAsync = promisify(execFile);
const TASK_NAME = "career-ops recurring scan";
const LAUNCHD_LABEL = "io.career-ops.scheduled-scan";

export type SchedulerStatus = {
  platform: NodeJS.Platform;
  available: boolean;
  running: boolean;
  // installed mirrors task.exists; description is set only when source is "external".
  source: "os" | "external";
  installed: boolean;
  description: string | null;
  task: {
    exists: boolean;
    enabled: boolean;
    status: string | null;
    nextRun: string | null;
    lastRun: string | null;
  };
};

const EMPTY_TASK: SchedulerStatus["task"] = { exists: false, enabled: false, status: null, nextRun: null, lastRun: null };

export function schedulerTickPath(root = careerOpsRoot()): string {
  return scheduledStorePath(root) + ".tick";
}

/** Where the runner's stderr goes: the file the cron line from install-scan-schedule.sh appends to. */
export function schedulerLogPath(root = careerOpsRoot()): string {
  return path.join(path.dirname(scheduledStorePath(root)), "scheduled-jobs.log");
}

let warnedSchedulerValue: string | null = null;

/** Who owns the schedule: the OS task the install scripts create, or something outside the host that drives POST /api/scheduler. */
export function schedulerSource(): SchedulerStatus["source"] {
  const value = (process.env.CAREER_OPS_SCHEDULER ?? "").trim().toLowerCase();
  if (value === "external") return "external";
  if (value && warnedSchedulerValue !== value) {
    warnedSchedulerValue = value;
    console.warn(`career-ops web: CAREER_OPS_SCHEDULER=${JSON.stringify(value)} is not a known value (only "external" is); reading the OS schedule instead.`);
  }
  return "os";
}

function readTickMtimeMs(root: string): number | null {
  const tick = schedulerTickPath(root);
  try {
    return fs.statSync(tick).mtimeMs;
  } catch (error) {
    // A missing tick means no run yet; any other error is a data-volume problem worth seeing.
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`career-ops web: cannot read ${tick}:`, error);
    return null;
  }
}

async function readUnixTask(root: string, platform: "darwin" | "linux"): Promise<SchedulerStatus["task"]> {
  const tickMtimeMs = readTickMtimeMs(root);
  const now = new Date();
  if (platform === "linux") {
    let crontabText = "";
    try {
      crontabText = (await execFileAsync("crontab", ["-l"], { timeout: 5_000 })).stdout;
    } catch {
      // No crontab, or crontab is missing: nothing is installed.
    }
    return osScheduleStatus({ platform, crontabText, launchctlExitCode: null, tickMtimeMs, now });
  }

  const uid = process.getuid?.();
  if (uid === undefined) return { ...EMPTY_TASK };
  let launchctlExitCode = 0;
  try {
    await execFileAsync("launchctl", ["print", `gui/${uid}/${LAUNCHD_LABEL}`], { timeout: 5_000 });
  } catch {
    // launchctl exits non-zero (113) when the job is not loaded; only zero matters.
    launchctlExitCode = 1;
  }
  return osScheduleStatus({ platform, crontabText: "", launchctlExitCode, tickMtimeMs, now });
}

async function readTask(root: string): Promise<SchedulerStatus["task"]> {
  if (process.platform === "darwin" || process.platform === "linux") return readUnixTask(root, process.platform);
  if (process.platform !== "win32") return { ...EMPTY_TASK };

  const script = [
    `$task = Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue`,
    "if (-not $task) { Write-Output '{\"exists\":false}'; exit 0 }",
    `$info = Get-ScheduledTaskInfo -TaskName '${TASK_NAME}'`,
    "$result = [PSCustomObject]@{",
    "  exists = $true",
    "  enabled = ($task.State -ne 'Disabled')",
    "  status = [string]$task.State",
    "  nextRun = if ($info.NextRunTime -gt [DateTime]::MinValue) { $info.NextRunTime.ToString('o') } else { $null }",
    "  lastRun = if ($info.LastRunTime -gt [DateTime]::MinValue) { $info.LastRunTime.ToString('o') } else { $null }",
    "}",
    "$result | ConvertTo-Json -Compress",
  ].join("; ");

  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 5_000, maxBuffer: 128 * 1024 },
    );
    const parsed = JSON.parse(stdout.trim()) as Partial<SchedulerStatus["task"]>;
    return {
      exists: parsed.exists === true,
      enabled: parsed.enabled === true,
      status: typeof parsed.status === "string" ? parsed.status : null,
      nextRun: typeof parsed.nextRun === "string" ? parsed.nextRun : null,
      lastRun: typeof parsed.lastRun === "string" ? parsed.lastRun : null,
    };
  } catch {
    return { exists: false, enabled: false, status: null, nextRun: null, lastRun: null };
  }
}

export async function schedulerStatus(): Promise<SchedulerStatus> {
  const root = careerOpsRoot();
  const runner = path.join(resolveCodeRoot(process.cwd(), process.env), "web", "scripts", "scheduled-jobs-runner.mjs");
  const runnerLock = scheduledRunnerResourcePath(scheduledStorePath(root));
  const lock = readLockStatus(runnerLock, { staleMs: 25 * 60 * 1_000 * 3 + 60_000 });
  const source = schedulerSource();
  const external = source === "external";
  const description = external ? process.env.CAREER_OPS_SCHEDULER_DESCRIPTION?.trim() || null : null;
  const task = external ? externalScheduleStatus({ description, tickMtimeMs: readTickMtimeMs(root) }) : await readTask(root);
  return {
    platform: process.platform,
    available: fs.existsSync(runner),
    running: lock.active && !lock.stale,
    source,
    installed: task.exists,
    description,
    task,
  };
}
