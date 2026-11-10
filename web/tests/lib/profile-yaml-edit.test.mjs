import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { patchProfileText } from "../../src/lib/profile-yaml-edit.mjs";

const template = readFileSync(new URL("../../../config/profile.example.yml", import.meta.url), "utf8");
const commentLines = (text) => text.split(/\r?\n/).filter((line) => /^\s*#/.test(line));

/** What the routes' merge produces: each section's keys set over the parsed source. */
function merged(source, patch) {
  let doc = {};
  try {
    doc = yaml.load(source) ?? {};
  } catch {
    // js-yaml 5 rejects an empty or comment-only document; the routes seed {} for it.
  }
  for (const [section, values] of Object.entries(patch)) {
    const current = doc[section] && typeof doc[section] === "object" && !Array.isArray(doc[section]) ? doc[section] : {};
    doc[section] = { ...current, ...values };
  }
  return doc;
}

const edit = (source, patch) => patchProfileText(source, patch, merged(source, patch));

test("the shipped template keeps every comment line through a profile and cadence write", () => {
  const patch = {
    candidate: { full_name: "Fixture Candidate", email: "fixture@example.invalid", location: "Fixture City" },
    target_roles: { primary: ["Role One", "Role Two", "Role Three"] },
    compensation: { target_range: "100000-150000", currency: "EUR", location_flexibility: "Remote" },
    followup_cadence: { applied_first_days: 10, applied_max_followups: 3 },
    follow_ups: { enabled: false },
  };
  const out = edit(template, patch);
  assert.ok(out, "the template's shapes are all placed by the line edit");
  assert.deepEqual(commentLines(out), commentLines(template));
  assert.deepEqual(yaml.load(out), merged(template, patch));
  // The commented-out opt-in keys are the ones a yaml.dump write lost.
  assert.match(out, /^ {2}# title: "Senior Backend Engineer"$/m);
  assert.match(out, /^ {2}target_range: "100000-150000" +# Your target total comp$/m);
});

test("only the patched lines change", () => {
  const source = "# header\ncandidate:\n  full_name: Old   # keep me\n  email: old@example.invalid\nother: 1\n";
  const out = edit(source, { candidate: { full_name: "New" } });
  assert.equal(out, "# header\ncandidate:\n  full_name: \"New\"   # keep me\n  email: old@example.invalid\nother: 1\n");
});

test("a # inside a quoted value is not taken for a comment", () => {
  const source = 'candidate:\n  location: "Room #4, Fixture City"\n';
  assert.equal(edit(source, { candidate: { location: "Elsewhere" } }), 'candidate:\n  location: "Elsewhere"\n');
  assert.equal(edit(source, { candidate: { location: "Suite #9" } }), 'candidate:\n  location: "Suite #9"\n');
});

test("a missing key goes after the section's last indented line, before the next section's comments", () => {
  const source = "followup_cadence:\n  applied_first_days: 7\n  # applied_max_followups: 2\n\n# Next section docs\nother: 1\n";
  const out = edit(source, { followup_cadence: { responded_initial_days: 2 } });
  assert.equal(out, "followup_cadence:\n  applied_first_days: 7\n  # applied_max_followups: 2\n  responded_initial_days: 2\n\n# Next section docs\nother: 1\n");
});

test("a missing section is appended at the end", () => {
  assert.equal(edit("candidate:\n  full_name: A\n", { follow_ups: { enabled: false } }), "candidate:\n  full_name: A\n\nfollow_ups:\n  enabled: false\n");
  assert.equal(edit("candidate:\n  full_name: A", { follow_ups: { enabled: true } }), "candidate:\n  full_name: A\n\nfollow_ups:\n  enabled: true\n");
  assert.equal(edit("", { followup_cadence: { applied_first_days: 9 } }), "followup_cadence:\n  applied_first_days: 9\n");
  assert.equal(edit("# only comments\n", { follow_ups: { enabled: false } }), "# only comments\n\nfollow_ups:\n  enabled: false\n");
});

test("an empty section header gets its keys under it", () => {
  const source = "candidate:\n# note\nother: 1\n";
  assert.equal(edit(source, { candidate: { full_name: "A" } }), "candidate:\n  full_name: \"A\"\n# note\nother: 1\n");
});

test("a # inside a quoted inline-list value is not taken for the trailing comment", () => {
  const source = 'target_roles:\n  primary: ["Role #1", \'Role #2\'] # user note\n';
  assert.equal(edit(source, { target_roles: { primary: ["New"] } }), 'target_roles:\n  primary: ["New"] # user note\n');
});

test("a quote inside a plain scalar does not open a quoted scalar", () => {
  for (const name of ["O'Brien", 'John "Jack', "Jo 'Jack"]) {
    const source = `candidate:\n  full_name: ${name} # keep me\n`;
    assert.equal(edit(source, { candidate: { full_name: "New" } }), 'candidate:\n  full_name: "New" # keep me\n', name);
  }
});

test("a quote after a flow-mapping colon still opens a quoted scalar", () => {
  const source = 'candidate:\n  location: {city: "Room #4"} # keep me\n';
  assert.equal(edit(source, { candidate: { location: "Elsewhere" } }), 'candidate:\n  location: "Elsewhere" # keep me\n');
});

test("only a mapping colon starts a scalar inside a flow list", () => {
  for (const flow of ['[a:"b]', '["a":"b #1"]', "[a: 'b #1']", '[{a: "b #1"}]']) {
    const source = `target_roles:\n  primary: ${flow} # keep\n`;
    assert.equal(edit(source, { target_roles: { primary: ["New"] } }), 'target_roles:\n  primary: ["New"] # keep\n', flow);
  }
});

test("a replaced list item's trailing comment is kept as a comment line ahead of the new items", () => {
  const source = 'target_roles:\n  primary:\n    - "Old" # user note\n    - "Role #2"\n';
  assert.equal(edit(source, { target_roles: { primary: ["New"] } }), 'target_roles:\n  primary:\n    # user note\n    - "New"\n');
});

test("any line of a replaced mapping item keeps its trailing comment, and a # in a value is not one", () => {
  const source = 'target_roles:\n  archetypes:\n    - name: "Role #1" # first\n      fit: "primary"   # primary = dream role\n    - name: "Role #2"\n      fit: "Tier #3"\n';
  const out = edit(source, { target_roles: { archetypes: [] } });
  assert.equal(out, "target_roles:\n  archetypes: []\n    # first\n    # primary = dream role\n");
});

test("block list items are replaced, with comments between them kept ahead of the new items", () => {
  const source = "target_roles:\n  primary:\n    - \"Old One\"\n    # a note\n    - \"Old Two\"\n  # after the list\n  archetypes: []\n";
  const out = edit(source, { target_roles: { primary: ["New One", "New Two"] } });
  assert.equal(out, "target_roles:\n  primary:\n    # a note\n    - \"New One\"\n    - \"New Two\"\n  # after the list\n  archetypes: []\n");
});

test("inline, empty, and missing lists are written", () => {
  assert.equal(edit("target_roles:\n  primary: [a, b]  # inline\n", { target_roles: { primary: ["c"] } }), 'target_roles:\n  primary: ["c"]  # inline\n');
  assert.equal(edit("target_roles:\n  primary:\n  - a\n", { target_roles: { primary: ["b"] } }), 'target_roles:\n  primary:\n  - "b"\n');
  assert.equal(edit("target_roles:\n  primary:\n    - a\n", { target_roles: { primary: [] } }), "target_roles:\n  primary: []\n");
  assert.equal(edit("target_roles:\n  other: 1\n", { target_roles: { primary: ["b"] } }), 'target_roles:\n  other: 1\n  primary:\n    - "b"\n');
});

test("CRLF files keep CRLF", () => {
  const source = "# c\r\nfollowup_cadence:\r\n  applied_first_days: 7\r\n";
  assert.equal(edit(source, { followup_cadence: { applied_first_days: 8, applied_max_followups: 1 } }), "# c\r\nfollowup_cadence:\r\n  applied_first_days: 8\r\n  applied_max_followups: 1\r\n");
});

test("a non-default child indent is followed", () => {
  const source = "followup_cadence:\n    applied_first_days: 7\n";
  assert.equal(edit(source, { followup_cadence: { applied_max_followups: 1 } }), "followup_cadence:\n    applied_first_days: 7\n    applied_max_followups: 1\n");
});

test("a list of mappings is replaced whole, nested keys included", () => {
  const source = "target_roles:\n  primary:\n    - name: a\n      level: b\n    - name: c\n      level: d\n  other: e\n";
  assert.equal(edit(source, { target_roles: { primary: ["f"] } }), "target_roles:\n  primary:\n    - \"f\"\n  other: e\n");
  assert.equal(edit(source, { target_roles: { primary: [] } }), "target_roles:\n  primary: []\n  other: e\n");
});

test("shapes the line edit does not place return null, so the route falls back to yaml.dump", () => {
  for (const [shape, source, patch] of [
    ["flow section", "candidate: { full_name: A }\n", { candidate: { full_name: "B" } }],
    ["scalar section", "follow_ups: off\n", { follow_ups: { enabled: true } }],
    ["block scalar value", "candidate:\n  full_name: |\n    A\n", { candidate: { full_name: "B" } }],
    ["mapping value", "candidate:\n  location:\n    city: A\n", { candidate: { location: "B" } }],
    ["document end marker", "candidate:\n  full_name: A\n...\n", { follow_ups: { enabled: true } }],
  ]) {
    const expected = merged(source, patch);
    const out = patchProfileText(source, patch, expected);
    assert.equal(out, null, shape);
  }
});

test("a result that does not parse to the expected document is never returned", () => {
  const source = "candidate:\n  full_name: A\n";
  assert.equal(patchProfileText(source, { candidate: { full_name: "B" } }, { candidate: { full_name: "C" } }), null);
});

const comments = (text) => commentLines(text).length;

test("top-level keys are written in place, after their commented twin, or at the end, keeping every comment", () => {
  const src = template;
  const base = yaml.load(src);
  const out1 = patchProfileText(src, { spend_tier: "premium" }, { ...base, spend_tier: "premium" });
  assert.equal(comments(out1), comments(src));
  assert.match(out1, /^spend_tier: premium\b/m);
  // batch-evaluate-gemini.mjs:91-93 reads exactly this and maps it to a model; a quoted value silently becomes standard
  assert.equal(out1.match(/^[ \t]*spend_tier[ \t]*:[ \t]*(.+)$/m)[1].trim(), "premium");
  assert.equal(patchProfileText("a: 1\n", { session_title: "my title" }, { a: 1, session_title: "my title" }), 'a: 1\nsession_title: "my title"\n');
  assert.equal(patchProfileText("a: 1\n", { x: "yes" }, { a: 1, x: "yes" }), 'a: 1\nx: "yes"\n');
  const out2 = patchProfileText(src, { auto_pdf_score_threshold: 4.2 }, { ...base, auto_pdf_score_threshold: 4.2 });
  assert.equal(comments(out2), comments(src));
  const lines2 = out2.split("\n");
  assert.equal(lines2[lines2.findIndex((l) => /^#\s*auto_pdf_score_threshold:/.test(l)) + 1], "auto_pdf_score_threshold: 4.2");
  // trailing comment survives
  assert.equal(patchProfileText("spend_tier: standard  # cheap\n", { spend_tier: "economy" }, { spend_tier: "economy" }), "spend_tier: economy  # cheap\n");
  // absent everywhere → appended
  assert.equal(patchProfileText("a: 1\n", { page_format: "a4" }, { a: 1, page_format: "a4" }), "a: 1\npage_format: a4\n");
  // CRLF kept
  assert.equal(patchProfileText("a: 1\r\nspend_tier: standard\r\n", { spend_tier: "premium" }, { a: 1, spend_tier: "premium" }), "a: 1\r\nspend_tier: premium\r\n");
  // top-level list, flow style
  assert.equal(patchProfileText("a: 1\n", { skip_tiers: ["intern", "entry"] }, { a: 1, skip_tiers: ["intern", "entry"] }), 'a: 1\nskip_tiers: ["intern", "entry"]\n');
  // a block value under the key is not handled
  assert.equal(patchProfileText("skip_tiers:\n  - intern\n", { skip_tiers: ["mid"] }, { skip_tiers: ["mid"] }), null);
  // a commented twin inside another block falls back to appending
  assert.equal(
    patchProfileText("a:\n  b: 1\n# page_format: a4\n  c: 2\n", { page_format: "a4" }, { a: { b: 1, c: 2 }, page_format: "a4" }),
    "a:\n  b: 1\n# page_format: a4\n  c: 2\npage_format: a4\n",
  );
  // mixed: a top-level key and a section key in one patch
  const out3 = patchProfileText(src, { spend_tier: "economy", cv: { max_pages: 1 } }, { ...base, spend_tier: "economy", cv: { ...base.cv, max_pages: 1 } });
  assert.equal(comments(out3), comments(src));
});
