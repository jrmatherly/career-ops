/** @param {number | null} days */
export function agoLabel(days) {
  if (days == null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/**
 * A calendar date (YYYY-MM-DD) as "Nov 5", with the year when it is not the current one.
 * @param {string} isoDate
 */
export function formatDay(isoDate, now = new Date()) {
  const at = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(at.getTime())) return isoDate;
  const year = at.getUTCFullYear() === now.getFullYear() ? undefined : "numeric";
  return at.toLocaleDateString("en-US", { month: "short", day: "numeric", year, timeZone: "UTC" });
}

const dayKey = (at, timeZone) => at.toLocaleDateString("en-CA", { timeZone });

/**
 * A moment as "Today 7:00 AM", "Yesterday 7:00 AM" or "Nov 5, 7:00 AM" in `timeZone` (the runtime's zone when omitted).
 * @param {string | null} iso
 * @param {{ now?: Date, timeZone?: string }} [options]
 */
export function formatWhen(iso, { now = new Date(), timeZone } = {}) {
  if (!iso) return "Not yet";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  // ICU puts a narrow no-break space before AM/PM; plain text and tests expect a space.
  const time = at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone }).replace(/\s/g, " ");
  const day = dayKey(at, timeZone);
  const today = dayKey(now, timeZone);
  if (day === today) return `Today ${time}`;
  const yesterday = new Date(`${today}T12:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  if (day === yesterday.toISOString().slice(0, 10)) return `Yesterday ${time}`;
  const year = day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric";
  return `${at.toLocaleDateString("en-US", { month: "short", day: "numeric", year, timeZone })}, ${time}`;
}
