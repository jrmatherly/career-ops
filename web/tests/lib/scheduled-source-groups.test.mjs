// A scheduled portals scan reads only the entries of the source groups it names.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";

import { executeJob, selectSourceGroups } from "../../scripts/scheduled-jobs-runner.mjs";
import { scheduledJobBody } from "../../src/lib/scheduled-job-body.mjs";

const config = { title_filter: { positive: ["x"] }, tracked_companies: [{ name: "Fixture Alpha" }, { name: "Fixture Beta", group: "weekly" }, { name: "Fixture Gamma", group: " Weekly " }], job_boards: [{ name: "Fixture Board", group: "heavy" }] };
const names = (c) => [...c.tracked_companies, ...c.job_boards].map((e) => e.name);

test("no groups selects the entries with no group", () => assert.deepEqual(names(selectSourceGroups(config, [])), ["Fixture Alpha"]));
test("a named group selects its entries, ignoring case and spaces", () => assert.deepEqual(names(selectSourceGroups(config, ["weekly"])), ["Fixture Beta", "Fixture Gamma"]));
test("two groups select both", () => assert.deepEqual(names(selectSourceGroups(config, ["weekly", "heavy"])), ["Fixture Beta", "Fixture Gamma", "Fixture Board"]));
test("a config with no group anywhere is returned as is", () => { const plain = { tracked_companies: [{ name: "Fixture Alpha" }] }; assert.equal(selectSourceGroups(plain, []), plain); });
test("an empty or null group counts as no group, and a list that is not an array is left alone", () => {
  const odd = { tracked_companies: [{ name: "Fixture Alpha", group: "" }, { name: "Fixture Beta", group: null }], job_boards: "none" };
  assert.equal(selectSourceGroups(odd, []), odd);
});
test("the input config is not changed", () => { selectSourceGroups(config, ["weekly"]); assert.equal(config.tracked_companies.length, 3); });

const JOB = "44444444-4444-4444-8444-444444444444";
const PORTALS = (entries) => `title_filter:\n  positive: [engineer]\ntracked_companies:\n${entries}`;

function run(portalsYml, job) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-source-groups-"));
  fs.writeFileSync(path.join(root, "portals.yml"), portalsYml);
  const saved = process.env.CAREER_OPS_PORTALS;
  delete process.env.CAREER_OPS_PORTALS;
  const write = process.stderr.write;
  process.stderr.write = () => true;
  let seen = null;
  try {
    const result = executeJob(root, { id: JOB, engine: "portals", filters: { sinceDays: 3 }, ...job }, {
      spawnFn: (_node, _args, options) => {
        const file = options.env.CAREER_OPS_PORTALS;
        seen = { file, base: file === path.join(root, "portals.yml"), config: yaml.load(fs.readFileSync(file, "utf8")) };
        return { status: 0, stdout: "", stderr: "" };
      },
    });
    return { result, seen };
  } finally {
    process.stderr.write = write;
    if (saved !== undefined) process.env.CAREER_OPS_PORTALS = saved;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const GROUPED = PORTALS("  - name: Fixture Alpha\n  - name: Fixture Beta\n    group: weekly\n");

test("a file job gets an overlay without the grouped entry once any entry has a group", () => {
  const { result, seen } = run(GROUPED, { filtersFrom: "file" });
  assert.equal(result.state, "success");
  assert.equal(seen.base, false, "the scanner is given an overlay, not portals.yml");
  assert.deepEqual(seen.config.tracked_companies.map((e) => e.name), ["Fixture Alpha"]);
});
test("a file job with no group in the file is given portals.yml itself", () => {
  const { seen } = run(PORTALS("  - name: Fixture Alpha\n"), { filtersFrom: "file" });
  assert.equal(seen.base, true);
});
test("a job naming a group scans only that group", () => {
  const { seen } = run(GROUPED, { filtersFrom: "custom", sourceGroups: ["Weekly"] });
  assert.deepEqual(seen.config.tracked_companies.map((e) => e.name), ["Fixture Beta"]);
});
test("a job naming a group no enabled entry has fails once, with the group's name", () => {
  for (const [portals, groups] of [[GROUPED, ["wekly"]], [PORTALS("  - name: Fixture Beta\n    group: weekly\n    enabled: false\n"), ["weekly"]]]) {
    const { result, seen } = run(portals, { filtersFrom: "file", sourceGroups: groups });
    assert.equal(result.state, "failed");
    assert.equal(result.attempt, 1);
    assert.ok(result.message.includes(`No enabled source is in "${groups[0]}". Tag an entry with group: in portals.yml.`), result.message);
    assert.equal(seen, null, "the scanner was not started");
  }
});
test("a custom job with no groups also skips the grouped entry, and keeps its filters", () => {
  const { seen } = run(GROUPED, { filtersFrom: "custom", filters: { positive: ["architect"], sinceDays: 3 } });
  assert.deepEqual(seen.config.tracked_companies.map((e) => e.name), ["Fixture Alpha"]);
  assert.deepEqual(seen.config.title_filter.positive, ["architect"]);
});
test("one misspelled group beside a good one fails the run and names only the bad one", () => {
  const { result, seen } = run(GROUPED, { filtersFrom: "file", sourceGroups: ["weekly", "wekly"] });
  assert.equal(result.state, "failed");
  assert.equal(result.attempt, 1);
  assert.ok(result.message.includes('No enabled source is in "wekly". Tag an entry with group: in portals.yml.'), result.message);
  assert.equal(seen, null);
});
test("a job naming no group fails when every enabled entry has one", () => {
  const { result, seen } = run(PORTALS("  - name: Fixture Beta\n    group: weekly\n"), { filtersFrom: "file" });
  assert.equal(result.state, "failed");
  assert.ok(result.message.includes("Every enabled source in portals.yml has a group, and this scan names none."), result.message);
  assert.equal(seen, null);
});
test("a file with no enabled entry and no group is scanned as before", () => {
  const { result, seen } = run(PORTALS("  - name: Fixture Alpha\n    enabled: false\n"), { filtersFrom: "file" });
  assert.equal(result.state, "success");
  assert.equal(seen.base, true);
});
test("a numeric group is its name, and any other shape fails the run with the entry's name", () => {
  const { seen } = run(PORTALS("  - name: Fixture Alpha\n  - name: Fixture Beta\n    group: 2026\n"), { filtersFrom: "file", sourceGroups: ["2026"] });
  assert.deepEqual(seen.config.tracked_companies.map((e) => e.name), ["Fixture Beta"]);
  const bad = run(PORTALS("  - name: Fixture Alpha\n  - name: Fixture Beta\n    group: [daily, weekly]\n"), { filtersFrom: "file" });
  assert.equal(bad.result.state, "failed");
  assert.ok(bad.result.message.includes('"Fixture Beta" has a group that is not a name'), bad.result.message);
  assert.equal(bad.seen, null);
});
test("the run log says overlay when groups make the runner write one for a file job", () => {
  const lines = [];
  const write = process.stderr.write;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "career-ops-source-groups-log-"));
  fs.writeFileSync(path.join(root, "portals.yml"), GROUPED);
  process.stderr.write = (chunk) => { lines.push(String(chunk)); return true; };
  try {
    executeJob(root, { id: JOB, engine: "portals", filtersFrom: "file", filters: { sinceDays: 3 } }, { spawnFn: () => ({ status: 0, stdout: "", stderr: "" }) });
  } finally {
    process.stderr.write = write;
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.equal(lines.join(""), `portals: ${path.join(root, "portals.yml")} (overlay)\n`);
});
test("the full engine ignores groups", () => {
  const { seen } = run(GROUPED, { engine: "full", filtersFrom: "file", sourceGroups: ["wekly"], filters: { sinceDays: 3, ats: ["lever"], limitPerAts: 5 } });
  assert.equal(seen.base, true);
});

test("the job body carries the source groups", () => {
  assert.deepEqual(scheduledJobBody({ name: "n", filters: {}, every: 1, unit: "days", sourceGroups: ["weekly"] }).sourceGroups, ["weekly"]);
});
