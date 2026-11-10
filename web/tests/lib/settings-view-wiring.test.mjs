// The Settings page's logic is tested in settings-form.test.mjs and
// settings-route.test.mjs. Neither can see whether the components use it: drop
// the fetch, or render an input for a secret, and both still pass. These read
// the sources, in the style of config-form-persist-wiring.test.mjs.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const src = (file) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src", file), "utf8");
const view = src("components/settings/settings-view.tsx");
const row = src("components/settings/setting-row.tsx");
const form = src("components/config-form.tsx");

test("SettingsView loads from and saves to /api/settings with the loaded revision", () => {
  assert.match(view, /fetch\("\/api\/settings", \{ cache: "no-store" \}\)/);
  assert.match(view, /method: "POST"[^\n]*JSON\.stringify\(\{ revision: data\.revision, changes \}\)/);
  assert.match(view, /dirtyChanges\(group\.settings, form\)/);
});

test("a failed load shows the error and Retry, never rows", () => {
  const failed = view.slice(view.indexOf("if (loadError)"), view.indexOf("if (!data)"));
  assert.match(failed, /role="alert"/);
  assert.match(failed, />Retry</);
  assert.doesNotMatch(failed, /SettingRow/);
  assert.ok(view.indexOf("if (loadError)") < view.indexOf("<SettingRow"), "the load-error return comes before any row");
  assert.match(view, /setData\(null\);\s*setLoadError\(/, "a failed reload drops the stale rows");
});

test("a conflict offers Reload, and the off banner reads as specified", () => {
  assert.match(view, /note\?\.kind === "conflict" && <button[^\n]*\bload\(\)[^\n]*>Reload</);
  assert.ok(view.includes("Saved settings are turned off for this server (CAREER_OPS_SETTINGS=off). The values below come from the environment."));
});

test("a secret or a row that cannot be changed gets no control", () => {
  const guard = row.indexOf('if (state.kind === "secret" || state.editable === false');
  assert.notEqual(guard, -1);
  for (const control of ["<input", "<select", 'role="switch"', "<textarea", 'type="checkbox"']) {
    assert.ok(row.indexOf(control) > guard, `${control} is rendered only after the read-only return`);
  }
  assert.match(row, /if \(state\.kind === "secret"\) return secretStatus\(state\)/);
  for (const [name, text] of [["settings-view.tsx", view], ["setting-row.tsx", row]]) {
    assert.doesNotMatch(text, /type="password"/, `${name} has no password field`);
  }
});

test("a number is typed into a text field, so text that is not a number reaches the server as typed", () => {
  assert.doesNotMatch(row, /type="number"|"number" :/);
  assert.match(row, /inputMode=\{state\.type === "int" \? "numeric"/);
});

test("every control is labelled, and a per-setting error is announced", () => {
  assert.match(row, /"aria-labelledby": labelId/);
  assert.match(row, /role="alert"/);
  assert.match(row, /state\.source === "saved" && state\.editable && \(\s*<button[^\n]*onClick=\{onReset\}/);
});

test("saving the AI engine also saves CAREER_OPS_CLI, and the sections reload after it", () => {
  assert.match(form, /changes: \{ CAREER_OPS_CLI: cliId \}/);
  assert.match(form, /if \(cliId\) saveCliForScripts\(cliId\)/, "no POST when no CLI is installed");
  assert.match(form, /window\.dispatchEvent\(new Event\(SETTINGS_SAVED_EVENT\)\)/);
  assert.match(src("lib/settings-form.mjs"), /SETTINGS_SAVED_EVENT = "career-ops:settings-saved"/);
  assert.match(view, /window\.addEventListener\(SETTINGS_SAVED_EVENT, reload\)/);
  assert.match(form, /setCliSaveError\(/, "a failed server-side save is shown");
});

test("the page renders both parts and the nav calls it Settings", () => {
  const page = src("app/config/page.tsx");
  assert.match(page, /<ConfigForm \/>\s*<SettingsView \/>/);
  assert.match(src("lib/nav-items.ts"), /href: "\/config", label: "Settings"/);
  assert.match(form, />Settings<\/h1>/);
});

test("a free list is a textarea with its entry count, and a list of choices is checkboxes", () => {
  const values = row.indexOf('state.type === "list" && state.values');
  assert.notEqual(values, -1);
  assert.ok(row.indexOf('type="checkbox"', values) > values, "checkboxes for a list with values");
  assert.ok(row.indexOf("<textarea", values) > values, "a textarea for a free list");
  assert.match(row, /entries/);
  assert.match(row, /<label[^>]*>\s*<input[^>]*type="checkbox"/, "each checkbox is named by its label");
});

test("a row this page cannot change shows its error, and file rows have no Reset", () => {
  assert.match(row, /\{message && <p role="alert"[^\n]*\{state\.label\} \{message\}/);
  assert.match(row, /state\.source === "saved" && state\.editable/, "only a saved value is reset, and a file row is never saved here");
});

test("Profile preferences names its file and the scanner's file rows sit under their own heading", () => {
  assert.ok(view.includes("Saved to config/profile.yml. Comments in the file are kept."));
  assert.ok(view.includes("Filters (portals.yml)"));
});

test("a save sends every file's revision and keeps the new ones", () => {
  assert.match(src("lib/settings-form.mjs"), /revision: \{ settings: string, profile: string, portals: string \}/);
  assert.match(view, /if \(res\.ok\) \{\s*setData\(body\);/);
});
