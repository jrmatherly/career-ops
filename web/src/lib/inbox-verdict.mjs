/**
 * The Inbox's reading of a location verdict (`locationVerdict` in providers/_country.mjs).
 *
 * @typedef {"fit" | "review" | "elsewhere"} LocationTier
 * @typedef {{ tier: LocationTier, reason: string }} Verdict
 * @typedef {LocationTier | "all"} TierFilter
 */

/**
 * LOCATION_TIERS in providers/_country.mjs, best first. Client code cannot import providers/, so a test keeps the two equal.
 *
 * @type {LocationTier[]}
 */
export const VERDICT_TIERS = ["fit", "review", "elsewhere"];

/**
 * The verdict whose tier comes first in VERDICT_TIERS; the first of equals wins.
 *
 * @param {Verdict[]} verdicts
 * @returns {Verdict | undefined}
 */
export function bestVerdict(verdicts) {
  let best;
  for (const verdict of verdicts) {
    if (!best || VERDICT_TIERS.indexOf(tierOf(verdict)) < VERDICT_TIERS.indexOf(tierOf(best))) best = verdict;
  }
  return best;
}

// A tier the core gains later reads as review: it must not pass as a fit, and must not hide the row.
const tierOf = (verdict) => (VERDICT_TIERS.includes(verdict.tier) ? verdict.tier : "review");

export const VERDICT_FALLBACK = "Your scheduled scans' location hold does not admit this location.";
export const VERDICT_SOURCE = "Judged from the row's location and title, not the posting text.";

const REASONS = {
  location_unknown: "The posting gives no location.",
  remote_eligibility_unconfirmed: "Remote, and the posting does not say from where.",
  location_names_no_place: "The location does not name a specific place.",
  remote_scoped_to_other_state: "Remote, limited to a US state that is not one of your home states, or to a code that may be a state or a country.",
  onsite_in_home_state: "On-site or hybrid in one of your home states, outside your home area.",
  onsite_outside_allowed_locations: "On-site or hybrid outside your home area.",
  onsite_country_restricted: "Your home area beside another place, or a place with its name in another country.",
  remote_country_restricted: "Remote, from a country you did not list.",
  exclusive_foreign_country: "Open only to people in another country.",
  candidate_country_excluded: "The posting excludes your country.",
  home_state_excluded: "The posting text may say it is not open in your home state.",
  metadata_country_restricted: "The posting's own fields limit it to another country.",
  description_country_restricted: "The posting text limits it to another country.",
  description_location_restricted: "The posting text requires living somewhere else.",
  description_locality_restricted: "The posting text limits it to a narrower area.",
  description_onsite_restricted: "The posting text requires office days somewhere else.",
};

/** @type {Record<"review" | "elsewhere", { label: "Review location" | "Elsewhere", tone: "warn" | "muted" }>} */
const TIER_BADGES = { review: { label: "Review location", tone: "warn" }, elsewhere: { label: "Elsewhere", tone: "muted" } };

/**
 * The badge for a row that is not a fit, or null for a fit and for no verdict.
 *
 * @param {Verdict | undefined} verdict
 * @returns {{ label: "Review location" | "Elsewhere", tone: "warn" | "muted", reason: string, title: string } | null}
 */
export function verdictBadge(verdict) {
  const badge = verdict && TIER_BADGES[tierOf(verdict)];
  if (!badge) return null;
  const reason = Object.hasOwn(REASONS, verdict.reason) ? REASONS[verdict.reason] : VERDICT_FALLBACK;
  return { ...badge, reason, title: `${reason} ${VERDICT_SOURCE}` };
}

/**
 * The Inbox's location segment, in order. "All" is not a tier: it shows every row.
 *
 * @type {{ id: TierFilter, label: string }[]}
 */
export const TIER_FILTERS = [{ id: "fit", label: "Fit" }, { id: "review", label: "Review location" }, { id: "elsewhere", label: "Elsewhere" }, { id: "all", label: "All" }];

/**
 * Rows per tier, or null when no row has a verdict: no scan has a usable hold, or there are no rows.
 *
 * @param {{ verdict?: Verdict }[]} jobs
 * @returns {Record<TierFilter, number> | null}
 */
export function tierCounts(jobs) {
  const counts = { fit: 0, review: 0, elsewhere: 0, all: jobs.length };
  let judged = false;
  for (const job of jobs) {
    if (!job.verdict) continue;
    judged = true;
    counts[tierOf(job.verdict)] += 1;
  }
  return judged ? counts : null;
}

/** Whether a row shows under a tier. A row with no verdict is never filtered out: `markVerdicts` marks every row or none, so the counts still match the rows. */
export const inTier = (job, tier) => tier === "all" || !job.verdict || tierOf(job.verdict) === tier;

const EMPTY_TITLES = { fit: "No fit roles", review: "Nothing to review", elsewhere: "Nothing elsewhere" };

/**
 * What an empty tier says: where the rows are. Null when there is no hold, under "All", or when no other tier holds a row.
 *
 * @param {TierFilter} tier
 * @param {Record<LocationTier, number> | null} counts
 * @returns {{ title: string, hint: string } | null}
 */
export function tierEmptyState(tier, counts) {
  if (!counts || tier === "all") return null;
  const others = TIER_FILTERS.filter(({ id }) => id !== tier && id !== "all" && counts[id] > 0);
  if (!others.length) return null;
  return { title: EMPTY_TITLES[tier], hint: `${others.map(({ id, label }) => `${counts[id]} under ${label}`).join(", ")}.` };
}

/**
 * What the Score confirm says about the shortlisted rows that are not a location fit, or null when none is.
 * An item with no verdict counts in the total and not as unfit.
 *
 * @param {{ url: string }[]} items
 * @param {Map<string, Verdict>} verdictByUrl
 * @returns {{ summary: string, reasons: string[] } | null}
 */
export function scoreLocationNote(items, verdictByUrl) {
  const lines = new Map();
  let unfit = 0;
  for (const item of items) {
    const badge = verdictBadge(verdictByUrl.get(item.url));
    if (!badge) continue;
    unfit += 1;
    const line = `${badge.label}: ${badge.reason}`;
    lines.set(line, (lines.get(line) ?? 0) + 1);
  }
  if (!unfit) return null;
  const total = items.length;
  const summary = total === 1 ? "This role is not a location fit. You can still score it."
    : unfit === 1 ? `1 of ${total} is not a location fit. You can still score it.`
    : `${unfit} of ${total} are not a location fit. You can still score them.`;
  const order = Object.values(REASONS);
  const rank = (line) => { const at = order.findIndex((sentence) => line.endsWith(`: ${sentence}`)); return at < 0 ? order.length : at; };
  const reasons = [...lines].sort(([a, countA], [b, countB]) => countB - countA || rank(a) - rank(b)).map(([line, count]) => `${count} · ${line}`);
  return { summary, reasons };
}

/**
 * The Inbox alert for holds that could not be built (`loadHoldVerdicts`' problems), or null when every hold built.
 * `judged` says whether any other hold gave the rows a verdict.
 *
 * @param {string[]} problems
 * @param {boolean} judged
 */
export function holdProblemNote(problems, judged) {
  if (!problems.length) return null;
  const outcome = judged ? `The Inbox judged locations without ${problems.length === 1 ? "it" : "them"}.` : "No location was judged, so the Inbox shows every row.";
  return `Location hold: ${problems.join("; ")}. ${outcome}`;
}

/**
 * Which tier the Inbox shows and whether its list is the capped first batch. `tier` is the picked tier, or null
 * for the default. With no counts no scan has a usable hold: every row shows and the tier is not a facet.
 *
 * @param {{ counts: object | null, tier: TierFilter | null, showAll: boolean, otherFacets: boolean }} input
 * @returns {{ activeTier: TierFilter, anyFacet: boolean, capped: boolean }}
 */
export function tierView({ counts, tier, showAll, otherFacets }) {
  const activeTier = counts ? tier ?? "fit" : "all";
  const anyFacet = otherFacets || (counts != null && activeTier !== "fit");
  return { activeTier, anyFacet, capped: !showAll && !anyFacet };
}

const NO_MATCHES = { title: "No matches", hint: "Loosen the filters to see more of your inbox." };

/**
 * What an empty Inbox list says: where the rows are among the tiers, else the scan date's copy, else the general line.
 *
 * @param {TierFilter} tier
 * @param {Record<LocationTier, number> | null} counts
 * @param {{ title: string, hint: string } | null | undefined} addedCopy
 * @returns {{ title: string, hint: string }}
 */
export const inboxEmptyState = (tier, counts, addedCopy) => tierEmptyState(tier, counts) ?? addedCopy ?? NO_MATCHES;

/**
 * The verdict of each shortlisted row: the Inbox's current one, else the one saved with the row, which is all
 * that is left once a saved row is skipped or tracked.
 *
 * @param {{ url: string, verdict?: Verdict }[]} shortlist
 * @param {{ url: string, verdict?: Verdict }[]} inbox
 * @returns {Map<string, Verdict>}
 */
export function shortlistVerdicts(shortlist, inbox) {
  return new Map([...shortlist, ...inbox].flatMap((row) => (row.verdict ? [[row.url, row.verdict]] : [])));
}
