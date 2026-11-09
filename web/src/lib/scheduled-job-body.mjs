// The lists a job takes from portals.yml when filtersFrom is "file". Leaving them
// out of the body keeps a stored job's own lists for when the toggle goes off.
const FILE_LISTS = ["positive", "negative", "allow", "block", "blockHard", "alwaysAllow"];

/**
 * @param {{ name: string, engine?: string, filtersFrom?: "custom" | "file", filters: Record<string, unknown>,
 *   every: number, unit: string, timezone?: string, startAt?: string,
 *   evaluate?: { mode: "off" | "review" | "auto", rankThreshold?: number, maxPerRun?: number } }} fields
 * Leaving `evaluate` out keeps the stored job's settings.
 */
export function scheduledJobBody({ name, engine, filtersFrom = "custom", filters, every, unit, timezone, startAt, evaluate }) {
  const sent = filtersFrom === "file"
    ? Object.fromEntries(Object.entries(filters).filter(([key]) => !FILE_LISTS.includes(key)))
    : filters;
  return { name, engine, filtersFrom, filters: sent, every, unit, timezone, startAt, evaluate };
}
