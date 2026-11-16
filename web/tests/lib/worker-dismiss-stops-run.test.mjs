// Dismissing a running worker must stop its run, and its control must say so.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/worker-dismiss-stops-run.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workerDismissLabel } from "../../src/lib/worker-feedback.mjs";

const job = { title: "Evaluate · FixtureCo", subtitle: "Engineer" };

test("the dismiss control says it stops a running worker", () => {
  assert.equal(workerDismissLabel({ ...job, status: "running" }), "Stop and dismiss worker: Evaluate · FixtureCo · Engineer");
  assert.equal(workerDismissLabel({ ...job, status: "done" }), "Dismiss worker: Evaluate · FixtureCo · Engineer");
});

// job-store.tsx is a client component node cannot import; read its wiring, as apply-prefill-wiring.test.mjs does.
const store = readFileSync(new URL("../../src/components/jobs/job-store.tsx", import.meta.url), "utf8");
test("removeJob aborts the run request, and an aborted run reports nothing", () => {
  assert.match(store, /signal: controller\.signal/);
  assert.match(store, /aborts\.current\.get\(id\)\?\.abort\(\)/);
  // First line of finish(): readJobStream turns an aborted read into an error completion, so a guard in the catch never runs.
  assert.match(store, /const finish = \([^)]*\) => \{\n\s*if \(controller\.signal\.aborted\) return;/);
  assert.match(store, /\}\)\(\)\.finally\(\(\) => aborts\.current\.delete\(id\)\);/);
});
