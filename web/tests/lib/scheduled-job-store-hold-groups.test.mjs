// The job store's rules for a location hold and source groups: what create and patch refuse, and what an edit that omits them keeps.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-job-store-"));
const saved = { root: process.env.CAREER_OPS_ROOT, code: process.env.CAREER_OPS_CODE_ROOT };
process.env.CAREER_OPS_ROOT = root;
// The suite runs from web/ and from the checkout root; the code root must not depend on which.
process.env.CAREER_OPS_CODE_ROOT = path.resolve(import.meta.dirname, "../../..");
test.after(() => {
  for (const [name, value] of [["CAREER_OPS_ROOT", saved.root], ["CAREER_OPS_CODE_ROOT", saved.code]]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

await import("../helpers/web-ts-alias-loader.mjs");
const { createScheduledJob, getScheduledJob, listScheduledJobs, parseScheduledJobInput, patchScheduledJob, ScheduledJobValidationError } = await import("../../src/lib/scheduled-jobs.ts");

const HOLD = { onsiteLocations: ["Springfield"], remoteCountries: ["United States"] };
const body = (extra = {}) => ({ name: "Fixture scan", engine: "portals", every: 1, unit: "days", timezone: "UTC", startAt: "2026-11-08T00:00:00.000Z", ...extra });
const storeFile = path.join(root, "data", "scheduled-jobs.json");

test("source groups are cleaned, and anything but a list is refused", () => {
  assert.deepEqual(parseScheduledJobInput(body({ sourceGroups: [" Weekly ", "weekly"] })).sourceGroups, ["Weekly"]);
  assert.deepEqual(parseScheduledJobInput(body()).sourceGroups, []);
  for (const sourceGroups of ["weekly", null, { weekly: true }, [2026], ["weekly", 3], ["!!!"], ["weekly", " "]]) {
    assert.throws(() => parseScheduledJobInput(body({ sourceGroups })), { name: "ScheduledJobValidationError", message: "Invalid source groups." });
  }
});

test("create refuses a hold the gate cannot build and writes no job", async () => {
  const fields = parseScheduledJobInput(body({ evaluate: { mode: "auto", hold: { ...HOLD, remoteCountries: ["Atlantis"] } } }));
  const before = listScheduledJobs().jobs.length;
  await assert.rejects(createScheduledJob(fields), (error) => error instanceof ScheduledJobValidationError && /Remote from/.test(error.message));
  assert.equal(listScheduledJobs().jobs.length, before);
});

test("an edit that omits the hold and the groups keeps both, and an empty list clears the groups", async () => {
  const job = await createScheduledJob(parseScheduledJobInput(body({ sourceGroups: ["weekly"], evaluate: { mode: "auto", hold: HOLD } })));
  await patchScheduledJob(job.id, { status: "paused" });
  let stored = getScheduledJob(job.id);
  assert.deepEqual([stored.status, stored.sourceGroups, stored.evaluate.hold], ["paused", ["weekly"], HOLD]);

  await assert.rejects(patchScheduledJob(job.id, { evaluate: { mode: "auto", hold: { ...HOLD, remoteCountries: ["Atlantis"] } } }), ScheduledJobValidationError);
  assert.deepEqual(getScheduledJob(job.id).evaluate.hold, HOLD, "a refused edit changes nothing");

  await patchScheduledJob(job.id, { sourceGroups: [] });
  stored = getScheduledJob(job.id);
  assert.deepEqual([stored.sourceGroups, stored.evaluate.hold], [[], HOLD]);
});

test("a job whose stored hold is unusable can still be paused", async () => {
  const job = await createScheduledJob(parseScheduledJobInput(body({ evaluate: { mode: "auto", hold: HOLD } })));
  const store = JSON.parse(fs.readFileSync(storeFile, "utf8"));
  store.jobs.find((item) => item.id === job.id).evaluate.hold.remoteCountries = ["Atlantis"];
  fs.writeFileSync(storeFile, JSON.stringify(store));
  await patchScheduledJob(job.id, { status: "paused" });
  assert.equal(getScheduledJob(job.id).status, "paused");
  await patchScheduledJob(job.id, { evaluate: { mode: "off" } });
  assert.equal(getScheduledJob(job.id).evaluate.mode, "off", "and switched out of Auto");
});
