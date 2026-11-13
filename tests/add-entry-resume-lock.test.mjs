import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { releaseOrWarn } from '../lib/dir-lock.mjs';
import { acquireResumeLock } from '../lib/resume/model.mjs';

const cli = fileURLToPath(new URL('../add-entry.mjs', import.meta.url));
const CV = '# Fictional CV\n\n## Projects\n\n- Existing project\n';

function addEntry(root, payload) {
  const input = join(root, 'add.json');
  writeFileSync(input, JSON.stringify(payload));
  const env = { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' };
  delete env.CAREER_OPS_CV;
  delete env.CAREER_OPS_ARTICLE_DIGEST;
  const child = spawn(process.execPath, [cli, input], { env, stdio: 'ignore' });
  return once(child, 'exit').then(([code]) => code);
}

test('a cv.md addition waits while a save holds the resume lock, then lands', async () => {
  const root = mkdtempSync(join(tmpdir(), 'career-ops-add-resume-lock-'));
  try {
    const cv = join(root, 'cv.md');
    writeFileSync(cv, CV);
    const lock = await acquireResumeLock(root);
    let exit;
    try {
      exit = addEntry(root, { cv: { section: 'Projects', dedupKey: 'Lockstep', entry: '- **Lockstep** — fictional project' } });
      await sleep(600);
      assert.equal(readFileSync(cv, 'utf8'), CV, 'nothing is written while the lock is held');
    } finally {
      releaseOrWarn(lock);
    }
    assert.equal(await exit, 0);
    assert.match(readFileSync(cv, 'utf8'), /Lockstep/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
