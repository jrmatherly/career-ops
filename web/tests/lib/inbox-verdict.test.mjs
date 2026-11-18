import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VERDICT_FALLBACK, VERDICT_TIERS, bestVerdict, verdictBadge } from "../../src/lib/inbox-verdict.mjs";
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
  assert.match(problems[0], /^"Lost city": .*remote_countries/);
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
