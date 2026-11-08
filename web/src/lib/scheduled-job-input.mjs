import { localDate } from "./core/evaluate-candidates.mjs";

export function assertScheduledJobBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Scheduled job body must be an object.");
  }
  return value;
}

export function scheduledFiltersFrom(value, base) {
  if (value === undefined) return base ?? "custom";
  if (value === "file" || value === "custom") return value;
  throw new Error("Invalid filters source.");
}

const EVALUATE_MODES = ["off", "review", "auto"];

function clamped(value, fallback, minimum, maximum, round, label) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if ((typeof value !== "number" && typeof value !== "string") || value === "" || !Number.isFinite(number)) throw new Error(`Invalid ${label}.`);
  return Math.min(maximum, Math.max(minimum, round(number)));
}

/*
 * A body that omits `evaluate` keeps the base job's. `enabledAt` becomes today
 * in `timezone` on every move from off (or no settings) to review or auto, so
 * the rank pass never reaches back to rows found before that day.
 */
export function scheduledEvaluate(value, base, timezone, nowMs = Date.now()) {
  if (value === undefined) return base;
  if (!value || typeof value !== "object" || Array.isArray(value) || !EVALUATE_MODES.includes(value.mode)) {
    throw new Error("Invalid evaluate settings.");
  }
  const turnedOn = value.mode !== "off" && (!base || base.mode === "off");
  return {
    mode: value.mode,
    enabledAt: turnedOn || !base?.enabledAt ? localDate(nowMs, timezone) : base.enabledAt,
    rankThreshold: clamped(value.rankThreshold, base?.rankThreshold ?? 3.5, 1, 5, (n) => Math.round(n * 10) / 10, "rank threshold"),
    maxPerRun: clamped(value.maxPerRun, base?.maxPerRun ?? 5, 1, 20, Math.round, "evaluations per run"),
  };
}
