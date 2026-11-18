// Tests for cleanChips() using Node's built-in test runner.
// Imports directly from clean-chips.mjs (the single source of truth) so the
// test and production code can never drift out of sync.
//
// Run:  node --test tests/lib/clean-chips.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as yaml from "js-yaml";
import { CHIP_CAP, cleanChips, hasChipSeparator, pasteChips, splitChips } from "../../src/lib/clean-chips.mjs";

const split = (text) => splitChips(text);

test("comma-separated → 3 chips", () => {
  const parts = split("Afghanistan, Albania, Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("space-separated → 1 chip (NOT split — by design)", () => {
  const parts = split("Afghanistan Algeria Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan Algeria Algeria"]);
});

test("newline-separated → 3 chips", () => {
  const parts = split("Afghanistan\nAlbania\nAlgeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("semicolon-separated → 3 chips", () => {
  const parts = split("Afghanistan; Albania; Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("tab-separated → 3 chips", () => {
  const parts = split("Afghanistan\tAlbania\tAlgeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("carriage-return-separated → 3 chips", () => {
  const parts = split("Afghanistan\rAlbania\rAlgeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("mixed delimiters → 3 chips", () => {
  const parts = split("Afghanistan, Albania\nAlgeria; Algeria");
  // "Algeria" is duplicated (case-insensitive dedupe collapses it to 1),
  // leaving 3 unique chips: Afghanistan, Albania, Algeria.
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("stray tokens dropped: '*' → 0 chips", () => {
  assert.deepEqual(cleanChips(["*"]), []);
});

test("stray tokens dropped: '***' → 0 chips", () => {
  assert.deepEqual(cleanChips(["***"]), []);
});

test("stray tokens dropped: '---' → 0 chips", () => {
  assert.deepEqual(cleanChips(["---"]), []);
});

test("mixed with stray: 'Afghanistan, *, Albania, ***, Algeria' → 3 chips", () => {
  const parts = split("Afghanistan, *, Albania, ***, Algeria");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania", "Algeria"]);
});

test("empty/whitespace entries dropped: 'Afghanistan, , , Albania' → 2 chips", () => {
  const parts = split("Afghanistan, , , Albania");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "Albania"]);
});

test("deduplication (case-insensitive): 'Afghanistan, Afghanistan, ALBANIA, albania' → 2 chips", () => {
  const parts = split("Afghanistan, Afghanistan, ALBANIA, albania");
  assert.deepEqual(cleanChips(parts), ["Afghanistan", "ALBANIA"]);
});

test("multi-word entries preserved: 'Costa Rica, South Africa, United States' → 3 chips", () => {
  const parts = split("Costa Rica, South Africa, United States");
  assert.deepEqual(cleanChips(parts), ["Costa Rica", "South Africa", "United States"]);
});

test("a pathological paste is still bounded", () => {
  const countries = Array.from({ length: CHIP_CAP + 40 }, (_, i) => `Country${i + 1}`);
  const parts = split(countries.join(","));
  assert.equal(cleanChips(parts).length, CHIP_CAP);
});

// ── the cap must not be smaller than the config it carries ───────────────────

test("the shipped portals.example.yml round-trips without losing keywords", () => {
  // The regression this pair of tests exists for. The cap was 16 and the
  // template ships 37 positives, so seedExploreFilters() read the project's own
  // default and handed the scanner fewer than half of it — while the CLI, on
  // the same file, used all 37. One config, two different searches, no warning.
  const yml = readFileSync(new URL("../../../templates/portals.example.yml", import.meta.url), "utf8");
  const positive = yaml.load(yml)?.title_filter?.positive ?? [];
  assert.ok(positive.length > 16, "template should still be the realistic size this guards");
  assert.equal(cleanChips(positive).length, positive.length);
});

test("adding one chip to an over-16 list appends instead of truncating", () => {
  // filter-builder's commit() cleans [...existing, ...pasted], so the cap
  // applied to a MERGE: at 37 chips, one keystroke kept 16, silently discarded
  // 21, and did not even add the new chip.
  const existing = Array.from({ length: 37 }, (_, i) => `Keyword${i + 1}`);
  const next = cleanChips([...existing, "Inference"]);
  assert.equal(next.length, existing.length + 1);
  assert.ok(next.includes("Inference"), "the chip the user just typed must be there");
  for (const k of existing) assert.ok(next.includes(k), `dropped an existing chip: ${k}`);
});

test("'12345' → 1 chip (has digits)", () => {
  assert.deepEqual(cleanChips(["12345"]), ["12345"]);
});

test("'@' → 0 chips (no letters or digits)", () => {
  assert.deepEqual(cleanChips(["@"]), []);
});

test("null/undefined input → []", () => {
  assert.deepEqual(cleanChips(null), []);
  assert.deepEqual(cleanChips(undefined), []);
});

test("non-array string input wraps to single chip", () => {
  assert.deepEqual(cleanChips("Afghanistan"), ["Afghanistan"]);
});

test("splitChips keeps a comma only when asked", () => {
  assert.deepEqual(cleanChips(splitChips("Remote, US; Atlanta\nAustin")), ["Remote", "US", "Atlanta", "Austin"]);
  assert.deepEqual(cleanChips(splitChips("Remote, US; Atlanta\nAustin", true)), ["Remote, US", "Atlanta", "Austin"]);
  // What a paste runs, whatever the field: a pasted list never becomes one chip.
  assert.deepEqual(cleanChips(splitChips("Atlanta, Alpharetta, Marietta")), ["Atlanta", "Alpharetta", "Marietta"]);
});

test("hasChipSeparator treats a comma as text when commas are kept", () => {
  assert.equal(hasChipSeparator("Remote,"), true);
  assert.equal(hasChipSeparator("Remote,", true), false);
  assert.equal(hasChipSeparator("Remote;", true), true);
  assert.equal(hasChipSeparator("Remote\tUS", true), true);
  assert.equal(hasChipSeparator("New York"), false);
});

test("a paste splits at commas and keeps what was typed before it whole", () => {
  assert.deepEqual(cleanChips(pasteChips("Remote, India", "; Brazil", true)), ["Remote, India", "Brazil"]);
  assert.deepEqual(cleanChips(pasteChips("", "Atlanta, Alpharetta, Marietta", true)), ["Atlanta", "Alpharetta", "Marietta"]);
  assert.deepEqual(cleanChips(pasteChips("New", " York, Boston", true)), ["New York", "Boston"]);
  // Without kept commas the typed text and the paste split as one, as before.
  assert.deepEqual(cleanChips(pasteChips("New", " York, Boston")), ["New York", "Boston"]);
  assert.deepEqual(cleanChips(pasteChips("a, b", "; c")), ["a", "b", "c"]);
});
