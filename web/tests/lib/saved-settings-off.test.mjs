// `npm test` preloads tests/helpers/saved-settings-off.mjs, so a config/settings.json
// in the data root never changes what a web test sees through a script it imports.
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dataRoot = mkdtempSync(join(tmpdir(), "co-settings-off-"));
const savedRoot = process.env.CAREER_OPS_ROOT;

after(() => {
  if (savedRoot === undefined) delete process.env.CAREER_OPS_ROOT;
  else process.env.CAREER_OPS_ROOT = savedRoot;
  rmSync(dataRoot, { recursive: true, force: true });
});

test("saved settings are off under the web test script", async () => {
  assert.equal(process.env.CAREER_OPS_SETTINGS, "off");
  mkdirSync(join(dataRoot, "config"));
  writeFileSync(join(dataRoot, "config", "settings.json"), JSON.stringify({ version: 1, values: { CAREER_OPS_RANK_CLI: "codex" } }));
  process.env.CAREER_OPS_ROOT = dataRoot;
  const before = process.env.CAREER_OPS_RANK_CLI;
  await import("../../scripts/scheduled-jobs-runner.mjs");
  assert.equal(process.env.CAREER_OPS_RANK_CLI, before);
});
