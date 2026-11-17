// Every script the run route spawns after the agent finishes carries a Node kill timeout.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/post-run-timeouts.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";
import { spawnGeneratePdf, spawnAtsPdf, markTrackerReady } from "../../src/lib/pdf-render.mjs";
import { persistEvaluation } from "../../src/lib/report-persist.mjs";

// persistEvaluation refuses a report with no Machine Summary before it spawns anything.
const REPORT = `# Evaluation: Acme AI — Senior Engineer

## Machine Summary
\`\`\`yaml
company: "Acme AI"
role: "Senior Engineer"
score: 4.2
via: null
\`\`\`

## A) Role Summary
A role.`;

function recorder(exitCode = 1) {
  const opts = [];
  const spawnFn = (_exec, _args, o) => { opts.push(o); const c = new EventEmitter();
    for (const k of ["stdout", "stderr"]) { c[k] = new EventEmitter(); c[k].setEncoding = () => {}; }
    c.stdin = { write() {}, end() {} }; queueMicrotask(() => c.emit("close", exitCode)); return c; };
  return { opts, spawnFn };
}
const pdf = { execPath: "node", coreRoot: "/core", html: "/x.html", finalPdf: "/x.pdf", format: "a4" };
test("generate-pdf runs get 180 s, mark-pdf-ready and the persist scripts 120 s", async () => {
  for (const run of [spawnGeneratePdf, spawnAtsPdf]) { const r = recorder(); await run({ ...pdf, spawnFn: r.spawnFn }); assert.equal(r.opts[0].timeout, 180_000); }
  const m = recorder(); await markTrackerReady({ spawnFn: m.spawnFn, execPath: "node", coreRoot: "/core", reportNum: "001" });
  assert.equal(m.opts[0].timeout, 120_000);
  const p = recorder(); await persistEvaluation({ spawnFn: p.spawnFn, execPath: "node", root: "/root", markdown: REPORT, url: "https://example.invalid/j", today: "2026-11-16" });
  assert.equal(p.opts[0].timeout, 120_000);
});

// A real child that outlives a 300 ms kill timer, in place of the script, so the
// close handler sees the signal Node's timeout sends.
const outlivesTimer = (_exec, _args, o) => spawn(process.execPath, ["-e", "setTimeout(() => {}, 30_000)"], { ...o, timeout: 300 });
test("a step killed by its timer says it was stopped, and after how long", async () => {
  for (const run of [spawnGeneratePdf, spawnAtsPdf]) {
    const r = await run({ ...pdf, coreRoot: process.cwd(), spawnFn: outlivesTimer });
    assert.equal(r.ok, false);
    assert.match(r.stderr, /PDF rendering was stopped after 180 seconds/);
  }
  const m = await markTrackerReady({ spawnFn: outlivesTimer, execPath: "node", coreRoot: process.cwd(), reportNum: "001" });
  assert.match(m.stderr, /mark-pdf-ready\.mjs was stopped after 120 seconds/);
  const p = await persistEvaluation({ spawnFn: outlivesTimer, execPath: "node", root: process.cwd(), markdown: REPORT, url: "https://example.invalid/j", today: "2026-11-16" });
  assert.equal(p.ok, false);
  assert.match(p.error, /reserve-report-num\.mjs was stopped after 120 seconds/);
});
