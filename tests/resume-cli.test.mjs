import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { rmSync } from './helpers.mjs';
import { sha256 } from '../lib/resume/model.mjs';
import { listTree } from '../lib/walk-tree.mjs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePayload } from '../lib/cv-payload-schema.mjs';

const CLI = fileURLToPath(new URL('../resume.mjs', import.meta.url));
const EXAMPLE = fileURLToPath(new URL('./fixtures/resume/cv-example-shape.md', import.meta.url));
const SAMPLE = fileURLToPath(new URL('./fixtures/resume/sample.json', import.meta.url));

function withRoot(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-cli-')));
  try {
    return fn(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const run = (root, ...args) => spawnSync(process.execPath, [CLI, ...args], {
  encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
});
const jsonOut = (r) => JSON.parse(r.stdout);
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');
const snapshot = (root) => listTree(root).sort().map((path) => [path, readFileSync(path, 'utf8')]);

test('absorb creates the JSON on a clean cv.md, and a second run is a no-op', () => withRoot((root) => {
  copyFileSync(EXAMPLE, join(root, 'cv.md'));
  const first = run(root, 'absorb', '--json');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(jsonOut(first).lossless, true);
  assert.equal(jsonOut(first).written, true);
  const json = read(root, 'data/resume.json');
  assert.equal(JSON.parse(json).careerOps.cvSha256, sha256(read(root, 'cv.md')));

  const second = run(root, 'absorb', '--json');
  assert.equal(second.status, 0, second.stderr);
  assert.equal(jsonOut(second).kept, 12);
  assert.equal(read(root, 'data/resume.json'), json, 'file bytes unchanged');
  assert.equal(readFileSync(join(root, 'cv.md'), 'utf8'), readFileSync(EXAMPLE, 'utf8'), 'cv.md untouched');
}));

test('a changed-company cv.md makes absorb exit 3 without writing, and pair then makes it save', () => withRoot((root) => {
  copyFileSync(EXAMPLE, join(root, 'cv.md'));
  assert.equal(run(root, 'absorb').status, 0);
  const before = read(root, 'data/resume.json');
  const originalId = JSON.parse(before).sections.experience.items[0].id;
  writeFileSync(join(root, 'cv.md'), read(root, 'cv.md').replace('### TechFin Corp -- Austin, TX', '### TechFin Holdings -- Austin, TX'));

  const refused = run(root, 'absorb', '--json');
  assert.equal(refused.status, 3);
  const report = jsonOut(refused);
  assert.match(report.orphans[0].company, /TechFin Corp/);
  assert.match(report.newEntries[0].company, /TechFin Holdings/);
  assert.equal(report.lossless, false);
  assert.equal(report.written, false);
  assert.equal(read(root, 'data/resume.json'), before, 'nothing written');

  const paired = run(root, 'pair', report.orphans[0].id, report.newEntries[0].id);
  assert.equal(paired.status, 0, paired.stdout + paired.stderr);
  const saved = JSON.parse(read(root, 'data/resume.json'));
  assert.equal(saved.sections.experience.items[0].id, originalId);
  assert.equal(saved.sections.experience.items[0].company, 'TechFin Holdings');
  assert.equal(saved.careerOps.cvSha256, sha256(read(root, 'cv.md')));
}));

test('adopt on a Pandoc-style cv.md prints a diff and writes only with --confirm', () => withRoot((root) => {
  const pandoc = [
    '# CV -- Pat Example', '', '**Email:** pat@example.com', '',
    '## **[Work Experience]{.smallcaps}**', '',
    '### **Acme** --- City', '', '**Title**\\', '**2020 -- 2024**', '', '- Shipped the thing', '',
  ].join('\n');
  writeFileSync(join(root, 'cv.md'), pandoc);
  const dry = run(root, 'adopt');
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /^-## \*\*\[Work Experience\]\{\.smallcaps\}\*\*$/m);
  assert.match(dry.stdout, /^\+## Work Experience$/m);
  assert.match(dry.stdout, /^\+### Acme -- City$/m, 'the # CV line sets the dash');
  assert.equal(read(root, 'cv.md'), pandoc, 'cv.md untouched without --confirm');
  assert.equal(existsSync(join(root, 'data', 'resume.json')), false);

  const confirmed = run(root, 'adopt', '--confirm');
  assert.equal(confirmed.status, 0, confirmed.stderr);
  const cv = read(root, 'cv.md');
  assert.match(cv, /^### Acme -- City\n\n\*\*Title\*\*\n2020 -- 2024\n/m);
  assert.equal(read(root, 'cv.md.bak'), pandoc);
  assert.equal(JSON.parse(read(root, 'data/resume.json')).careerOps.cvSha256, sha256(cv));
}));

test('export payload --in draft.json reads the draft and leaves the root untouched', () => withRoot((root) => {
  const drafts = realpathSync(mkdtempSync(join(tmpdir(), 'career-ops-resume-draft-')));
  try {
    copyFileSync(SAMPLE, join(drafts, 'draft.json'));
    copyFileSync(EXAMPLE, join(root, 'cv.md'));
    const before = snapshot(root);
    const r = run(root, 'export', 'payload', '--in', join(drafts, 'draft.json'), '--json', '--hide', 'skills');
    assert.equal(r.status, 0, r.stderr);
    const { payload, unmapped } = jsonOut(r);
    assert.equal(payload.candidate.name, 'David Kowalski');
    assert.equal('skills' in payload, false);
    assert.ok(unmapped.includes('languages'));
    assert.deepEqual(validatePayload(payload, 'html'), { errors: [], warnings: [] });
    assert.deepEqual(snapshot(root), before);

    const md = run(root, 'export', 'cv-md', '--in', join(drafts, 'draft.json'), '--out', join(drafts, 'out.md'));
    assert.equal(md.status, 0, md.stderr);
    assert.match(readFileSync(join(drafts, 'out.md'), 'utf8'), /^# CV -- David Kowalski$/m);
    assert.deepEqual(snapshot(root), before);
  } finally {
    rmSync(drafts, { recursive: true, force: true });
  }
}));

test('export without --in refuses with exit 3 while the gate fails', () => withRoot((root) => {
  writeFileSync(join(root, 'cv.md'), readFileSync(EXAMPLE, 'utf8').replace('## Professional Summary', 'Stray line.\n\n## Professional Summary'));
  const r = run(root, 'export', 'payload');
  assert.equal(r.status, 3);
  assert.equal(existsSync(join(root, 'data', 'resume.json')), false);
}));

test('save refuses with exit 4 on a stale --expected-cv-sha, and writes cv.md on a fresh one', () => withRoot((root) => {
  copyFileSync(EXAMPLE, join(root, 'cv.md'));
  assert.equal(run(root, 'absorb').status, 0);
  const draft = JSON.parse(read(root, 'data/resume.json'));
  draft.basics.headline = 'ML platform engineer';
  writeFileSync(join(root, 'draft.json'), JSON.stringify(draft));
  const cvBefore = read(root, 'cv.md');
  const jsonBefore = read(root, 'data/resume.json');

  const stale = run(root, 'save', '--in', join(root, 'draft.json'), '--expected-cv-sha', 'f'.repeat(64), '--json');
  assert.equal(stale.status, 4);
  assert.equal(read(root, 'cv.md'), cvBefore, 'cv.md untouched');
  assert.equal(read(root, 'data/resume.json'), jsonBefore, 'data/resume.json untouched');

  const fresh = run(root, 'save', '--in', join(root, 'draft.json'), '--expected-cv-sha', sha256(cvBefore), '--json');
  assert.equal(fresh.status, 0, fresh.stdout + fresh.stderr);
  const cv = read(root, 'cv.md');
  assert.match(cv, /^_ML platform engineer_$/m);
  const saved = JSON.parse(read(root, 'data/resume.json'));
  assert.equal(saved.careerOps.cvSha256, sha256(cv));
  assert.equal('pendingCvSha256' in saved.careerOps, false);
  assert.equal(run(root, 'absorb').status, 0);
}));

test('save after a simulated crash is recognised by the next absorb', () => withRoot((root) => {
  copyFileSync(EXAMPLE, join(root, 'cv.md'));
  assert.equal(run(root, 'absorb').status, 0);
  const data = JSON.parse(read(root, 'data/resume.json'));
  const gen = run(root, 'export', 'cv-md', '--in', join(root, 'data', 'resume.json'));
  const cv = gen.stdout.replace('Full-stack AI engineer', 'Applied AI engineer');
  // The crash: cv.md written, resume.json still carrying pending and the old sha.
  writeFileSync(join(root, 'cv.md'), cv);
  data.summary.content = data.summary.content.replace('Full-stack AI engineer', 'Applied AI engineer');
  data.careerOps.pendingCvSha256 = sha256(cv);
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'resume.json'), JSON.stringify(data, null, 2) + '\n');

  const r = run(root, 'absorb', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(jsonOut(r).recovered, true);
  const saved = JSON.parse(read(root, 'data/resume.json'));
  assert.equal(saved.careerOps.cvSha256, sha256(cv));
  assert.equal('pendingCvSha256' in saved.careerOps, false);
}));

test('usage errors exit 1', () => withRoot((root) => {
  assert.equal(run(root, 'bogus').status, 1);
  assert.equal(run(root, 'absorb').status, 1, 'no cv.md');
}));

test('doctor warns when data/resume.json is behind cv.md', () => withRoot((root) => {
  const doctor = () => {
    const r = spawnSync(process.execPath, [fileURLToPath(new URL('../doctor.mjs', import.meta.url)), '--json'], {
      encoding: 'utf8', env: { ...process.env, CAREER_OPS_ROOT: root, CAREER_OPS_DATA_DIR: '' },
    });
    return JSON.parse(r.stdout).warnings.filter((w) => w.includes('resume.json'));
  };
  copyFileSync(EXAMPLE, join(root, 'cv.md'));
  assert.equal(run(root, 'absorb').status, 0);
  assert.deepEqual(doctor(), []);
  writeFileSync(join(root, 'cv.md'), `${read(root, 'cv.md')}\nA new line.\n`);
  assert.match(doctor()[0] ?? '', /^data\/resume\.json is behind cv\.md; run node resume\.mjs absorb/);
}));
