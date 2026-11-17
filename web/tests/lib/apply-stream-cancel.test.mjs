// Leaving the apply page stops the planner.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/apply-stream-cancel.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { readFileSync } from "node:fs";
import "../helpers/web-ts-alias-loader.mjs";
const { runPlanner } = await import("../../src/lib/apply/planner.ts");

test("runPlanner stops its child when the signal aborts", { timeout: 5_000 }, async () => {
  const abort = new AbortController();
  // "gemini" has no fencer, so the argv reaches spawn unchanged; the child just sleeps.
  const spec = { id: "gemini", name: "Gemini", args: () => ["-e", "setTimeout(() => {}, 10_000)"] };
  const run = runPlanner({ cliId: "gemini", spec, binPath: process.execPath, prompt: "x", fieldCount: 1, cwd: os.tmpdir(), t0: Date.now(), log: () => {}, signal: abort.signal });
  setTimeout(() => abort.abort(), 100);
  const result = await run;
  assert.equal(result.code, null);
});

// The routes are Next.js handlers whose stream node cannot drive here; read their wiring.
const read = (p) => readFileSync(new URL(`../../src/app/api/apply/${p}/route.ts`, import.meta.url), "utf8");
test("both apply streams abort on cancel and pass the signal down", () => {
  for (const p of ["prefill", "drive"]) assert.match(read(p), /cancel\(\) \{ abort\.abort\(\); \}/, p);
  assert.match(read("prefill"), /signal: abort\.signal/);
  assert.match(read("drive"), /answers, abort\.signal\)/);
});

test("a cancel stops the planner before it starts, the résumé upload after a drive, and a turn that was cancelled mid-plan", () => {
  assert.match(read("prefill"), /if \(abort\.signal\.aborted\) return;\s+log\(`Planner: /);
  assert.match(read("drive"), /if \(abort\.signal\.aborted\) return;\s+\/\/ Snapshot first\./);
  assert.match(read("drive"), /await finalizeDrivenSession\(s\.id, cliId\);\s+\/\/[^\n]*\n\s+if \(abort\.signal\.aborted\) return;/);
  const drive = readFileSync(new URL("../../src/lib/apply/drive.ts", import.meta.url), "utf8");
  assert.match(drive, /await plannerTurn\([^\n]*\n\s+if \(signal\?\.aborted\) return \{ reached: false, turns: turn, reason: "stopped", steps \};/);
});

