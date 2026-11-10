// The web picks the agent CLI the user set up in (CAREER_OPS_CLI, written by
// `node remember-cli.mjs`) before falling back to the first installed one, so
// doctor, the scripts and the web agree on one CLI.
//
// Run:  node --experimental-strip-types --test tests/lib/remembered-cli.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickDefaultInstalled, pickUsableCli } from "../../src/lib/cli-pick.mjs";
import { readRememberedCli } from "../../src/lib/remembered-cli.mjs";
import { parseSettings, settingsOff } from "../../../lib/settings-store.mjs";

const { resolveCliId } = await import("../../src/lib/saved-cli.ts");

const TWO = [
  { id: "claude", installed: true },
  { id: "grok", installed: true },
  { id: "codex", installed: false },
];

function root(t, envFile) {
  const dir = mkdtempSync(join(tmpdir(), "co-remembered-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (envFile !== undefined) writeFileSync(join(dir, ".env"), envFile);
  return dir;
}

test("readRememberedCli puts the CLI saved from the Settings page ahead of the shell", (t) => {
  const saved = (text) => {
    const dir = root(t, "CAREER_OPS_CLI=grok\n");
    mkdirSync(join(dir, "config"));
    writeFileSync(join(dir, "config", "settings.json"), text);
    return dir;
  };
  const codex = JSON.stringify({ version: 1, values: { CAREER_OPS_CLI: "codex" } });
  assert.equal(readRememberedCli(saved(codex), {}), "codex");
  assert.equal(readRememberedCli(saved(codex), { CAREER_OPS_CLI: "claude" }), "codex");
  assert.equal(readRememberedCli(saved(codex), { CAREER_OPS_SETTINGS: "OFF", CAREER_OPS_CLI: "claude" }), "claude");
  assert.equal(readRememberedCli(saved("{not json"), { CAREER_OPS_CLI: "claude" }), "claude");
  assert.equal(readRememberedCli(saved("{not json"), {}), "grok");
  assert.equal(readRememberedCli(saved(JSON.stringify({ version: 2, values: { CAREER_OPS_CLI: "codex" } })), {}), "grok");
  assert.equal(readRememberedCli(saved(JSON.stringify({ version: 1, values: { CAREER_OPS_CLI: 7 } })), {}), "grok");
});

test("the saved-CLI read agrees with lib/settings-store.mjs, whose file rules it copies", (t) => {
  const texts = [
    JSON.stringify({ version: 1, values: { CAREER_OPS_CLI: "codex" } }),
    JSON.stringify({ values: { CAREER_OPS_CLI: "codex" } }),
    JSON.stringify({ version: 2, values: { CAREER_OPS_CLI: "codex" } }),
    JSON.stringify({ version: "1", values: { CAREER_OPS_CLI: "codex" } }),
    JSON.stringify({ version: 1, values: ["codex"] }),
    JSON.stringify({ version: 1, values: { CAREER_OPS_CLI: "" } }),
    JSON.stringify({ version: 1 }),
    "null", "[]", "{not json", "",
  ];
  const envs = [{}, { CAREER_OPS_SETTINGS: "off" }, { CAREER_OPS_SETTINGS: " Off " }, { CAREER_OPS_SETTINGS: "0" }, { CAREER_OPS_SETTINGS: "" }];
  for (const text of texts) {
    for (const env of envs) {
      const dir = root(t);
      mkdirSync(join(dir, "config"));
      writeFileSync(join(dir, "config", "settings.json"), text);
      const stored = settingsOff(env) ? undefined : parseSettings(text).values.CAREER_OPS_CLI;
      const expected = typeof stored === "string" && stored ? stored : null;
      assert.equal(readRememberedCli(dir, env), expected, `${text} with ${JSON.stringify(env)}`);
    }
  }
});

test("a saved CLI the overlay put in this process's environment does not outlive its reset", (t) => {
  const mark = (pair) => ({ CAREER_OPS_CLI: "codex", CAREER_OPS_SETTINGS_APPLIED: JSON.stringify({ CAREER_OPS_CLI: pair }) });
  assert.equal(readRememberedCli(root(t, "CAREER_OPS_CLI=grok\n"), mark(["codex", null])), "grok");
  assert.equal(readRememberedCli(root(t), mark(["codex", "claude"])), "claude");
  assert.equal(readRememberedCli(root(t), mark(["kimi", null])), "codex", "the variable changed since the overlay");
  assert.equal(readRememberedCli(root(t), { CAREER_OPS_CLI: "codex", CAREER_OPS_SETTINGS_APPLIED: "{not json" }), "codex");
});

test("readRememberedCli reads CAREER_OPS_CLI from the shell, then the data root .env", (t) => {
  assert.equal(readRememberedCli(root(t, "CAREER_OPS_CLI=grok\n"), {}), "grok");
  assert.equal(readRememberedCli(root(t, 'export CAREER_OPS_CLI="codex"\n'), {}), "codex");
  assert.equal(readRememberedCli(root(t, "CAREER_OPS_CLI=grok\n"), { CAREER_OPS_CLI: "claude" }), "claude");
  assert.equal(readRememberedCli(root(t, "CAREER_OPS_CLI=grok # set at setup\n"), {}), "grok");
  assert.equal(readRememberedCli(root(t, "CAREER_OPS_CLI=codex#note\n"), {}), "codex");
  assert.equal(readRememberedCli(root(t, "CAREER_OPS_CLI='kimi' # quoted\r\n"), {}), "kimi");
  assert.equal(readRememberedCli(root(t, "OTHER=1\n"), {}), null);
  assert.equal(readRememberedCli(root(t), {}), null);
});

test("the Settings default is the remembered CLI while it is installed", () => {
  assert.equal(pickDefaultInstalled(TWO, "grok"), "grok");
  assert.equal(pickDefaultInstalled(TWO, "codex"), "claude");
  assert.equal(pickDefaultInstalled(TWO, null), "claude");
});

test("a stale saved id falls back to the remembered CLI before giving up", () => {
  assert.deepEqual(pickUsableCli("gemini", TWO, "grok"), { id: "grok", substitutedFrom: "gemini" });
  assert.deepEqual(pickUsableCli("gemini", TWO, null), { id: null, substitutedFrom: null });
});

test("with nothing saved, resolveCliId picks and persists the remembered CLI", async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ clis: TWO, remembered: "grok" }) });
  assert.equal(await resolveCliId(), "grok");
  assert.equal(JSON.parse(store.get("career-ops:config")).cliId, "grok");
});
