// The web's status canonicalizer must agree with the core's for every state, id and alias.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/status-canonical-parity.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";
import { resolveCodeRoot } from "../../src/lib/core/code-root.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = resolveCodeRoot(path.join(HERE, "..", ".."));
// canonicalizeStatus reads states.yml from resolveCodeRoot(process.cwd()), which assumes cwd is web/; the suite runs from the repo root.
process.env.CAREER_OPS_CODE_ROOT = CORE_ROOT;
const CORE = path.join(CORE_ROOT, "tracker-utils.mjs");
const core = fs.existsSync(CORE) ? await import(pathToFileURL(CORE).href) : null;
const { canonicalizeStatus } = await import("../../src/lib/core/states.ts");

test("web canonicalizeStatus matches the core for every spelling of every state", { skip: core ? false : "core tracker-utils.mjs not resolvable" }, () => {
  const states = core.loadCanonicalStates(path.join(CORE_ROOT, "templates", "states.yml"));
  assert.ok(states.length >= 10, "states.yml did not load");
  const inputs = new Set(["", "   ", "unknown status", "TEKLİF", "KABUL EDİLDİ"]);
  for (const s of states) for (const v of [s.label, s.id, ...s.aliases]) {
    for (const spelled of [v, v.toUpperCase(), v.toLocaleUpperCase("tr"), `**${v}**`, `  ${v}  `]) inputs.add(spelled);
  }
  for (const input of inputs) {
    assert.equal(canonicalizeStatus(input), core.resolveCanonicalState(input, states), `disagreed on ${JSON.stringify(input)}`);
  }
});
