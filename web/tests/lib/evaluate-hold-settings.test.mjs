import test from "node:test";
import assert from "node:assert/strict";

import { holdPolicy, holdVerdict, scheduledEvaluate } from "../../src/lib/scheduled-job-input.mjs";
import { evaluateBody, evaluateForm, evaluateModeLabel } from "../../src/lib/evaluate-settings.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { holdPolicyProblem } from "../../src/lib/core/workplace-policy.mjs";

// Passed in, not taken from the cwd: this suite runs from web/ and from the checkout root.
const CODE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const HOLD = { onsiteLocations: ["Springfield"], remoteCountries: ["United States"] };
const base = scheduledEvaluate({ mode: "auto", hold: HOLD }, undefined);

test("a hold with both lists is stored, cleaned", () => {
  const stored = scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: [" Springfield ", "springfield"], remoteCountries: ["United States"] } }, undefined);
  assert.deepEqual(stored.hold, HOLD);
});
test("a body with no hold keeps the stored one", () => {
  assert.deepEqual(scheduledEvaluate({ mode: "auto" }, base).hold, HOLD);
});
test("a null hold removes it", () => {
  assert.equal("hold" in scheduledEvaluate({ mode: "auto", hold: null }, base), false);
});
test("two empty lists remove it", () => {
  assert.equal("hold" in scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: [], remoteCountries: [] } }, base), false);
});
test("one empty list is refused", () => {
  const message = { message: "A location hold needs both a home area and a remote country." };
  assert.throws(() => scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: ["Springfield"], remoteCountries: [] } }, base), message);
  assert.throws(() => scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: [], remoteCountries: ["United States"] } }, base), message);
});
test("a hold that is not an object of two lists is refused", () => {
  for (const hold of ["Springfield", ["Springfield"], { onsiteLocations: "Springfield", remoteCountries: ["United States"] }, { onsiteLocations: ["Springfield"] }]) {
    assert.throws(() => scheduledEvaluate({ mode: "auto", hold }, base), { message: "Invalid location hold." });
  }
});
test("a hold whose entries all clean away is refused, not read as no hold", () => {
  for (const hold of [{ onsiteLocations: ["!!!"], remoteCountries: ["??"] }, { onsiteLocations: [5], remoteCountries: [6] }, { onsiteLocations: [" "], remoteCountries: ["United States"] }]) {
    assert.throws(() => scheduledEvaluate({ mode: "auto", hold }, base), { message: "Invalid location hold." });
  }
});
test("a job with no hold stores no hold key", () => {
  assert.equal("hold" in scheduledEvaluate({ mode: "auto" }, undefined), false);
});

test("Review sends the mode alone, so a stored hold survives Auto to Review to Auto", () => {
  const review = scheduledEvaluate(evaluateBody({ ...evaluateForm(base), mode: "review" }, base), base);
  const auto = scheduledEvaluate(evaluateBody({ ...evaluateForm(review), mode: "auto" }, review), review);
  assert.deepEqual(auto.hold, HOLD);
});
test("the Auto form sends a hold typed into its two lists", () => {
  assert.deepEqual(evaluateBody({ mode: "auto", rankThreshold: "3.5", maxPerRun: "5", holdOnsite: ["Springfield"], holdRemote: ["United States"] }), { mode: "auto", rankThreshold: 3.5, maxPerRun: 5, hold: HOLD });
});
test("clearing both chip lists in Auto removes the hold", () => {
  const next = scheduledEvaluate(evaluateBody({ ...evaluateForm(base), holdOnsite: [], holdRemote: [] }, base), base);
  assert.equal("hold" in next, false);
});
test("the form shows a stored hold and empty lists for none", () => {
  assert.deepEqual([evaluateForm(base).holdOnsite, evaluateForm(base).holdRemote], [["Springfield"], ["United States"]]);
  assert.deepEqual([evaluateForm().holdOnsite, evaluateForm().holdRemote], [[], []]);
});
test("a stored hold whose lists are not lists shows no chips", () => {
  const form = evaluateForm({ mode: "auto", rankThreshold: 3.5, maxPerRun: 5, hold: { onsiteLocations: 42, remoteCountries: "United States" } });
  assert.deepEqual([form.holdOnsite, form.holdRemote], [[], []]);
});
test("saving the form over a stored hold it cannot show keeps that hold, so the runner still refuses it", () => {
  const stored = { mode: "auto", rankThreshold: 3.5, maxPerRun: 5, hold: { onsiteLocations: 42, remoteCountries: "United States" } };
  assert.equal("hold" in evaluateBody(evaluateForm(stored), stored), false);
  const partly = { ...stored, hold: { onsiteLocations: ["Springfield", 42], remoteCountries: ["United States"] } };
  assert.equal("hold" in evaluateBody(evaluateForm(partly), partly), false, "an unchanged save keeps it");
  assert.deepEqual(evaluateBody({ ...evaluateForm(partly), holdOnsite: ["Shelbyville"] }, partly).hold, { onsiteLocations: ["Shelbyville"], remoteCountries: ["United States"] }, "an edit replaces it");
  const remote = { ...stored, hold: { onsiteLocations: ["Springfield"], remoteCountries: "United States" } };
  assert.equal("hold" in evaluateBody(evaluateForm(remote), remote), false, "an unreadable remote list is kept too");
  assert.deepEqual(evaluateBody({ ...evaluateForm(remote), holdRemote: ["United States"] }, remote).hold, HOLD, "and correcting it is sent");
  const mixed = { ...stored, hold: { onsiteLocations: [42], remoteCountries: [] } };
  assert.equal("hold" in evaluateBody(evaluateForm(mixed), mixed), false);
  assert.deepEqual(evaluateBody({ ...evaluateForm(stored), holdOnsite: ["Springfield"], holdRemote: ["United States"] }, stored).hold, HOLD);
});
test("a stored hold of null, which the runner refuses, survives every save that does not edit it", () => {
  const stored = { mode: "auto", enabledAt: "2026-11-01", rankThreshold: 3.5, maxPerRun: 5, hold: null };
  assert.equal(scheduledEvaluate(evaluateBody(evaluateForm(stored), stored), stored).hold, null, "an unchanged Auto save");
  assert.equal(scheduledEvaluate(evaluateBody({ ...evaluateForm(stored), mode: "review" }, stored), stored).hold, null, "a switch to Review");
  assert.deepEqual(scheduledEvaluate(evaluateBody({ ...evaluateForm(stored), holdOnsite: ["Springfield"], holdRemote: ["United States"] }, stored), stored).hold, HOLD, "an edit replaces it");
});
test("the card badge names the hold", () => {
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5, maxPerRun: 5, hold: HOLD }), "Auto, rank 3.5 and above, 5 per run, other locations held");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5, maxPerRun: 5 }), "Auto, rank 3.5 and above, 5 per run");
});

const STATES = { ...HOLD, homeStates: ["Georgia"] };

test("holdPolicy is the gate's policy shape", () => {
  assert.deepEqual(holdPolicy(HOLD), { onsite_locations: ["Springfield"], remote_countries: ["United States"], home_states: [] });
  assert.deepEqual(holdPolicy(STATES).home_states, ["Georgia"]);
});
test("holdPolicyProblem names an unknown country and accepts a known one", async () => {
  assert.equal(await holdPolicyProblem({ onsiteLocations: ["Springfield"], remoteCountries: ["Atlantis"] }, CODE_ROOT), '"Remote from" must name a country, such as United States.');
  assert.equal(await holdPolicyProblem(HOLD, CODE_ROOT), null);
  assert.equal(await holdPolicyProblem(undefined), null);
});
test("home states are optional, cleaned and stored only when given", () => {
  assert.deepEqual(scheduledEvaluate({ mode: "auto", hold: { ...HOLD, homeStates: [" Georgia ", "georgia"] } }, undefined).hold, STATES);
  assert.equal("homeStates" in scheduledEvaluate({ mode: "auto", hold: { ...HOLD, homeStates: [] } }, undefined).hold, false);
  assert.equal("homeStates" in base.hold, false);
});
test("home states that are not a list, clean away, or stand alone are refused", () => {
  for (const homeStates of ["Georgia", ["!!!"], [5]]) assert.throws(() => scheduledEvaluate({ mode: "auto", hold: { ...HOLD, homeStates } }, base), { message: "Invalid location hold." });
  assert.throws(() => scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: [], remoteCountries: [], homeStates: ["Georgia"] } }, base), { message: "A location hold needs both a home area and a remote country." });
});
test("the form shows, sends and clears home states", () => {
  const stored = scheduledEvaluate({ mode: "auto", hold: STATES }, undefined);
  assert.deepEqual(evaluateForm(stored).holdStates, ["Georgia"]);
  assert.deepEqual(evaluateForm().holdStates, []);
  assert.deepEqual(evaluateBody(evaluateForm(stored), stored).hold, STATES);
  assert.deepEqual(evaluateBody({ ...evaluateForm(stored), holdStates: [] }, stored).hold, HOLD);
  assert.equal(evaluateBody({ ...evaluateForm(stored), holdOnsite: [], holdRemote: [], holdStates: [] }, stored).hold, null);
});
test("holdPolicyProblem names a home state the gate does not know", async () => {
  assert.equal(await holdPolicyProblem({ ...HOLD, homeStates: ["Ontario"] }, CODE_ROOT), '"Home states" must name US states, such as Georgia or GA.');
  assert.equal(await holdPolicyProblem(STATES, CODE_ROOT), null);
});
test("holdVerdict judges with the hold's home states", async () => {
  const core = await import(pathToFileURL(path.join(CODE_ROOT, "providers", "_country.mjs")).href);
  const tiers = (judge, ...locations) => locations.map((location) => judge(location, "Engineer").tier);
  const home = holdVerdict(core, STATES);
  const none = holdVerdict(core, HOLD);
  assert.deepEqual(tiers(home, "Remote, GA", "Remote - Georgia", "Remote, Georgia", "Georgia (Remote)", "Remote, TN", "Georgia, USA", "Kennesaw, GA", "Remote, Global - Canada"),
    ["fit", "fit", "fit", "fit", "review", "review", "review", "elsewhere"]);
  assert.equal(home("Kennesaw, GA", "Engineer").reason, "onsite_in_home_state");
  for (const location of ["Remote, GA", "Remote - Georgia", "Remote, Georgia", "Georgia (Remote)", "Georgia, USA", "Remote, CA, USA", "Remote - IL, USA", "Remote, CO, US"]) assert.equal(none(location, "Engineer").tier, "review", location);
  assert.equal(none("Remote - Georgia", "Engineer").reason, "remote_scoped_to_other_state");
  // The hold passes no worldwide regions, so these wait for a person.
  for (const location of ["Remote, Global", "Home based - Worldwide"]) assert.deepEqual(none(location, "Engineer"), { tier: "review", reason: "remote_eligibility_unconfirmed" }, location);
  assert.throws(() => holdVerdict(core, null), /requires onsite_locations and remote_countries/);
});
test("home states left alone in the form are sent, so the route refuses them and no hold is removed", () => {
  const stored = scheduledEvaluate({ mode: "auto", hold: STATES }, undefined);
  const body = evaluateBody({ ...evaluateForm(stored), holdOnsite: [], holdRemote: [] }, stored);
  assert.deepEqual(body.hold, { onsiteLocations: [], remoteCountries: [], homeStates: ["Georgia"] });
  assert.throws(() => scheduledEvaluate(body, stored), { message: "A location hold needs both a home area and a remote country." });
});
test("stored home states the form cannot show are kept by an unchanged save and replaced by an edit", () => {
  const stored = { mode: "auto", rankThreshold: 3.5, maxPerRun: 5, hold: { ...HOLD, homeStates: "GA" } };
  assert.equal("hold" in evaluateBody(evaluateForm(stored), stored), false);
  assert.deepEqual(evaluateBody({ ...evaluateForm(stored), holdStates: ["Georgia"] }, stored).hold, STATES);
});
test("a hold with an entry that is not text is refused, not judged with the entry dropped", async () => {
  const core = await import(pathToFileURL(path.join(CODE_ROOT, "providers", "_country.mjs")).href);
  for (const hold of [{ ...HOLD, onsiteLocations: ["Springfield", 5] }, { ...HOLD, remoteCountries: ["United States", null] }, { ...HOLD, homeStates: ["Georgia", {}] }]) {
    assert.throws(() => holdVerdict(core, hold), { message: "A location hold entry is not text." });
    assert.equal(await holdPolicyProblem(hold, CODE_ROOT), "A location hold entry is not text.");
  }
});
test("holdPolicyProblem tells an unknown home state from home states with no United States", async () => {
  assert.equal(await holdPolicyProblem({ onsiteLocations: ["Springfield"], remoteCountries: ["Canada"], homeStates: ["Georgia"] }, CODE_ROOT), '"Home states" apply only when "Remote from" includes the United States.');
  assert.equal(await holdPolicyProblem({ ...HOLD, homeStates: ["Ontario"] }, CODE_ROOT), '"Home states" must name US states, such as Georgia or GA.');
});
