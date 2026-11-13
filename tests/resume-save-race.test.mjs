import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { acquireDirLock, releaseOrWarn } from '../lib/dir-lock.mjs';
import { resumePath, sha256 } from '../lib/resume/model.mjs';
import { main } from '../resume.mjs';

const EXAMPLE = fileURLToPath(new URL('./fixtures/resume/cv-example-shape.md', import.meta.url));

test('a cv.md write that lands while save waits on the resume.json lock makes save stale instead of being overwritten', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-race-')));
  const savedEnv = { root: process.env.CAREER_OPS_ROOT, dir: process.env.CAREER_OPS_DATA_DIR };
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_DATA_DIR = '';
  try {
    const cvPath = join(root, 'cv.md');
    copyFileSync(EXAMPLE, cvPath);
    assert.equal(await main(['absorb']), 0);
    const draft = JSON.parse(readFileSync(resumePath(root), 'utf8'));
    draft.basics.headline = 'Structured edit';
    writeFileSync(join(root, 'draft.json'), JSON.stringify(draft));
    const opened = readFileSync(cvPath, 'utf8');
    const jsonBefore = readFileSync(resumePath(root), 'utf8');

    const lock = await acquireDirLock(`${resumePath(root)}.lock`, { timeoutMs: 5_000, retryMs: 10, staleMs: 600_000 });
    let pending;
    try {
      pending = main(['save', '--in', join(root, 'draft.json'), '--expected-cv-sha', sha256(opened), '--json']);
      // The markdown editor's save, landing while the structured save waits on the lock.
      writeFileSync(cvPath, `${opened}\nMarkdown edit\n`);
    } finally {
      releaseOrWarn(lock);
    }
    const code = await pending;

    assert.equal(readFileSync(cvPath, 'utf8'), `${opened}\nMarkdown edit\n`, 'the markdown save survives');
    assert.equal(code, 4, 'the structured save is answered stale');
    assert.equal(readFileSync(resumePath(root), 'utf8'), jsonBefore, 'data/resume.json untouched');
  } finally {
    for (const [name, value] of [['CAREER_OPS_ROOT', savedEnv.root], ['CAREER_OPS_DATA_DIR', savedEnv.dir]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
