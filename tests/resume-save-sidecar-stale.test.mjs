import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from './helpers.mjs';
import { resumePath, sha256 } from '../lib/resume/model.mjs';

const CLI = fileURLToPath(new URL('../resume.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('./fixtures/resume/cv-example-shape.md', import.meta.url));

function withRoot(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-sidecar-')));
  try {
    copyFileSync(EXAMPLE, join(root, 'cv.md'));
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
});
const cvSha = (root) => sha256(readFileSync(join(root, 'cv.md'), 'utf8'));
const resumeSha = (root) => sha256(readFileSync(resumePath(root), 'utf8'));
const stored = (root) => JSON.parse(readFileSync(resumePath(root), 'utf8'));

function draft(root, name, edit) {
  const data = stored(root);
  edit(data);
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(data));
  return path;
}

const save = (root, path, cv, resume) => run(root, 'save', '--in', path, '--expected-cv-sha', cv, '--expected-resume-sha', resume, '--json');

test('a save that changes nothing cv.md shows still makes a second draft from the same opening stale', () => withRoot((root) => {
  assert.equal(run(root, 'absorb').status, 0);
  const opened = { cv: cvSha(root), resume: resumeSha(root) };
  const hides = draft(root, 'a.json', (d) => { d.sections.experience.items[0].hidden = true; });
  const renames = draft(root, 'b.json', (d) => { d.basics.headline = 'Edit from tab two'; });

  const first = save(root, hides, opened.cv, opened.resume);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(cvSha(root), opened.cv, 'the hidden flag leaves cv.md byte-identical');
  assert.equal(JSON.parse(first.stdout).resumeSha256, resumeSha(root), 'the save reports the sidecar revision it wrote');

  const second = save(root, renames, opened.cv, opened.resume);
  assert.equal(second.status, 4, 'the second draft is stale');
  assert.deepEqual(JSON.parse(second.stdout), { stale: true, written: false, cvSha256: opened.cv, resumeSha256: resumeSha(root) });
  assert.equal(stored(root).sections.experience.items[0].hidden, true, 'the hidden flag survives');
  assert.notEqual(stored(root).basics.headline, 'Edit from tab two', 'the stale draft wrote nothing');
}));

test('a tab that saves, is re-read and saves again with the returned shas is not stale', () => withRoot((root) => {
  assert.equal(run(root, 'absorb').status, 0);
  // absorb stores a new custom section with its id in sectionOrder, so a save that stores it otherwise is rewritten by the next read.
  const adds = draft(root, 'a.json', (d) => {
    d.customSections.push({ ...structuredClone(d.sections.projects), id: 'extra', type: 'projects', title: 'Side work', items: [{ ...structuredClone(d.sections.projects.items[0]), id: 'side-1', name: 'Side project' }] });
  });
  const first = save(root, adds, cvSha(root), resumeSha(root));
  assert.equal(first.status, 0, first.stderr);
  const { cvSha256, resumeSha256 } = JSON.parse(first.stdout);

  const reread = run(root, 'absorb', '--json');
  assert.equal(JSON.parse(reread.stdout).written, false, 'the page re-reading cv.md rewrites nothing');

  const hides = draft(root, 'b.json', (d) => { d.customSections[0].items[0].hidden = true; });
  const second = save(root, hides, cvSha256, resumeSha256);
  assert.equal(second.status, 0, second.stdout);
  assert.equal(stored(root).customSections[0].items[0].hidden, true);
}));

test('save without --expected-resume-sha checks cv.md only', () => withRoot((root) => {
  assert.equal(run(root, 'absorb').status, 0);
  const path = draft(root, 'a.json', (d) => { d.sections.experience.items[0].hidden = true; });
  assert.equal(run(root, 'save', '--in', path, '--expected-cv-sha', cvSha(root), '--json').status, 0);
  assert.equal(run(root, 'save', '--in', path, '--expected-cv-sha', '0'.repeat(64), '--json').status, 4);
}));
