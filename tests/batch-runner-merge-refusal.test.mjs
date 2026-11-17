// When the tracker merge refuses an addition or fails, a batch run still
// reconciles the pipeline, runs the checks and prints its summary, and then
// exits non-zero. It keeps a dealbreaker row's report number reserved, since
// the row may not have reached the tracker. The runner's own merge_tracker and
// the end of its main run here against stub scripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { ROOT, getBash, rmSync } from './helpers.mjs';

const runner = readFileSync(join(ROOT, 'batch/batch-runner.sh'), 'utf8').replace(/\r\n/g, '\n');
const mergeTracker = runner.match(/^merge_tracker\(\) \{[\s\S]*?^\}/m)?.[0];
const tailStart = runner.indexOf('  # Merge tracker additions\n');
const tailEnd = runner.indexOf('\n}\n\nmain "$@"');
assert.ok(mergeTracker && tailStart >= 0 && tailEnd > tailStart, 'the runner still has merge_tracker and the end of main');

function run(t, mergeExit) {
  const work = mkdtempSync(join(tmpdir(), 'batch-merge-refusal-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  mkdirSync(join(work, 'project'));
  const stub = (name, body) => writeFileSync(join(work, 'project', name), body);
  stub('merge-tracker.mjs', `process.exitCode = ${mergeExit};\n`);
  stub('reconcile-pipeline.mjs', "import { writeFileSync } from 'node:fs'; writeFileSync('reconciled', '');\n");
  stub('verify-pipeline.mjs', "import { writeFileSync } from 'node:fs'; writeFileSync('verified', '');\n");
  writeFileSync(join(work, 'state.tsv'), 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n1\thttps://jobs.example.test/1\tskipped\ta\tb\t042\t-\tdealbreaker: on site\t0\n');
  writeFileSync(join(work, 'harness.sh'), `set -euo pipefail
cd "$(dirname "$0")"
PROJECT_DIR="$PWD/project"
STATE_FILE="$PWD/state.tsv"
release_report_num() { printf '%s' "$1" > released; }
print_summary() { echo "=== Batch Summary ==="; }
${mergeTracker}
main() {
${runner.slice(tailStart, tailEnd)}
}
main
`);
  const done = spawnSync(getBash(), [join(work, 'harness.sh')], { encoding: 'utf8', timeout: 30_000 });
  return { done, has: (name) => existsSync(join(work, name)) };
}

test('a merge that refuses or fails still gets the reconcile, the checks and the summary, then fails the run', (t) => {
  const { done, has } = run(t, 1);
  assert.equal(done.status, 1, done.stderr);
  assert.ok(has('reconciled') && has('verified'), 'the pipeline is reconciled and checked');
  assert.match(done.stdout, /=== Batch Summary ===/);
  assert.ok(!has('released'), 'the dealbreaker row keeps its report number');
});

test('a clean merge releases the dealbreaker number and the run exits 0', (t) => {
  const { done, has } = run(t, 0);
  assert.equal(done.status, 0, done.stderr);
  assert.ok(has('reconciled') && has('verified') && has('released'));
  assert.match(done.stdout, /=== Batch Summary ===/);
});
