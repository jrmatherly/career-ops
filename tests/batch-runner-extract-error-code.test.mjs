// tests/batch-runner-extract-error-code.test.mjs: batch-runner.sh reads browser-extract's error code from the JSON line of a stderr that also carries plain warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NODE, ROOT } from './helpers.mjs';

const script = readFileSync(join(ROOT, 'batch', 'batch-runner.sh'), 'utf-8').match(/be_code=\$\(node -e '([\s\S]*?)' < "\$be_err"/)?.[1];
const codeOf = (stderr) => {
  const r = spawnSync(NODE, ['-e', script], { input: stderr, encoding: 'utf-8' });
  assert.equal(r.status, 0, r.stderr || String(r.error));
  return r.stdout;
};

test('the error-code reader is still where batch-runner.sh keeps it', () => {
  assert.ok(script, 'be_code=$(node -e ...) was not found in batch/batch-runner.sh');
});

test('a guard warning before the JSON line does not lose the code', () => {
  assert.equal(codeOf('   Blocked request to restricted destination: http://10.0.0.1/x.png (private)\n{"error":"no text","code":"empty_text"}\n'), 'empty_text');
});

test('stderr with no JSON line, or none at all, gives no code', () => {
  assert.equal(codeOf('Blocked request\n'), '');
  assert.equal(codeOf(''), '');
  assert.equal(codeOf('{broken\n'), '');
});
