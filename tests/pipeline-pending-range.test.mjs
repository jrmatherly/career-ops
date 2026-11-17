// tests/pipeline-pending-range.test.mjs: rank-pipeline and sync-batch-input agree on which lines are pending.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingRange } from '../lib/pipeline-sections.mjs';
import { parsePending } from '../sync-batch-input.mjs';
import { parsePendingEntries } from '../rank-pipeline.mjs';

const CASES = [
  ['no heading', '- [ ] https://jobs.example.com/1 | Acme | Eng\n', ['https://jobs.example.com/1']],
  ['row under Processed', '## Pending\n- [ ] https://jobs.example.com/2 | A | E\n## Processed\n- [ ] https://jobs.example.com/3 | B | F\n', ['https://jobs.example.com/2']],
  ['row before Pending', '- [ ] https://jobs.example.com/4 | C | G\n## Pendientes\n- [ ] https://jobs.example.com/5 | D | H\n', ['https://jobs.example.com/5']],
];

for (const [name, text, urls] of CASES) {
  test(`both readers agree: ${name}`, () => {
    assert.deepEqual(parsePending(text).map((e) => e.url), urls, 'sync-batch-input');
    assert.deepEqual(parsePendingEntries(text).map((e) => e.url), urls, 'rank-pipeline');
  });
}

test('pendingRange', () => {
  assert.deepEqual(pendingRange(['# P', '## Pending', 'a', '## Processed', 'b']), { start: 2, end: 3 });
  assert.deepEqual(pendingRange(['a', 'b']), { start: 0, end: 2 });
  assert.deepEqual(pendingRange(['a', '## Processed', 'b']), { start: 0, end: 1 });
});
