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
