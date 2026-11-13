import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { resumePath, sha256 } from '../lib/resume/model.mjs';
import { main } from '../resume.mjs';

const EXAMPLE = fileURLToPath(new URL('./fixtures/resume/cv-example-shape.md', import.meta.url));

test('two structured saves opened on the same cv.md: one is written, the other is answered stale', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-concurrent-')));
  const savedEnv = { root: process.env.CAREER_OPS_ROOT, dir: process.env.CAREER_OPS_DATA_DIR };
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_DATA_DIR = '';
  try {
    const cvPath = join(root, 'cv.md');
    copyFileSync(EXAMPLE, cvPath);
    assert.equal(await main(['absorb']), 0);
    const opened = sha256(readFileSync(cvPath, 'utf8'));
    const headlines = ['Edit from tab one', 'Edit from tab two'];
    const drafts = headlines.map((headline, i) => {
      const draft = JSON.parse(readFileSync(resumePath(root), 'utf8'));
      draft.basics.headline = headline;
      const path = join(root, `draft-${i}.json`);
      writeFileSync(path, JSON.stringify(draft));
      return path;
    });

    const codes = await Promise.all(drafts.map((path) => main(['save', '--in', path, '--expected-cv-sha', opened, '--json'])));

    assert.deepEqual([...codes].sort(), [0, 4], 'one save written, one answered stale');
    const winner = headlines[codes.indexOf(0)];
    const loser = headlines[codes.indexOf(4)];
    const cv = readFileSync(cvPath, 'utf8');
    const stored = JSON.parse(readFileSync(resumePath(root), 'utf8'));
    assert.ok(cv.includes(winner) && !cv.includes(loser), `cv.md holds the written edit only:\n${cv}`);
    assert.equal(stored.basics.headline, winner, 'data/resume.json holds the written edit');
    assert.equal(stored.careerOps.cvSha256, sha256(cv), 'data/resume.json records the cv.md on disk');
    assert.equal(existsSync(`${resumePath(root)}.lock`), false, 'no lock left behind');
  } finally {
    for (const [name, value] of [['CAREER_OPS_ROOT', savedEnv.root], ['CAREER_OPS_DATA_DIR', savedEnv.dir]]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(root, { recursive: true, force: true });
  }
});
