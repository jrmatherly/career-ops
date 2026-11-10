// The Settings page's form logic: labels, and which rows a Save sends.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SOURCE_LABELS, dirtyChanges, formValue, listText, parseFormValue, parseListText, pluginLine, secretStatus, sourceLabel } from "../../src/lib/settings-form.mjs";

const row = (over) => ({ id: "A", kind: "env", label: "", help: "", type: "int", value: 10, source: "default", editable: true, ...over });

test("source badges read exactly as specified", () => {
  assert.deepEqual(SOURCE_LABELS, { saved: "Saved here", environment: "From environment", dotenv: "From .env", default: "Default", unset: "Not set" });
  for (const [source, label] of Object.entries(SOURCE_LABELS)) assert.equal(sourceLabel(row({ source })), label);
  assert.equal(sourceLabel(row({ kind: "profile", source: "file" })), "From profile.yml");
  assert.equal(sourceLabel(row({ kind: "portals", source: "file" })), "From portals.yml");
});

test("a secret shows only whether and where it is set", () => {
  assert.equal(secretStatus(row({ kind: "secret", source: "environment" })), "Set, from environment");
  assert.equal(secretStatus(row({ kind: "secret", source: "dotenv" })), "Set, from .env");
  assert.equal(secretStatus(row({ kind: "secret", source: "unset" })), "Not set");
});

test("formValue and parseFormValue round-trip each type", () => {
  assert.equal(formValue(row({ value: 10 })), "10");
  assert.equal(formValue(row({ value: null })), "");
  assert.equal(formValue(row({ type: "bool", value: true })), true);
  assert.equal(formValue(row({ type: "bool", value: "yes" })), false);
  assert.deepEqual(formValue(row({ type: "list", value: ["a"] })), ["a"]);
  assert.deepEqual(formValue(row({ type: "list", value: null })), []);
  assert.equal(parseFormValue(row(), " 4 "), 4);
  assert.equal(parseFormValue(row(), "four"), "four");
  assert.equal(parseFormValue(row(), "  "), null);
  assert.equal(parseFormValue(row({ type: "string" }), "42"), "42");
  assert.equal(parseFormValue(row({ type: "bool" }), false), false);
});

test("dirtyChanges sends only rows whose control differs from the loaded value", () => {
  const states = [
    row({ id: "N", value: 10 }),
    row({ id: "SAVED", value: 4, source: "saved" }),
    row({ id: "B", type: "bool", value: false }),
    row({ id: "L", type: "list", value: ["a", "b"], kind: "portals", source: "file" }),
    row({ id: "UNTOUCHED", value: 1 }),
    row({ id: "LOCKED", value: 1, editable: false }),
  ];
  assert.deepEqual(dirtyChanges(states, {}), {});
  assert.deepEqual(dirtyChanges(states, { N: "10", SAVED: "4", B: false, L: ["a", "b"], LOCKED: "2" }), {}, "unchanged, toggled back, same list content, not editable");
  assert.deepEqual(dirtyChanges(states, { N: "12", SAVED: "", B: true, L: ["a"] }), { N: 12, SAVED: null, B: true, L: ["a"] });
  assert.deepEqual(dirtyChanges(states, { N: "" }), {}, "emptying a row with nothing saved is not a reset");
  assert.deepEqual(dirtyChanges(states, { N: "abc" }), { N: "abc" }, "the server explains a value it cannot take");
});

test("a list is typed one entry per line", () => {
  assert.deepEqual(parseListText(" a \n\nb\na\n"), ["a", "b"]);
  assert.deepEqual(parseListText(""), []);
  assert.equal(listText(["a", "b"]), "a\nb");
  const list = row({ id: "L", type: "list", value: ["a", "b"], kind: "portals", source: "file" });
  assert.deepEqual(dirtyChanges([list], { L: "a\nb\n" }), {}, "a list edited and restored is clean");
  assert.deepEqual(dirtyChanges([list], { L: "a\nc" }), { L: ["a", "c"] });
  assert.deepEqual(dirtyChanges([list], { L: "" }), { L: [] }, "emptying a list sends an empty list");
});

test("an entry already in the file keeps a trailing space the textarea cannot show", () => {
  const state = { id: "portals:title_filter.negative", type: "list", editable: true, source: "file", value: ["Java ", "PHP"] };
  assert.deepEqual(parseFormValue(state, "Java\nPHP\n Staff "), ["Java ", "PHP", "Staff"]);
  assert.deepEqual(dirtyChanges([state], { [state.id]: "Java\nPHP" }), {});
  // a YAML number in the list is sent as the text the user sees, which the server accepts
  assert.deepEqual(parseFormValue({ ...state, value: ["Java ", 2024] }, "Java\n2024"), ["Java ", "2024"]);
});

test("emptying a field whose value is in a file is sent, so the server can refuse it on the row", () => {
  const state = { id: "profile:cv.template", kind: "profile", type: "string", editable: true, source: "file", value: "modern" };
  assert.deepEqual(dirtyChanges([state], { [state.id]: " " }), { [state.id]: null });
  assert.deepEqual(dirtyChanges([{ ...state, source: "default" }], { [state.id]: "" }), {});
});

test("a plugin reads On, Off, or Off with the keys it is missing", () => {
  assert.equal(pluginLine({ enabled: true, missingEnv: ["A"] }), "On");
  assert.equal(pluginLine({ enabled: false, missingEnv: ["A", "B"] }), "Off. Missing: A, B");
  assert.equal(pluginLine({ enabled: false, missingEnv: [] }), "Off");
});
