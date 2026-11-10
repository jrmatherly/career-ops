import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import { applyYamlChanges } from "../../src/lib/settings-yaml.mjs";

const read = (rel) => readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
const comments = (text) => text.split(/\r?\n/).filter((l) => /^\s*#/.test(l)).length;

test("profile: a top-level key and two section keys in one edit keep every comment", () => {
  const src = read("config/profile.example.yml");
  const out = applyYamlChanges(src, [
    { path: ["spend_tier"], value: "premium" },
    { path: ["pipeline", "auto_evaluate_daily_cap"], value: 25 },
    { path: ["cv", "max_pages"], value: 1 },
  ]);
  assert.equal(comments(out.text), comments(src));
  const doc = yaml.load(out.text);
  assert.deepEqual([doc.spend_tier, doc.pipeline.auto_evaluate_daily_cap, doc.cv.max_pages], ["premium", 25, 1]);
  assert.deepEqual(out.doc, doc);
});

test("portals: a scalar and a keyword list keep every comment", () => {
  const src = read("templates/portals.example.yml");
  const out = applyYamlChanges(src, [
    { path: ["max_posting_age_days"], value: 30 },
    { path: ["title_filter", "negative"], value: ["Intern", "Junior", "Werkstudent"] },
  ]);
  assert.equal(comments(out.text), comments(src));
  const doc = yaml.load(out.text);
  assert.equal(doc.max_posting_age_days, 30);
  assert.deepEqual(doc.title_filter.negative, ["Intern", "Junior", "Werkstudent"]);
  assert.deepEqual(doc.title_filter.positive, yaml.load(src).title_filter.positive);
});

test("a document that is not a mapping is refused", () => {
  assert.deepEqual(applyYamlChanges("- a\n- b\n", [{ path: ["x"], value: 1 }]), { error: "is not a YAML mapping" });
});

test("a shape the text editors do not place is refused, never rewritten", () => {
  const error = { error: "could not be edited without rewriting the file; edit it by hand" };
  assert.deepEqual(applyYamlChanges("skip_tiers:\n  - intern\n", [{ path: ["skip_tiers"], value: ["mid"] }]), error);
  assert.deepEqual(applyYamlChanges("cv: { max_pages: 2 }\n", [{ path: ["cv", "max_pages"], value: 1 }]), error);
  assert.deepEqual(applyYamlChanges("cv: html\n", [{ path: ["cv", "max_pages"], value: 1 }]), error);
});
