import { formatWhen } from "./format-time.mjs";

export function isSchedulerStatusPayload(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && value.task && typeof value.task === "object" && !Array.isArray(value.task)
    && (value.source === undefined || value.source === "os" || value.source === "external")
    && (value.description === undefined || value.description === null || typeof value.description === "string"));
}

const OS_SCHEDULERS = {
  win32: { title: "Windows Task Scheduler Integration", install: "web/scripts/install-scan-schedule.ps1" },
  darwin: { title: "macOS launchd Integration", install: "sh web/scripts/install-scan-schedule.sh" },
  linux: { title: "Linux cron Integration", install: "sh web/scripts/install-scan-schedule.sh" },
};

/** @param {string} platform */
export function osSchedulerFor(platform) {
  return Object.hasOwn(OS_SCHEDULERS, platform) ? OS_SCHEDULERS[platform] : undefined;
}

// "Not reported", not formatWhen's "Not yet": the OS did not say, which is not the same as never.
const formatTaskTime = (value, now) => (value ? formatWhen(value, { now: new Date(now) }) : "Not reported");

// The app does not know an external scheduler's cadence; the runner's own grid is a quarter hour,
// so an hour without a tick is four missed and the card stops calling it running.
const TICK_FRESH_MS = 60 * 60_000;

/**
 * The scheduler card's title, badge and subline for a GET /api/scheduler payload, and whether
 * the badge is the healthy (green) one.
 * @param {{ source?: string, description?: string | null, platform?: string, task: { exists: boolean, enabled: boolean, nextRun: string | null, lastRun: string | null } }} status
 * @param {number} [now]
 * @returns {{ title: string, badge: string, subline: string, healthy: boolean }}
 */
export function schedulerCardCopy(status, now = Date.now()) {
  const { task } = status;
  if (status.source === "external") {
    const healthy = Boolean(task.lastRun) && now - Date.parse(task.lastRun) <= TICK_FRESH_MS;
    return {
      title: status.description ?? "External scheduler",
      badge: healthy ? "Running" : task.lastRun ? "No recent tick" : "Waiting for first tick",
      healthy,
      subline: task.lastRun ? `Last tick ${formatTaskTime(task.lastRun, now)}` : "No tick recorded yet",
    };
  }
  const os = osSchedulerFor(status.platform ?? "");
  if (!os) {
    return { title: "Manual scans", badge: "No automatic schedule", healthy: false, subline: "Automatic scheduling is not available on this platform." };
  }
  return {
    title: os.title,
    badge: task.exists ? (task.enabled ? "Task enabled" : "Task disabled") : "Task not installed",
    healthy: task.exists && task.enabled,
    subline: task.exists
      ? `Next OS check: ${formatTaskTime(task.nextRun, now)} · Last OS check: ${formatTaskTime(task.lastRun, now)}`
      : `Install with ${os.install} to run due jobs automatically.`,
  };
}
