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

function formatTaskTime(value) {
  if (!value) return "Not reported";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

/**
 * The scheduler card's title, badge and subline for a GET /api/scheduler payload.
 * @param {{ source?: string, description?: string | null, platform?: string, task: { exists: boolean, enabled: boolean, nextRun: string | null, lastRun: string | null } }} status
 * @returns {{ title: string, badge: string, subline: string }}
 */
export function schedulerCardCopy(status) {
  const { task } = status;
  if (status.source === "external") {
    return {
      title: status.description ?? "External scheduler",
      badge: "Running",
      subline: task.lastRun ? `Last tick ${formatTaskTime(task.lastRun)}` : "No tick recorded yet",
    };
  }
  const os = osSchedulerFor(status.platform ?? "");
  if (!os) {
    return { title: "Manual scans", badge: "No automatic schedule", subline: "Automatic scheduling is not available on this platform." };
  }
  return {
    title: os.title,
    badge: task.exists ? (task.enabled ? "Task enabled" : "Task disabled") : "Task not installed",
    subline: task.exists
      ? `Next OS check: ${formatTaskTime(task.nextRun)} · Last OS check: ${formatTaskTime(task.lastRun)}`
      : `Install with ${os.install} to run due jobs automatically.`,
  };
}
