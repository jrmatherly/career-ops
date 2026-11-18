import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { holdProblemNote, inboxEmptyState, shortlistVerdicts, tierView, TIER_FILTERS, VERDICT_FALLBACK, VERDICT_TIERS, bestVerdict, inTier, scoreLocationNote, tierCounts, tierEmptyState, verdictBadge } from "../../src/lib/inbox-verdict.mjs";
import { markVerdicts } from "../../src/lib/inbox-pending.mjs";
import { storedHolds } from "../../src/lib/scheduled-job-input.mjs";
import { loadHoldVerdicts } from "../../src/lib/core/workplace-policy.mjs";
import { LOCATION_TIERS } from "../../../providers/_country.mjs";

// Passed in, not taken from the cwd: this suite runs from web/ and from the checkout root.
const CODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const HOME = { onsiteLocations: ["Atlanta"], remoteCountries: ["United States"] };
const OTHER = { onsiteLocations: ["Berlin"], remoteCountries: ["Germany"] };
const fit = { tier: "fit", reason: "onsite_location_allowed" };
const review = { tier: "review", reason: "location_unknown" };
const elsewhere = { tier: "elsewhere", reason: "onsite_outside_allowed_locations" };

test("the web tier order is the core's", () => {
  assert.deepEqual(VERDICT_TIERS, LOCATION_TIERS);
});

test("bestVerdict keeps the best tier and the first of equals", () => {
  assert.equal(bestVerdict([elsewhere, review, fit]), fit);
  assert.equal(bestVerdict([elsewhere, review]), review);
  const first = { tier: "review", reason: "remote_eligibility_unconfirmed" };
  assert.equal(bestVerdict([first, review]), first);
  assert.equal(bestVerdict([]), undefined);
});

test("markVerdicts gives each row the best verdict of the holds, from its own location and role", () => {
  const seen = [];
  const a = (location, title) => { seen.push([location, title]); return location === "Atlanta" ? fit : elsewhere; };
  const b = (location) => (location ? elsewhere : review);
  const jobs = [{ url: "u1", location: "Atlanta", role: "Engineer" }, { url: "u2", role: "Analyst" }, { url: "u3", location: "Lyon", role: "Lead" }];
  assert.deepEqual(markVerdicts(jobs, [a, b]).map((job) => job.verdict), [fit, review, elsewhere]);
  assert.deepEqual(seen, [["Atlanta", "Engineer"], ["", "Analyst"], ["Lyon", "Lead"]]);
});

test("markVerdicts with no hold marks nothing", () => {
  const jobs = [{ url: "u1", location: "Lyon" }];
  assert.equal(markVerdicts(jobs, []), jobs);
});

test("storedHolds takes every job but a deleted one, with its name", () => {
  const job = (name, status, evaluate) => ({ name, status, evaluate });
  assert.deepEqual(storedHolds([
    job("A", "active", { mode: "auto", hold: HOME }), job("B", "paused", { mode: "review", hold: OTHER }),
    job("C", "deleted", { mode: "auto", hold: HOME }), job("D", "active", { mode: "auto" }), job("E", "active", undefined), job("F", "active", { mode: "auto", hold: null }),
  ]), [{ name: "A", hold: HOME }, { name: "B", hold: OTHER }, { name: "F", hold: null }]);
});

test("loadHoldVerdicts builds one verdict per hold and names the scan whose hold it cannot build", async () => {
  const { verdicts, problems } = await loadHoldVerdicts([
    { name: "Home", hold: HOME }, { name: "Lost city", hold: { onsiteLocations: ["Springfield"], remoteCountries: ["Atlantis"] } }, { name: "Edited", hold: null },
  ], CODE_ROOT);
  assert.equal(verdicts.length, 1);
  assert.equal(problems.length, 2);
  assert.equal(problems[0], '"Lost city": "Remote from" must name a country, such as United States.');
  assert.match(problems[1], /^"Edited": /);
  assert.deepEqual(await loadHoldVerdicts([], CODE_ROOT), { verdicts: [], problems: [] });
});

// The spec's Finding 1 table, its verdict table and plan 1's revised rows, under a hold with no home state.
const ROWS = [
  ["", "review", "location_unknown"],
  ["Remote", "review", "remote_eligibility_unconfirmed"],
  ["Remote, Global", "review", "remote_eligibility_unconfirmed"],
  ["United States", "review", "location_names_no_place"],
  ["5 Locations", "review", "location_names_no_place"],
  ["Multiple US Locations", "review", "location_names_no_place"],
  ["Nationwide", "review", "location_names_no_place"],
  ["Location TBD", "review", "location_names_no_place"],
  ["Remote, TN", "review", "remote_scoped_to_other_state"],
  ["Remote - Georgia", "review", "remote_scoped_to_other_state"],
  ["Remote - United States", "fit", "remote_region_allowed"],
  ["Sunnyvale, CA, USA; Atlanta, GA, USA", "fit", "onsite_location_allowed"],
  ["Metropolis, NY", "elsewhere", "onsite_outside_allowed_locations"],
  ["Remote, Canada", "elsewhere", "remote_country_restricted"],
];

test("the hold reads the spec's rows as the spec does, and each reason has its own sentence", async () => {
  const { verdicts: [verdict] } = await loadHoldVerdicts([{ name: "Home", hold: HOME }], CODE_ROOT);
  for (const [location, tier, reason] of ROWS) {
    const got = verdict(location, "Engineer");
    assert.deepEqual(got, { tier, reason }, location || "(blank)");
    const badge = verdictBadge(got);
    if (tier === "fit") assert.equal(badge, null);
    else assert.notEqual(badge.reason, VERDICT_FALLBACK, reason);
  }
});

test("a row either hold admits is fit", async () => {
  const { verdicts } = await loadHoldVerdicts([{ name: "Home", hold: HOME }, { name: "Other", hold: OTHER }], CODE_ROOT);
  assert.equal(markVerdicts([{ url: "u", location: "Berlin", role: "Engineer" }], verdicts)[0].verdict.tier, "fit");
});

test("the badge names the tier and gives the reason in plain words", () => {
  assert.deepEqual(verdictBadge({ tier: "review", reason: "remote_eligibility_unconfirmed" }), {
    label: "Review location", tone: "warn", reason: "Remote, and the posting does not say from where.",
    title: "Remote, and the posting does not say from where. Judged from the row's location and title, not the posting text.",
  });
  assert.equal(verdictBadge({ tier: "review", reason: "onsite_in_home_state" }).reason, "On-site or hybrid in one of your home states, outside your home area.");
  assert.equal(verdictBadge(elsewhere).label, "Elsewhere");
  assert.equal(verdictBadge(elsewhere).tone, "muted");
  assert.equal(verdictBadge(fit), null);
  assert.equal(verdictBadge(undefined), null);
});

test("a reason with no sentence gets the general one", () => {
  assert.equal(verdictBadge({ tier: "elsewhere", reason: "a_reason_added_later" }).reason, VERDICT_FALLBACK);
});

const rows = [{ verdict: fit }, { verdict: review }, { verdict: review }, { verdict: elsewhere }];

test("tierCounts counts each tier, and is null when no row has a verdict", () => {
  assert.deepEqual(tierCounts(rows), { fit: 1, review: 2, elsewhere: 1, all: 4 });
  assert.equal(tierCounts([{ url: "u" }]), null);
  assert.equal(tierCounts([]), null);
});

test("inTier never filters out a row with no verdict", () => {
  assert.equal(inTier({ verdict: review }, "review"), true);
  assert.equal(inTier({ verdict: review }, "fit"), false);
  assert.equal(inTier({ verdict: elsewhere }, "all"), true);
  assert.equal(inTier({}, "fit"), true);
});

test("tierEmptyState names the tiers that hold the rows", () => {
  assert.deepEqual(tierEmptyState("fit", { fit: 0, review: 2, elsewhere: 1, all: 3 }), { title: "No fit roles", hint: "2 under Review location, 1 under Elsewhere." });
  assert.deepEqual(tierEmptyState("elsewhere", { fit: 1, review: 0, elsewhere: 0, all: 1 }), { title: "Nothing elsewhere", hint: "1 under Fit." });
  assert.equal(tierEmptyState("review", { fit: 0, review: 0, elsewhere: 0, all: 0 }), null);
  assert.equal(tierEmptyState("all", { fit: 0, review: 0, elsewhere: 0, all: 0 }), null);
  assert.equal(tierEmptyState("fit", null), null);
});

test("the tier labels never say hidden", () => {
  assert.deepEqual(TIER_FILTERS.map((tier) => tier.label), ["Fit", "Review location", "Elsewhere", "All"]);
});

test("scoreLocationNote counts only rows judged not fit", () => {
  const byUrl = new Map([["a", fit], ["b", review], ["c", elsewhere], ["d", elsewhere]]);
  const items = (...urls) => urls.map((url) => ({ url }));
  assert.equal(scoreLocationNote(items("a"), byUrl), null);
  assert.equal(scoreLocationNote(items("a", "gone"), byUrl), null);
  assert.deepEqual(scoreLocationNote(items("b"), byUrl), {
    summary: "This role is not a location fit. You can still score it.",
    reasons: ["1 · Review location: The posting gives no location."],
  });
  assert.equal(scoreLocationNote(items("a", "b", "gone"), byUrl).summary, "1 of 3 is not a location fit. You can still score it.");
  assert.deepEqual(scoreLocationNote(items("a", "b", "c", "d"), byUrl), {
    summary: "3 of 4 are not a location fit. You can still score them.",
    reasons: ["2 · Elsewhere: On-site or hybrid outside your home area.", "1 · Review location: The posting gives no location."],
  });
});

test("holdProblemNote names each hold left out and says whether anything was judged", () => {
  assert.equal(holdProblemNote([], true), null);
  assert.equal(holdProblemNote(['"Lost city": bad country'], true), 'Location hold: "Lost city": bad country. The Inbox judged locations without it.');
  assert.equal(holdProblemNote(['"A": x', '"B": y'], true), 'Location hold: "A": x; "B": y. The Inbox judged locations without them.');
  assert.equal(holdProblemNote(['"Lost city": bad country'], false), 'Location hold: "Lost city": bad country. No location was judged, so the Inbox shows every row.');
});

test("a tier the web does not know is read as review, never as a fit", () => {
  const odd = { tier: "maybe", reason: "a_reason_added_later" };
  assert.equal(bestVerdict([odd, elsewhere]), odd);
  assert.equal(bestVerdict([odd, fit]), fit);
  assert.equal(bestVerdict([odd, review]), odd, "the first of equals");
  assert.deepEqual(tierCounts([{ verdict: odd }, { verdict: fit }]), { fit: 1, review: 1, elsewhere: 0, all: 2 });
  assert.equal(inTier({ verdict: odd }, "review"), true);
  assert.equal(inTier({ verdict: odd }, "fit"), false);
  assert.deepEqual(verdictBadge(odd), { label: "Review location", tone: "warn", reason: VERDICT_FALLBACK, title: `${VERDICT_FALLBACK} Judged from the row's location and title, not the posting text.` });
});

test("tierView opens on Fit, and only the Fit tier with no other facet is capped", () => {
  const counts = { fit: 30, review: 2, elsewhere: 1, all: 33 };
  const view = (input) => tierView({ counts, tier: null, showAll: false, otherFacets: false, ...input });
  assert.deepEqual(view({}), { activeTier: "fit", anyFacet: false, capped: true });
  assert.deepEqual(view({ tier: "review" }), { activeTier: "review", anyFacet: true, capped: false });
  assert.deepEqual(view({ tier: "all" }), { activeTier: "all", anyFacet: true, capped: false });
  assert.deepEqual(view({ tier: "fit", otherFacets: true }), { activeTier: "fit", anyFacet: true, capped: false });
  assert.deepEqual(view({ showAll: true }), { activeTier: "fit", anyFacet: false, capped: false });
  // No hold: every row shows, the tier is not a facet, and a tier picked earlier is ignored.
  assert.deepEqual(view({ counts: null, tier: "elsewhere" }), { activeTier: "all", anyFacet: false, capped: true });
});

test("inboxEmptyState points at the other tiers first, then the scan date, then the filters", () => {
  const added = { title: "Nothing added on 2026-11-05", hint: "Pick another date." };
  assert.deepEqual(inboxEmptyState("fit", { fit: 0, review: 2, elsewhere: 0, all: 2 }, added), { title: "No fit roles", hint: "2 under Review location." });
  assert.equal(inboxEmptyState("all", { fit: 0, review: 0, elsewhere: 0, all: 0 }, added), added);
  assert.deepEqual(inboxEmptyState("fit", null, null), { title: "No matches", hint: "Loosen the filters to see more of your inbox." });
});

test("scoreLocationNote lists reasons with equal counts in the badge sentences' order", () => {
  const byUrl = new Map([["a", elsewhere], ["b", { tier: "review", reason: "remote_eligibility_unconfirmed" }], ["c", review]]);
  assert.deepEqual(scoreLocationNote([{ url: "a" }, { url: "b" }, { url: "c" }], byUrl).reasons, [
    "1 · Review location: The posting gives no location.",
    "1 · Review location: Remote, and the posting does not say from where.",
    "1 · Elsewhere: On-site or hybrid outside your home area.",
  ]);
});

test("shortlistVerdicts keeps a saved row's verdict once the row has left the Inbox", () => {
  const saved = [{ url: "gone", verdict: elsewhere }, { url: "here", verdict: elsewhere }, { url: "plain" }];
  const byUrl = shortlistVerdicts(saved, [{ url: "here", verdict: fit }, { url: "plain" }]);
  assert.equal(byUrl.get("gone"), elsewhere);
  assert.equal(byUrl.get("here"), fit, "the Inbox's current verdict wins");
  assert.equal(byUrl.has("plain"), false);
  assert.equal(scoreLocationNote(saved, byUrl).summary, "1 of 3 is not a location fit. You can still score it.");
});
