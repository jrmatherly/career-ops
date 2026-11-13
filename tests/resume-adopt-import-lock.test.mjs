import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { acquireDirLock, releaseOrWarn } from '../lib/dir-lock.mjs';
import { resumePath } from '../lib/resume/model.mjs';
import { main } from '../resume.mjs';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/resume/${name}`, import.meta.url));

async function withRoot(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-lock-')));
  const saved = { root: process.env.CAREER_OPS_ROOT, dir: process.env.CAREER_OPS_DATA_DIR };
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_DATA_DIR = '';
  try {
    copyFileSync(fixture('cv-example-shape.md'), join(root, 'cv.md'));
    assert.equal(await main(['absorb']), 0);
    await fn(root, join(root, 'cv.md'));
  } finally {
    for (const [name, value] of [['CAREER_OPS_ROOT', saved.root], ['CAREER_OPS_DATA_DIR', saved.dir]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

// The command has read cv.md and is waiting on the lock another save holds; that save then writes cv.md.
async function whileASaveLands(root, cvPath, args, target = cvPath) {
  const opened = readFileSync(target, 'utf8');
  const others = [cvPath, resumePath(root)].filter((f) => f !== target).map((f) => [f, readFileSync(f, 'utf8')]);
  const lock = await acquireDirLock(`${resumePath(root)}.lock`, { timeoutMs: 5_000, retryMs: 10, staleMs: 600_000 });
  let pending;
  try {
    pending = main(args);
    await sleep(300);
    assert.equal(readFileSync(target, 'utf8'), opened, 'nothing is written while another save holds the lock');
    writeFileSync(target, `${opened}\n`);
  } finally {
    releaseOrWarn(lock);
  }
  assert.equal(await pending, 4, 'answered stale');
  assert.equal(readFileSync(target, 'utf8'), `${opened}\n`, 'the save that landed survives');
  for (const [file, text] of others) assert.equal(readFileSync(file, 'utf8'), text, `${file} untouched`);
  assert.deepEqual(readdirSync(root).filter((f) => f.endsWith('.bak')), [], 'no backup of a write that did not happen');
}

test('adopt --confirm waits for the resume lock and refuses when cv.md changed while it waited', () =>
  withRoot((root, cvPath) => whileASaveLands(root, cvPath, ['adopt', '--confirm'])));

test('import --confirm --replace-cv waits for the resume lock and refuses when cv.md changed while it waited', () =>
  withRoot((root, cvPath) => whileASaveLands(root, cvPath, ['import', fixture('json-resume.json'), '--format', 'json-resume', '--confirm', '--replace-cv'])));

test('adopt --confirm with nothing else writing still replaces cv.md and keeps a backup', () =>
  withRoot(async (root, cvPath) => {
    const before = readFileSync(cvPath, 'utf8');
    assert.equal(await main(['adopt', '--confirm']), 0);
    assert.equal(readFileSync(`${cvPath}.bak`, 'utf8'), before);
    assert.equal(await main(['absorb']), 0, 'cv.md and data/resume.json agree afterwards');
  }));

test('adopt and import also refuse when only data/resume.json changed while they waited', async () => {
  await withRoot((root, cvPath) => whileASaveLands(root, cvPath, ['adopt', '--confirm'], resumePath(root)));
  await withRoot((root, cvPath) => whileASaveLands(root, cvPath, ['import', fixture('json-resume.json'), '--format', 'json-resume', '--confirm', '--replace-cv'], resumePath(root)));
});
