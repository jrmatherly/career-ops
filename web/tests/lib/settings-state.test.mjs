// What the Settings page shows for each setting: the effective value, where it
// comes from, and whether it can be changed here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSetting } from "../../../lib/settings-registry.mjs";
import { buildSettingsState, revisionOf, splitChanges } from "../../src/lib/settings-state.mjs";

const SECRET = "fixture-secret-value";
const groups = [{ id: "a", label: "A" }, { id: "keys", label: "Keys" }, { id: "deployment", label: "Deployment" }, { id: "empty", label: "Empty" }];
const settings = [
  { id: "A_ENV", kind: "env", group: "a", label: "A", help: "", type: "int", min: 1, max: 50, default: 10, dotenv: true },
  { id: "A_SECRET", kind: "secret", group: "keys", label: "S", help: "" },
  { id: "A_URL", kind: "readonly", group: "deployment", label: "U", help: "", display: "origin" },
];
const base = { groups, settings, validateSetting, stored: {}, fileError: null, overlayDisabled: false, env: {}, dotenv: {}, profile: null, portals: null, modesDirs: ["modes"], dataRoot: "/data" };
const rowOf = (input, id) => buildSettingsState({ ...base, ...input }).groups.flatMap((g) => g.settings).find((s) => s.id === id);
const pick = ({ value, source, editable, error }) => ({ value, source, editable, error });

test("an env setting takes saved, then environment, then .env, then the default", () => {
  const all = { stored: { A_ENV: 4 }, env: { A_ENV: "7" }, dotenv: { A_ENV: "8" } };
  assert.deepEqual(pick(rowOf(all, "A_ENV")), { value: 4, source: "saved", editable: true, error: undefined });
  assert.deepEqual(pick(rowOf({ ...all, stored: {} }, "A_ENV")), { value: 7, source: "environment", editable: true, error: undefined });
  assert.deepEqual(pick(rowOf({ dotenv: { A_ENV: "8" } }, "A_ENV")), { value: 8, source: "dotenv", editable: true, error: undefined });
  assert.deepEqual(pick(rowOf({}, "A_ENV")), { value: 10, source: "default", editable: true, error: undefined });
  const noDefault = [{ ...settings[0], default: undefined }];
  assert.deepEqual(pick(rowOf({ settings: noDefault }, "A_ENV")), { value: null, source: "unset", editable: true, error: undefined });
  const noDotenv = [{ ...settings[0], dotenv: false }];
  assert.equal(rowOf({ settings: noDotenv, dotenv: { A_ENV: "8" } }, "A_ENV").source, "default", "a reader that never loads .env does not report it");
});

test("a value the registry refuses keeps its raw value and says why", () => {
  assert.deepEqual(pick(rowOf({ stored: { A_ENV: 0 } }, "A_ENV")), { value: 0, source: "saved", editable: true, error: "must be a whole number from 1 to 50" });
  assert.deepEqual(pick(rowOf({ env: { A_ENV: "many" } }, "A_ENV")), { value: "many", source: "environment", editable: true, error: "must be a whole number from 1 to 50" });
});

test("a URL the registry refuses is not shown, since it may carry credentials", () => {
  const url = [{ id: "A_LINK", kind: "env", group: "a", label: "", help: "", type: "url", dotenv: true }];
  for (const input of [{ env: { A_LINK: `https://bob:${SECRET}@pub.example` } }, { dotenv: { A_LINK: `https://bob:${SECRET}@pub.example` } }, { stored: { A_LINK: `https://bob:${SECRET}@pub.example` } }]) {
    const state = buildSettingsState({ ...base, settings: url, ...input });
    assert.equal(state.groups[0].settings[0].value, null);
    assert.match(state.groups[0].settings[0].error, /without credentials/);
    assert.ok(!JSON.stringify(state).includes(SECRET));
  }
});

test("a bool from the environment follows its reader's rule", () => {
  const bool = (on) => [{ id: "A_BOOL", kind: "env", group: "a", label: "B", help: "", type: "bool", default: false, on }];
  assert.equal(rowOf({ settings: bool("nonzero"), env: { A_BOOL: "false" } }, "A_BOOL").value, true);
  assert.equal(rowOf({ settings: bool("nonzero"), env: { A_BOOL: "0" } }, "A_BOOL").value, false);
  assert.equal(rowOf({ settings: bool("words"), env: { A_BOOL: "Yes" } }, "A_BOOL").value, true);
  assert.equal(rowOf({ settings: bool("words"), env: { A_BOOL: "2" } }, "A_BOOL").value, false);
  assert.equal(rowOf({ settings: bool("words"), stored: { A_BOOL: true } }, "A_BOOL").value, true);
});

test("a secret reports where it is set and never its value", () => {
  for (const [input, source] of [[{ env: { A_SECRET: SECRET } }, "environment"], [{ dotenv: { A_SECRET: SECRET } }, "dotenv"], [{}, "unset"]]) {
    const state = buildSettingsState({ ...base, ...input });
    assert.deepEqual(pick(state.groups[1].settings[0]), { value: null, source, editable: false, error: undefined });
    assert.ok(!JSON.stringify(state).includes(SECRET));
  }
});

test("a read-only row shows only what its display allows", () => {
  assert.equal(rowOf({ env: { A_URL: "https://user:pw@gw.example:8317/v1" } }, "A_URL").value, "https://gw.example:8317");
  assert.equal(rowOf({ env: { A_URL: "not a url" } }, "A_URL").value, "set");
  assert.deepEqual(pick(rowOf({}, "A_URL")), { value: null, source: "unset", editable: false, error: undefined });
  const more = [
    { id: "CAREER_OPS_ROOT", kind: "readonly", group: "deployment", label: "", help: "", display: "value" },
    { id: "A_FLAG", kind: "readonly", group: "deployment", label: "", help: "", display: "set" },
    { id: "A_TEXT", kind: "readonly", group: "deployment", label: "", help: "", display: "value" },
  ];
  assert.equal(rowOf({ settings: more }, "CAREER_OPS_ROOT").value, "/data");
  assert.equal(rowOf({ settings: more }, "A_FLAG").value, false);
  assert.equal(rowOf({ settings: more, env: { A_FLAG: "1", A_TEXT: "external" } }, "A_FLAG").value, true);
  assert.equal(rowOf({ settings: more, env: { A_TEXT: "external" } }, "A_TEXT").value, "external");
});

test("a filter block with no enabled key reads the way the scanner reads it", () => {
  const filters = [
    { id: "portals:experience_filter.enabled", kind: "portals", group: "a", label: "", help: "", type: "bool", default: false },
    { id: "portals:visa_filter.enabled", kind: "portals", group: "a", label: "", help: "", type: "bool", default: false },
  ];
  const at = (portals, id) => pick(rowOf({ settings: filters, portals }, id));
  assert.deepEqual(at({ experience_filter: { stretch_years: 1 } }, filters[0].id), { value: true, source: "file", editable: true, error: undefined });
  assert.deepEqual(at({ visa_filter: { enabled: false } }, filters[1].id), { value: false, source: "file", editable: true, error: undefined });
  assert.deepEqual(at({ visa_filter: {} }, filters[1].id), { value: true, source: "file", editable: true, error: undefined });
  assert.deepEqual(at({}, filters[1].id), { value: false, source: "default", editable: true, error: undefined });
  assert.deepEqual(at(null, filters[1].id), { value: false, source: "default", editable: false, error: "portals.yml is missing or unreadable" });
});

test("a profile key is read at its path, and a modes_dir list is left to the file", () => {
  const keys = [
    { id: "profile:cv.max_pages", kind: "profile", group: "a", label: "", help: "", type: "int", min: 1, max: 5 },
    { id: "profile:language.modes_dir", kind: "profile", group: "a", label: "", help: "", type: "enum" },
  ];
  const at = (profile, id) => rowOf({ settings: keys, profile, modesDirs: ["modes", "modes/de"] }, id);
  assert.deepEqual(pick(at({ cv: { max_pages: 1 } }, keys[0].id)), { value: 1, source: "file", editable: true, error: undefined });
  assert.deepEqual(pick(at({ cv: "x" }, keys[0].id)), { value: null, source: "unset", editable: true, error: undefined });
  assert.deepEqual(pick(at(null, keys[0].id)), { value: null, source: "unset", editable: false, error: "config/profile.yml is missing or unreadable" });
  assert.deepEqual(at({ language: { modes_dir: "modes/de" } }, keys[1].id).values, ["modes", "modes/de"]);
  assert.deepEqual(pick(at({ language: { modes_dir: ["modes/de", "modes/zh"] } }, keys[1].id)),
    { value: ["modes/de", "modes/zh"], source: "file", editable: false, error: "set to a list in config/profile.yml; edit it there" });
});

test("with the settings file broken or saved settings off, a saved id shows its environment value and cannot be edited", () => {
  for (const off of [{ fileError: "x" }, { overlayDisabled: true }]) {
    assert.deepEqual(pick(rowOf({ ...off, stored: { A_ENV: 4 }, env: { A_ENV: "7" } }, "A_ENV")), { value: 7, source: "environment", editable: false, error: undefined });
  }
});

test("a group with no settings is left out, and a row keeps its registry fields", () => {
  const state = buildSettingsState(base);
  assert.deepEqual(state.groups.map((g) => g.id), ["a", "keys", "deployment"]);
  assert.equal(state.groups[0].settings[0].max, 50);
});

test("revisionOf fingerprints the text", () => {
  assert.equal(revisionOf(null), "absent");
  assert.match(revisionOf("a"), /^[0-9a-f]{16}$/);
  assert.notEqual(revisionOf("a"), revisionOf("b"));
});

test("splitChanges sorts changes by where they are written and refuses the rest", () => {
  const byId = (id) => ({ A_ENV: { kind: "env" }, "profile:cv.max_pages": { kind: "profile" }, A_SECRET: { kind: "secret" }, A_URL: { kind: "readonly" } })[id];
  assert.deepEqual(splitChanges(JSON.parse('{"A_ENV":1,"profile:cv.max_pages":1,"A_SECRET":"x","A_URL":"y","NOPE":1,"__proto__":1}'), (id) => (Object.hasOwn({ A_ENV: 1, "profile:cv.max_pages": 1, A_SECRET: 1, A_URL: 1 }, id) ? byId(id) : undefined)), {
    env: { A_ENV: 1 }, profile: { "profile:cv.max_pages": 1 }, portals: {},
    errors: JSON.parse('{"A_SECRET":"cannot be changed here","A_URL":"cannot be changed here","NOPE":"is not a setting","__proto__":"is not a setting"}'),
  });
});

test("a list the control cannot show in full is left to the file", () => {
  const tiers = [{ id: "portals:skip_tiers", kind: "portals", group: "a", label: "", help: "", type: "list", maxItems: 4, values: ["intern", "entry"] },
    { id: "portals:title_filter.negative", kind: "portals", group: "a", label: "", help: "", type: "list", maxItems: 9, min: 1, max: 80 }];
  const at = (portals, id) => rowOf({ settings: tiers, portals }, id);
  assert.equal(at({ skip_tiers: ["intern"] }, tiers[0].id).editable, true);
  assert.deepEqual(pick(at({ skip_tiers: ["Intern", "entry"] }, tiers[0].id)),
    { value: ["Intern", "entry"], source: "file", editable: false, error: "holds Intern in portals.yml, which this page cannot show; edit it there" });
  assert.deepEqual(pick(at({ title_filter: { negative: "intern" } }, tiers[1].id)),
    { value: "intern", source: "file", editable: false, error: "is not a list in portals.yml; edit it there" });
  assert.equal(at({}, tiers[0].id).editable, true);
});
