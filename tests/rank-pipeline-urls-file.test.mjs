// rank-pipeline.mjs --urls-file ranks only the pending rows the file lists.
// The scheduled-scan rank pass passes the rows one job's scan added, so a
// backlog row above them must stay as it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './helpers.mjs';
import { writeFakeCli } from './helpers/fake-cli.mjs';

const BACKLOG = '- [ ] https://example.test/backlog | Backlog Co | Old Role';
const NEW_ONE = '- [ ] https://example.test/new-1 | Acme | Backend Engineer';
const NEW_TWO = '- [ ] https://example.test/new-2 | Beta | Data Engineer';
const PIPELINE = ['## Pending', BACKLOG, NEW_ONE, NEW_TWO, ''].join('\n');

// Scores every posting in the prompt, so any row the ranker was handed shows up in the output.
const FAKE_RANKER = `
const prompt = process.argv[process.argv.indexOf('-p') + 1];
const ids = [...prompt.matchAll(/^(\\d+)\\. company:/gm)].map(m => Number(m[1]));
console.log(JSON.stringify(ids.map(id => ({ id, score: 4, reason: 'fake ranker' }))));
`;

function withRoot(fn) {
  const root = mkdtempSync(join(tmpdir(), 'rank-urls-file-'));
  try {
    mkdirSync(join(root, 'data'));
    mkdirSync(join(root, 'bin'));
    writeFileSync(join(root, 'data', 'pipeline.md'), PIPELINE);
    const ranker = writeFakeCli(join(root, 'bin'), 'fixture-ranker', FAKE_RANKER);
    const run = (...args) => {
      const r = spawnSync(process.execPath, [join(ROOT, 'rank-pipeline.mjs'), ...args], {
        cwd: root,
        env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '', CAREER_OPS_RANK_CLI: ranker },
        encoding: 'utf8',
        timeout: 30_000,
      });
      assert.ifError(r.error);
      return r;
    };
    return fn({ root, run, pipeline: join(root, 'data', 'pipeline.md') });
  } finally {
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('--dry-run ranks only the listed URLs and leaves the backlog row alone', () => {
  withRoot(({ root, run, pipeline }) => {
    const list = join(root, 'urls.txt');
    writeFileSync(list, 'https://EXAMPLE.test/new-2/?utm_source=scan\n\nhttps://example.test/new-1\nhttps://example.test/not-pending\n');
    const r = run('--urls-file', list, '--limit', '5', '--dry-run');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /https:\/\/example\.test\/new-1 \| Acme \| Backend Engineer \| rank: 4\.0\/5 — fake ranker/);
    assert.match(r.stdout, /https:\/\/example\.test\/new-2 \| Beta \| Data Engineer \| rank: 4\.0\/5 — fake ranker/);
    assert.doesNotMatch(r.stdout, /backlog \|.*rank:/, 'the backlog row was handed to the ranker');
    assert.match(r.stdout, /would annotate 2 of 2 selected/);
    assert.equal(readFileSync(pipeline, 'utf8'), PIPELINE, '--dry-run changed data/pipeline.md');
  });
});

test('a live run writes rank segments on the listed rows only', () => {
  withRoot(({ root, run, pipeline }) => {
    const list = join(root, 'urls.txt');
    writeFileSync(list, 'https://example.test/new-1\n');
    const r = run('--urls-file', list, '--limit', '1');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const lines = readFileSync(pipeline, 'utf8').split('\n');
    assert.equal(lines[1], BACKLOG, 'the backlog row changed');
    assert.equal(lines[2], `${NEW_ONE} | rank: 4.0/5 — fake ranker`);
    assert.equal(lines[3], NEW_TWO, 'an unlisted row was ranked');
  });
});

test('a missing --urls-file exits 1 with the usage text and touches nothing', () => {
  withRoot(({ root, run, pipeline }) => {
    const r = run('--urls-file', join(root, 'missing.txt'));
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /--urls-file: cannot read .*missing\.txt \(ENOENT\)/);
    assert.match(r.stderr, /node rank-pipeline\.mjs \[--limit N\] \[--urls-file <path>\]/);
    assert.doesNotMatch(r.stderr, /CLI call failed/);
    assert.equal(readFileSync(pipeline, 'utf8'), PIPELINE);
  });
});
