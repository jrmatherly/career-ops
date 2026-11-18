/**
 * The Inbox's reading of a location verdict (`locationVerdict` in providers/_country.mjs).
 *
 * @typedef {{ tier: "fit" | "review" | "elsewhere", reason: string }} Verdict
 */

/** LOCATION_TIERS in providers/_country.mjs, best first. Client code cannot import providers/, so a test keeps the two equal. */
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
    if (!best || VERDICT_TIERS.indexOf(verdict.tier) < VERDICT_TIERS.indexOf(best.tier)) best = verdict;
  }
  return best;
}

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

const TIER_BADGES = { review: { label: "Review location", tone: "warn" }, elsewhere: { label: "Elsewhere", tone: "muted" } };

/**
 * The badge for a row that is not a fit, or null for a fit and for no verdict.
 *
 * @param {Verdict | undefined} verdict
 * @returns {{ label: "Review location" | "Elsewhere", tone: "warn" | "muted", reason: string, title: string } | null}
 */
export function verdictBadge(verdict) {
  const badge = verdict && TIER_BADGES[verdict.tier];
  if (!badge) return null;
  const reason = Object.hasOwn(REASONS, verdict.reason) ? REASONS[verdict.reason] : VERDICT_FALLBACK;
  return { ...badge, reason, title: `${reason} ${VERDICT_SOURCE}` };
}
