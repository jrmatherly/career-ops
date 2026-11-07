// Ported from Reactive Resume packages/import/src/date.ts at d065a9f7. MIT, copyright Amruth Pillai; see THIRD_PARTY_NOTICES.md.
// Adapted: JavaScript, no other changes.
const fmt = new Intl.DateTimeFormat('en-US', { month: 'long' });

function getMonthName(month) {
  const index = Number.parseInt(month ?? '1', 10) - 1;
  if (index < 0 || index > 11) return 'undefined';
  return fmt.format(new Date(2000, index, 1));
}

/** Formats a partial ISO 8601 date (YYYY, YYYY-MM or YYYY-MM-DD) as "January 2024", or the year alone. */
export function formatDate(date) {
  const parts = date.split('-');
  if (parts.length >= 2) {
    const [year, month] = parts;
    return `${getMonthName(month)} ${year}`;
  }
  return date;
}

/** The year and month of an ISO 8601 date ("2024-01-15" -> "2024-01"); null when it isn't one. */
function toYearMonth(date) {
  const match = /^(\d{4})(?:-(0[1-9]|1[0-2]))?/.exec(date?.trim() ?? '');
  if (!match?.[1]) return null;
  return match[2] ? `${match[1]}-${match[2]}` : match[1];
}

/** Structured dates for a range of ISO dates; a start with no end is ongoing. */
export function toRangeDates(startDate, endDate) {
  const start = toYearMonth(startDate);
  const end = toYearMonth(endDate);
  return { start, end, present: Boolean(start) && !endDate };
}

/** Structured dates for a single ISO date. The day, if any, doesn't print. */
export const toSingleDates = (date) => ({ start: toYearMonth(date), end: null, present: false });
