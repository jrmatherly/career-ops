/**
 * Loading and a loaded list with nothing due share one height, so the tabs
 * stay put when the cadence comes back empty. Five or fewer active follow-ups fit
 * on screen, where the narrative only repeats the table, so it shows above that.
 * @param {{ pending: boolean, filtering: boolean, hasSummary: boolean, due: number, active?: number }} state
 * @returns {"hidden" | "reserved" | "narrative"}
 */
export function followupsSummarySlot({ pending, filtering, hasSummary, due, active = 0 }) {
  if (filtering) return "hidden";
  if (pending) return "reserved";
  if (!hasSummary) return "hidden";
  if (due > 0 && active > 5) return "narrative";
  return "reserved";
}
