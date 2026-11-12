import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingChanges } from "../../src/lib/settings-changes.mjs";

test("one changed key in each of two groups is two changes in two groups", () => {
  const saved = { automation: { CAP: 10, SCORE: 3 }, scanner: { AGE: 45 } };
  const draft = { automation: { CAP: 30, SCORE: 3 }, scanner: { AGE: 30 } };
  assert.deepEqual(pendingChanges(draft, saved), {
    count: 2,
    groups: [{ id: "automation", changes: { CAP: 30 } }, { id: "scanner", changes: { AGE: 30 } }],
  });
});

test("a draft equal to the saved values has no changes", () => {
  const saved = { automation: { CAP: 10, LIST: ["a", "b"] } };
  assert.deepEqual(pendingChanges({ automation: { CAP: 10, LIST: ["a", "b"] } }, saved), { count: 0, groups: [] });
});

test("a key changed and changed back is not counted", () => {
  const saved = { automation: { CAP: 10 } };
  const draft = { automation: { CAP: 30 } };
  assert.equal(pendingChanges(draft, saved).count, 1);
  draft.automation.CAP = 10;
  assert.deepEqual(pendingChanges(draft, saved), { count: 0, groups: [] });
});

test("a reset (null) over a saved value is a change, and a list differs by its entries", () => {
  const saved = { automation: { CAP: 10, LIST: ["a"] } };
  const draft = { automation: { CAP: null, LIST: ["a", "b"] } };
  assert.deepEqual(pendingChanges(draft, saved), { count: 2, groups: [{ id: "automation", changes: { CAP: null, LIST: ["a", "b"] } }] });
});
