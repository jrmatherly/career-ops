import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingFromGroups, saveInOrder } from "../../src/lib/settings-changes.mjs";

const setting = (over) => ({ id: "A", kind: "env", label: "", help: "", type: "int", value: 10, source: "saved", editable: true, ...over });
const groups = [
  { id: "one", label: "One", settings: [setting({ id: "A" }), setting({ id: "L", type: "list", value: ["a", "b"] }), setting({ id: "LOCKED", editable: false })] },
  { id: "two", label: "Two", settings: [setting({ id: "B", value: 3 })] },
];

test("an untouched form, a restored list and a locked row are not pending changes", () => {
  assert.deepEqual(pendingFromGroups(groups, {}), { count: 0, groups: [] });
  assert.equal(pendingFromGroups(groups, { A: "10", L: ["a", "b"] }).count, 0);
  assert.equal(pendingFromGroups(groups, { LOCKED: "99" }).count, 0);
});

test("an edit and a cleared saved value are pending, grouped in page order", () => {
  assert.deepEqual(pendingFromGroups(groups, { B: "4", A: "" }), {
    count: 2,
    groups: [{ id: "one", changes: { A: null } }, { id: "two", changes: { B: 4 } }],
  });
});

test("saving stops at the first group the server refuses, so the later ones are never sent", async () => {
  const sent = [];
  const send = async (id) => { sent.push(id); return id !== "two"; };
  assert.equal(await saveInOrder(["one", "two", "three"], send), false);
  assert.deepEqual(sent, ["one", "two"]);
  assert.equal(await saveInOrder(["one", "three"], send), true);
});

test("emptying a saved row whose value is already empty is still sent as a reset", () => {
  const saved = [{ id: "one", label: "One", settings: [setting({ id: "E", type: "string", value: "" })] }];
  assert.deepEqual(pendingFromGroups(saved, { E: "" }), { count: 1, groups: [{ id: "one", changes: { E: null } }] });
});
