import test from "node:test";
import assert from "node:assert/strict";

import { holdPolicy, scheduledEvaluate } from "../../src/lib/scheduled-job-input.mjs";
import { evaluateBody, evaluateForm, evaluateModeLabel } from "../../src/lib/evaluate-settings.mjs";
import { holdPolicyProblem } from "../../src/lib/core/workplace-policy.mjs";

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
  assert.equal("hold" in scheduledEvaluate({ mode: "auto", hold: { onsiteLocations: [" "], remoteCountries: [] } }, base), false);
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
test("a job with no hold stores no hold key", () => {
  assert.equal("hold" in scheduledEvaluate({ mode: "auto" }, undefined), false);
});

test("Review sends the mode alone, so a stored hold survives Auto to Review to Auto", () => {
  const review = scheduledEvaluate(evaluateBody({ ...evaluateForm(base), mode: "review" }, base), base);
  const auto = scheduledEvaluate(evaluateBody({ ...evaluateForm(review), mode: "auto" }, review), review);
  assert.deepEqual(auto.hold, HOLD);
});
test("clearing both chip lists in Auto removes the hold", () => {
  const next = scheduledEvaluate(evaluateBody({ ...evaluateForm(base), holdOnsite: [], holdRemote: [] }, base), base);
  assert.equal("hold" in next, false);
});
test("the form shows a stored hold and empty lists for none", () => {
  assert.deepEqual([evaluateForm(base).holdOnsite, evaluateForm(base).holdRemote], [["Springfield"], ["United States"]]);
  assert.deepEqual([evaluateForm().holdOnsite, evaluateForm().holdRemote], [[], []]);
});
test("the card badge names the hold", () => {
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5, maxPerRun: 5, hold: HOLD }), "Auto, rank 3.5 and above, 5 per run, other locations held");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5, maxPerRun: 5 }), "Auto, rank 3.5 and above, 5 per run");
});

test("holdPolicy is the gate's policy shape", () => {
  assert.deepEqual(holdPolicy(HOLD), { onsite_locations: ["Springfield"], remote_countries: ["United States"] });
});
test("holdPolicyProblem names an unknown country and accepts a known one", async () => {
  assert.equal(await holdPolicyProblem({ onsiteLocations: ["Springfield"], remoteCountries: ["Atlantis"] }), '"Remote from" must name a country, such as United States.');
  assert.equal(await holdPolicyProblem(HOLD), null);
  assert.equal(await holdPolicyProblem(undefined), null);
});
