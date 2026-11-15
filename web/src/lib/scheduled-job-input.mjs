import { hostLocalDate } from "./core/evaluate-candidates.mjs";
import { cleanChips } from "./clean-chips.mjs";

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

/** The workplace policy (providers/_country.mjs) a stored hold stands for. */
export const holdPolicy = (hold) => ({ onsite_locations: hold.onsiteLocations, remote_countries: hold.remoteCountries });

// Null or two empty lists remove the hold.
function scheduledHold(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || !Array.isArray(value.onsiteLocations) || !Array.isArray(value.remoteCountries)) throw new Error("Invalid location hold.");
  const onsiteLocations = cleanChips(value.onsiteLocations);
  const remoteCountries = cleanChips(value.remoteCountries);
  if (!onsiteLocations.length && !remoteCountries.length) return undefined;
  if (!onsiteLocations.length || !remoteCountries.length) throw new Error("A location hold needs both a home area and a remote country.");
  return { onsiteLocations, remoteCountries };
}

/*
 * A body that omits `evaluate` keeps the base job's. `enabledAt` becomes
 * the host's local today, the clock `first_seen` is stamped on, when the job moves from off (or no settings) to review
 * or auto, or has none yet, so the rank pass never reaches back to rows found
 * before that day.
 */
export function scheduledEvaluate(value, base, nowMs = Date.now()) {
  if (value === undefined) return base;
  if (!value || typeof value !== "object" || Array.isArray(value) || !EVALUATE_MODES.includes(value.mode)) {
    throw new Error("Invalid evaluate settings.");
  }
  const turnedOn = value.mode !== "off" && (!base || base.mode === "off");
  // A body with no hold keeps the stored one as it is, even one the runner refuses (null in a store edited by hand).
  const kept = value.hold === undefined && base && "hold" in base;
  const hold = kept ? base.hold : scheduledHold(value.hold);
  return {
    mode: value.mode,
    enabledAt: turnedOn || !base?.enabledAt ? hostLocalDate(nowMs) : base.enabledAt,
    rankThreshold: clamped(value.rankThreshold, base?.rankThreshold ?? 3.5, 1, 5, (n) => Math.round(n * 10) / 10, "rank threshold"),
    maxPerRun: clamped(value.maxPerRun, base?.maxPerRun ?? 5, 1, 20, Math.round, "evaluations per run"),
    ...(kept || hold ? { hold } : {}),
  };
}
